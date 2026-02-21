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


def _state_to_response(state: PipelineState) -> dict:
    return {
        "current_stage": state.current_stage,
        "error":         state.error,
        "report":        state.confidence_report.model_dump() if state.confidence_report else None,
        "validation":    state.validation_result.model_dump() if state.validation_result else None,
        "patch_summary": {
            "total_changes": len(state.migration_patch.changes) if state.migration_patch else 0,
            "lint_passed":   state.migration_patch.lint_passed if state.migration_patch else None,
        } if state.migration_patch else None,
    }
