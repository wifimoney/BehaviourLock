"""
BehaviorLock FastAPI Application
All endpoints for the pipeline + individual stage triggers.
"""

from __future__ import annotations
import asyncio
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.state import PipelineState
from pipeline.graph import run_pipeline
from storage.memory import RepoMemory


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
    """Kick off the full 6-stage pipeline for a session."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, f"Session {session_id} not found")

    final_state = await run_pipeline(
        repo_path=session.repo_path,
        target_module=target_module or session.target_module,
    )
    _sessions[session_id] = final_state
    return _state_to_response(final_state)


# ─── Stage-specific endpoints (for incremental UI) ────────────────────────────

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
            "tests_generated": bool(state.test_suite),
            "baseline_run":    bool(state.baseline_run),
            "patch_generated": bool(state.migration_patch),
            "validated":       bool(state.validation_result),
            "report_ready":    bool(state.confidence_report),
        },
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



# ══════════════════════════════════════════════════════════════════════════════
# DOCGEN PIPELINE — 4-agent documentation generator + human-in-the-loop
# ══════════════════════════════════════════════════════════════════════════════

from datetime import datetime, timezone
from models.docgen_state import DocGenState, HumanReview
from pipeline.docgen_graph import run_docgen_pipeline

_docgen_sessions: dict[str, DocGenState] = {}


class DocGenRequest(BaseModel):
    repo_path: str
    target_module: Optional[str] = None


class ApprovalRequest(BaseModel):
    status: str           # "approved" | "rejected" | "revision_requested"
    comment: Optional[str] = None


@app.post("/docgen/run/{session_id}")
async def docgen_run(session_id: str):
    """Trigger the 4-agent doc pipeline on an already-ingested session."""
    pipeline_state = _sessions.get(session_id)
    if not pipeline_state:
        raise HTTPException(404, f"Session {session_id} not found — ingest first")

    doc_state = DocGenState(
        session_id=session_id,
        repo_path=pipeline_state.repo_path,
        target_module=pipeline_state.target_module,
    )
    _docgen_sessions[session_id] = doc_state

    loop = asyncio.get_event_loop()
    result: DocGenState = await loop.run_in_executor(None, run_docgen_pipeline, doc_state)
    _docgen_sessions[session_id] = result

    return {
        "session_id": session_id,
        "stage": result.current_stage,
        "error": result.error,
        "ready_for_review": result.proofread_output.ready_for_review if result.proofread_output else False,
        "qa_score": result.qa_output.qa_score if result.qa_output else None,
        "word_count": result.proofread_output.word_count if result.proofread_output else 0,
    }


@app.post("/docgen/run-direct")
async def docgen_run_direct(req: DocGenRequest):
    """Run docgen without a pre-existing session (CodeWords / external callers)."""
    import uuid
    session_id = str(uuid.uuid4())[:8]

    doc_state = DocGenState(
        session_id=session_id,
        repo_path=req.repo_path,
        target_module=req.target_module,
    )
    _docgen_sessions[session_id] = doc_state

    loop = asyncio.get_event_loop()
    result: DocGenState = await loop.run_in_executor(None, run_docgen_pipeline, doc_state)
    _docgen_sessions[session_id] = result

    return {
        "session_id": session_id,
        "stage": result.current_stage,
        "error": result.error,
        "ready_for_review": result.proofread_output.ready_for_review if result.proofread_output else False,
        "qa_score": result.qa_output.qa_score if result.qa_output else None,
        "word_count": result.proofread_output.word_count if result.proofread_output else 0,
        "preview": (result.proofread_output.final_markdown[:500] + "...") if result.proofread_output else "",
    }


@app.get("/docgen/draft/{session_id}")
def docgen_draft(session_id: str):
    """Get the final proofread markdown (ready for human review)."""
    state = _docgen_sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"DocGen session {session_id} not found")
    if not state.proofread_output:
        raise HTTPException(400, "Pipeline not complete yet")
    return {
        "session_id": session_id,
        "final_markdown": state.proofread_output.final_markdown,
        "word_count": state.proofread_output.word_count,
        "qa_score": state.qa_output.qa_score if state.qa_output else None,
        "changes_made": state.proofread_output.changes_made,
        "issues_found": [i.model_dump() for i in state.qa_output.issues_found] if state.qa_output else [],
        "biz_logic_added": state.qa_output.biz_logic_added if state.qa_output else [],
        "human_review_status": state.human_review.status,
    }


@app.post("/docgen/approve/{session_id}")
def docgen_approve(session_id: str, req: ApprovalRequest):
    """
    Human-in-the-loop approval endpoint.
    POST {"status": "approved"} → marks doc as approved, returns final markdown.
    POST {"status": "rejected", "comment": "..."} → flags for revision.
    POST {"status": "revision_requested", "comment": "..."} → same but with notes.

    This is the endpoint CodeWords (or Discord webhook) calls after you review.
    """
    state = _docgen_sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"DocGen session {session_id} not found")

    valid = {"approved", "rejected", "revision_requested"}
    if req.status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")

    state.human_review = HumanReview(
        status=req.status,
        reviewer_comment=req.comment,
        reviewed_at=datetime.now(timezone.utc).isoformat(),
    )
    _docgen_sessions[session_id] = state

    response = {
        "session_id": session_id,
        "review_status": req.status,
        "reviewed_at": state.human_review.reviewed_at,
    }

    if req.status == "approved" and state.proofread_output:
        response["final_markdown"] = state.proofread_output.final_markdown
        # ── Persist approved doc to memory ────────────────────────────────
        if state.repo_path:
            try:
                mem = RepoMemory(state.repo_path)
                mem.record_approved_doc(session_id, state.proofread_output.final_markdown)
                mem.record_docgen_run(
                    session_id=session_id,
                    qa_score=state.qa_output.qa_score if state.qa_output else None,
                    word_count=state.proofread_output.word_count if state.proofread_output else None,
                    final_markdown=state.proofread_output.final_markdown,
                )
                print(f"[approve] ✓ Approved doc saved to memory for repo: {mem.repo_id}")
            except Exception as mem_err:
                print(f"[approve] ⚠ Memory save failed (non-fatal): {mem_err}")

    return response


@app.get("/docgen/status/{session_id}")
def docgen_status(session_id: str):
    """Lightweight status check — CodeWords polls this."""
    state = _docgen_sessions.get(session_id)
    if not state:
        raise HTTPException(404, f"DocGen session {session_id} not found")
    return {
        "session_id": session_id,
        "stage": state.current_stage,
        "error": state.error,
        "human_review": state.human_review.status,
        "iteration": state.iteration,
    }


# ─── Memory endpoints ─────────────────────────────────────────────────────────

@app.get("/memory/stats")
def memory_stats(repo_path: str):
    """What has B.LOC learned about this repo so far?"""
    try:
        mem = RepoMemory(repo_path)
        return mem.stats()
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/memory/drifts")
def memory_drifts(repo_path: str):
    """All drift patterns observed for this repo across runs."""
    try:
        mem = RepoMemory(repo_path)
        return {"repo_id": mem.repo_id, "drifts": mem.known_drifts()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/memory/runs")
def memory_runs(repo_path: str, limit: int = 10):
    """Migration run history for this repo."""
    try:
        mem = RepoMemory(repo_path)
        return {"repo_id": mem.repo_id, "runs": mem.past_runs(limit)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/memory/docs")
def memory_docs(repo_path: str, limit: int = 5):
    """DocGen history for this repo."""
    try:
        mem = RepoMemory(repo_path)
        return {"repo_id": mem.repo_id, "docgen_history": mem.docgen_history(limit)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/memory/search")
def memory_search(repo_path: str, q: str, kind: str = "functions"):
    """
    Semantic search over memory for this repo.
    kind: functions | drifts | biz_logic | docs
    """
    try:
        mem = RepoMemory(repo_path)
        dispatch = {
            "functions": mem.search_functions,
            "drifts":    mem.search_drifts,
            "biz_logic": mem.search_biz_logic,
            "docs":      mem.search_docs,
        }
        if kind not in dispatch:
            raise HTTPException(400, f"kind must be one of {list(dispatch)}")
        results = dispatch[kind](q)
        return {"repo_id": mem.repo_id, "kind": kind, "query": q, "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


def _state_to_response(state: PipelineState) -> dict:    return {
        "current_stage": state.current_stage,
        "error":         state.error,
        "report":        state.confidence_report.model_dump() if state.confidence_report else None,
        "validation":    state.validation_result.model_dump() if state.validation_result else None,
        "patch_summary": {
            "total_changes": len(state.migration_patch.changes) if state.migration_patch else 0,
            "lint_passed":   state.migration_patch.lint_passed if state.migration_patch else None,
        } if state.migration_patch else None,
    }
