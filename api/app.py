"""
BehaviorLock FastAPI Application
All endpoints for the pipeline + individual stage triggers.
"""

from __future__ import annotations
import asyncio
from asyncio import Event
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from models.state import PipelineState
from models.docgen_state import DocGenState, HumanReview
from pipeline.graph import run_pipeline
from pipeline.docgen_graph import run_docgen_pipeline


app = FastAPI(
    title="BehaviorLock",
    description="AI modernization copilot that proves behavior is preserved while migrating legacy systems.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for prod
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── In-memory session store (demo-grade) ─────────────────────────────────────
# In prod: replace with Redis or DB
_sessions: dict[str, PipelineState] = {}
_docgen_sessions: dict[str, DocGenState] = {}


# ─── Models ───────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    repo_path: str
    target_module: Optional[str] = None


class SessionResponse(BaseModel):
    session_id: str
    current_stage: str
    error: Optional[str] = None


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "BehaviorLock"}


# ─── Ingest ───────────────────────────────────────────────────────────────────

@app.post("/ingest/upload", summary="Upload a zip file")
async def ingest_upload(file: UploadFile = File(...)):
    """Accept a zip upload, save to temp, return session_id for pipeline run."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "Only .zip files supported")

    tmp_dir = tempfile.mkdtemp(prefix="bloc_upload_")
    zip_path = Path(tmp_dir) / file.filename

    content = await file.read()
    zip_path.write_bytes(content)

    import uuid
    session_id = str(uuid.uuid4())[:8]
    _sessions[session_id] = PipelineState(
        repo_path=str(zip_path),
        current_stage="uploaded",
    )

    return {"session_id": session_id, "filename": file.filename, "size_bytes": len(content)}


@app.post("/ingest/path", summary="Ingest from local path")
async def ingest_path(req: RunRequest):
    """For local dev: point directly at a repo path."""
    import uuid
    session_id = str(uuid.uuid4())[:8]
    _sessions[session_id] = PipelineState(
        repo_path=req.repo_path,
        target_module=req.target_module,
        current_stage="ready",
    )
    return {"session_id": session_id, "repo_path": req.repo_path}


# ─── Full pipeline run ────────────────────────────────────────────────────────

@app.post("/run/{session_id}", summary="Run full pipeline")
async def run_full_pipeline(session_id: str, target_module: Optional[str] = None):
    """Kick off the full 6-stage pipeline for a session (non-blocking)."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, f"Session {session_id} not found")

    async def _task():
        try:
            final_state = await run_pipeline(
                repo_path=session.repo_path,
                target_module=target_module or session.target_module,
            )
            _sessions[session_id] = final_state
        except Exception as e:
            session.error = str(e)
            _sessions[session_id] = session

    asyncio.create_task(_task())
    return {"status": "started", "session_id": session_id}


@app.get("/stream/{session_id}", summary="Stream pipeline progress (SSE)")
async def stream_pipeline(session_id: str, request: Request):
    """Server-Sent Events endpoint for live progress bar."""
    async def event_generator():
        last_stage = None
        while True:
            if await request.is_disconnected():
                break

            state = _sessions.get(session_id)
            if not state:
                yield {"event": "error", "data": f"Session {session_id} not found"}
                break

            if state.current_stage != last_stage or state.error:
                yield {
                    "data": {
                        "stage": state.current_stage,
                        "error": state.error,
                        "done":  state.current_stage == "complete" or bool(state.error)
                    }
                }
                last_stage = state.current_stage

            if state.current_stage == "complete" or state.error:
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


# ─── Stage-specific endpoints (for incremental UI) ────────────────────────────

@app.get("/dead-code/{session_id}", summary="Get dead code report")
def get_dead_code(session_id: str):
    state = _get_state(session_id)
    if not state.dead_code_report:
        raise HTTPException(404, "Dead code analysis not yet run.")
    return state.dead_code_report.model_dump()


@app.get("/graph/{session_id}", summary="Get workflow graph (Cytoscape format)")
def get_graph(session_id: str):
    state = _get_state(session_id)
    if not state.workflow_graph:
        raise HTTPException(404, "Workflow graph not yet generated. Run /run/{session_id} first.")

    wg = state.workflow_graph
    cytoscape = {
        "nodes": [
            {
                "data": {
                    "id":           n.id,
                    "label":        n.name,
                    "module":       n.module,
                    "node_type":    n.node_type,
                    "side_effects": n.side_effects,
                    "lineno":       n.lineno,
                }
            }
            for n in wg.nodes
        ],
        "edges": [
            {
                "data": {
                    "source":    e.source,
                    "target":    e.target,
                    "call_type": e.call_type,
                }
            }
            for e in wg.edges
        ],
        "entrypoints":       wg.entrypoints,
        "side_effect_paths": wg.side_effect_paths,
    }
    return cytoscape


@app.get("/tests/{session_id}", summary="Get generated test suite")
def get_tests(session_id: str):
    state = _get_state(session_id)
    if not state.test_suite:
        raise HTTPException(404, "Test suite not yet generated.")
    return state.test_suite.model_dump()


@app.get("/baseline/{session_id}", summary="Get baseline run results")
def get_baseline(session_id: str):
    state = _get_state(session_id)
    if not state.baseline_run:
        raise HTTPException(404, "Baseline run not yet executed.")
    return state.baseline_run.model_dump()


@app.get("/patch/{session_id}", summary="Get migration patch (unified diff)")
def get_patch(session_id: str):
    state = _get_state(session_id)
    if not state.migration_patch:
        raise HTTPException(404, "Migration patch not yet generated.")
    return state.migration_patch.model_dump()


@app.get("/validation/{session_id}", summary="Get validation results + drift report")
def get_validation(session_id: str):
    state = _get_state(session_id)
    if not state.validation_result:
        raise HTTPException(404, "Validation not yet run.")
    return state.validation_result.model_dump()


@app.get("/report/{session_id}", summary="Get final confidence report")
def get_report(session_id: str):
    state = _get_state(session_id)
    if not state.confidence_report:
        raise HTTPException(404, "Report not yet generated.")
    return state.confidence_report.model_dump()


@app.get("/status/{session_id}", summary="Get pipeline status")
def get_status(session_id: str):
    state = _get_state(session_id)
    return {
        "session_id":    session_id,
        "current_stage": state.current_stage,
        "error":         state.error,
        "stages_done": {
            "ingest":          bool(state.repo_path),
            "workflow_mined":  bool(state.workflow_graph),
            "dead_code":       bool(state.dead_code_report),
            "tests_generated": bool(state.test_suite),
            "baseline_run":    bool(state.baseline_run),
            "patch_generated": bool(state.migration_patch),
            "validated":       bool(state.validation_result),
        "report_ready":    bool(state.confidence_report),
        },
    }


# ─── DocGen Endpoints (B.LOC Linkup) ──────────────────────────────────────────

class DocGenRequest(BaseModel):
    repo_path: str
    target_module: Optional[str] = None


@app.post("/docgen/run-direct", summary="Run DocGen pipeline (direct)")
async def run_docgen_direct(req: DocGenRequest):
    """Kicks off the 4-agent doc generation pipeline."""
    import uuid
    session_id = str(uuid.uuid4())[:8]

    initial_state = DocGenState(
        session_id=session_id,
        repo_path=req.repo_path,
        target_module=req.target_module,
        current_stage="starting"
    )
    _docgen_sessions[session_id] = initial_state

    # Run in background
    async def _task():
        try:
            final_state = await asyncio.to_thread(run_docgen_pipeline, initial_state)
            _docgen_sessions[session_id] = final_state
        except Exception as e:
            initial_state.error = str(e)
            _docgen_sessions[session_id] = initial_state

    asyncio.create_task(_task())

    return {
        "session_id": session_id,
        "stage": "started",
        "message": "DocGen pipeline initiated."
    }


@app.get("/docgen/draft/{session_id}", summary="Get full documentation draft")
async def get_docgen_draft(session_id: str):
    """Fetch the polished markdown and QA results."""
    state = _docgen_sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"DocGen session {session_id} not found")

    if not state.proofread_output:
        return {
            "session_id": session_id,
            "stage": state.current_stage,
            "status": "pending",
            "preview": "Still processing LLM agents..."
        }

    p = state.proofread_output
    qa = state.qa_output
    return {
        "final_markdown":  p.final_markdown,
        "qa_score":       qa.qa_score if qa else 0.0,
        "issues_found":    qa.issues_found if qa else [],
        "biz_logic_added": qa.biz_logic_added if qa else [],
        "word_count":      p.word_count,
        "preview":        p.final_markdown[:500]
    }


@app.post("/docgen/approve/{session_id}", summary="Approve or reject a draft")
async def approve_docgen_draft(session_id: str, review: HumanReview):
    """Final human-in-the-loop approval step."""
    state = _docgen_sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"DocGen session {session_id} not found")

    from datetime import datetime
    review.reviewed_at = datetime.now().isoformat()
    state.human_review = review
    state.current_stage = f"review_{review.status}"

    return {
        "session_id": session_id,
        "status":     review.status,
        "message":    f"Documentation {review.status} successfully."
    }


# ─── Demo: pre-seeded golden session ─────────────────────────────────────────

@app.post("/demo/seed", summary="Seed a demo session with a known repo (hackathon golden path)")
async def seed_demo(repo_path: str = Form(...)):
    """Pre-run the full pipeline on a known repo and cache the result."""
    import uuid
    session_id = "demo"
    final_state = await run_pipeline(repo_path=repo_path)
    _sessions[session_id] = final_state
    return {"session_id": session_id, "verdict": final_state.confidence_report.verdict if final_state.confidence_report else "pending"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_state(session_id: str) -> PipelineState:
    state = _sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"Session {session_id} not found")
    return state


def _state_to_response(state: PipelineState) -> dict:
    return {
        "current_stage": state.current_stage,
        "error":         state.error,
        "report":        state.confidence_report.model_dump() if state.confidence_report else None,
        "validation":    state.validation_result.model_dump() if state.validation_result else None,
        "test_coverage": state.test_suite.coverage_pct if state.test_suite else 0.0,
        "patch_summary": {
            "total_changes": len(state.migration_patch.changes) if state.migration_patch else 0,
            "lint_passed":   state.migration_patch.lint_passed if state.migration_patch else None,
        } if state.migration_patch else None,
    }


# ─── Static files (frontend dashboard) ──────────────────────────────────────
# Must be mounted AFTER all API routes so /api routes take precedence
app.mount("/", StaticFiles(directory=str(Path(__file__).parent.parent / "frontend"), html=True), name="frontend")
