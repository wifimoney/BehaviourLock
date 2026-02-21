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

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from models.state import PipelineState
from pipeline.graph import get_pipeline
from pipeline.nodes.ingest_node import ingest_node
from pipeline.nodes.workflow_miner_node import workflow_miner_node
from pipeline.nodes.dead_code_node import dead_code_node
from pipeline.nodes.testgen_node import testgen_node
from pipeline.nodes.baseline_runner_node import baseline_runner_node
from pipeline.nodes.risk_gate_node import risk_gate_node
from pipeline.nodes.migrator_node import migrator_node
from pipeline.nodes.validator_node import validator_node
from pipeline.nodes.reporter_node import reporter_node
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


# ─── Frontend ─────────────────────────────────────────────────────────────────

@app.get("/")
async def serve_index():
    return FileResponse(Path("frontend/index.html"))

# Serve CSS and JS directories
app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")


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

    # Update session_id in the state itself
    session.session_id = session_id

    async def _task():
        try:
            pipeline = get_pipeline()
            initial_state = PipelineState(
                session_id=session_id,
                repo_path=session.repo_path,
                target_module=target_module or session.target_module,
                current_stage="starting",
            ).model_dump()

            # Stream the pipeline to get incremental updates
            async for event in pipeline.astream(initial_state, stream_mode="updates"):
                # event is a dict mapping node_name -> output_state
                for node_name, output_state in event.items():
                    print(f"[api] Node {node_name} finished")
                    _sessions[session_id] = PipelineState(**output_state)
        except Exception as e:
            print(f"[api] Pipeline Error: {e}")
            session.error = str(e)
            _sessions[session_id] = session

    asyncio.create_task(_task())
    return {"status": "started", "session_id": session_id}


@app.get("/stream/{session_id}", summary="Stream pipeline progress (SSE)")
async def stream_pipeline(session_id: str, request: Request):
    """Server-Sent Events endpoint for live progress bar."""
    async def event_generator():
        last_stage = None
        last_drift_count = None
        while True:
            if await request.is_disconnected():
                break

            state = _sessions.get(session_id)
            if not state:
                yield {"event": "error", "data": f"Session {session_id} not found"}
                break

            if state.current_stage != last_stage or state.error:
                event_data = {
                    "stage": state.current_stage,
                    "error": state.error,
                    "done":  state.current_stage == "complete" or bool(state.error),
                }

                # Emit risk assessment when risk gate completes
                if state.risk_assessment and state.current_stage in ("risk_analyzed", "risk_blocked"):
                    ra = state.risk_assessment
                    event_data["risk"] = {
                        "risk_score": ra.risk_score,
                        "risk_level": ra.risk_level,
                        "warnings": [w.model_dump() for w in ra.warnings],
                        "blocked": state.current_stage == "risk_blocked",
                    }

                # Treat risk_blocked as SSE terminal state (pipeline paused)
                if state.current_stage == "risk_blocked":
                    event_data["done"] = True

                yield {"data": event_data}
                last_stage = state.current_stage

            # Emit live drift counts during validation
            if state.validation_result:
                drift_count = (state.validation_result.critical_drift_count +
                               state.validation_result.non_critical_drift_count)
                if drift_count != last_drift_count:
                    yield {"data": {
                        "stage": state.current_stage,
                        "drifts": {
                            "total": drift_count,
                            "critical": state.validation_result.critical_drift_count,
                            "non_critical": state.validation_result.non_critical_drift_count,
                        },
                    }}
                    last_drift_count = drift_count

            if state.current_stage == "complete" or state.error or state.current_stage == "risk_blocked":
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())


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


@app.get("/dead-code/{session_id}", summary="Get dead code report")
def get_dead_code(session_id: str):
    state = _get_state(session_id)
    if not state.dead_code_report:
        raise HTTPException(404, "Dead code report not yet generated.")
    return state.dead_code_report.model_dump()


@app.get("/baseline/{session_id}", summary="Get baseline run results")
def get_baseline(session_id: str):
    state = _get_state(session_id)
    if not state.baseline_run:
        raise HTTPException(404, "Baseline run not yet executed.")
    return state.baseline_run.model_dump()


@app.get("/risk/{session_id}", summary="Get risk assessment")
def get_risk(session_id: str):
    state = _get_state(session_id)
    if not state.risk_assessment:
        raise HTTPException(404, "Risk assessment not yet computed.")
    return state.risk_assessment.model_dump()


@app.post("/override-risk/{session_id}", summary="Override risk block and continue pipeline")
async def override_risk(session_id: str):
    """Override a risk-blocked pipeline and run remaining stages."""
    state = _get_state(session_id)
    if state.current_stage != "risk_blocked":
        raise HTTPException(400, f"Session is not risk-blocked (current stage: {state.current_stage})")

    state.current_stage = "risk_overridden"
    _sessions[session_id] = state

    async def _resume():
        try:
            # Run remaining nodes sequentially: migrator → validator → reporter
            ps = state
            for node_fn in [migrator_node, validator_node, reporter_node]:
                ps = node_fn(ps)
                _sessions[session_id] = ps
                if ps.error:
                    break
        except Exception as e:
            ps.error = str(e)
            _sessions[session_id] = ps

    asyncio.create_task(_resume())
    return {"status": "overridden", "session_id": session_id}


@app.post("/apply/{session_id}", summary="Apply migration changes back to source")
async def apply_migration(session_id: str):
    """Overwrite the original repo files with the migrated ones."""
    state = _get_state(session_id)
    if not state.migrated_repo_path:
        raise HTTPException(404, "No migration available to apply.")

    # Safety check: avoid applying if we have critical drifts and no override?
    # For hackathon: just do it!
    src = Path(state.migrated_repo_path)
    dst = Path(state.repo_path)

    try:
        # Copy migrated files back (excluding _bloc_tests which might have drifted/been temp)
        # Actually, let's just copy everything non-hidden back
        for item in src.rglob("*"):
            if item.is_file() and "_bloc_tests" not in str(item):
                rel = item.relative_to(src)
                target = dst / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)
        
        return {"status": "applied", "repo_path": state.repo_path}
    except Exception as e:
        raise HTTPException(500, f"Failed to apply migration: {e}")


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
            "risk_assessed":   bool(state.risk_assessment),
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
from models.docgen_state import DocGenState, DocGenRequest, HumanReview, ApprovalRequest
from pipeline.docgen_graph import run_docgen_pipeline
from utils.notifications import send_discord_notification

_docgen_sessions: dict[str, DocGenState] = {}




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

    # ── Notify Discord ────────────────────────────────────────────────
    if not result.error and result.proofread_output:
        asyncio.create_task(send_discord_notification(
            session_id=session_id,
            qa_score=result.qa_output.qa_score if result.qa_output else 0,
            word_count=result.proofread_output.word_count,
            preview=result.proofread_output.final_markdown[:500],
            ngrok_url=os.environ.get("BASE_URL", "http://localhost:8000")
        ))

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

    # ── Notify Discord ────────────────────────────────────────────────
    if not result.error and result.proofread_output:
        asyncio.create_task(send_discord_notification(
            session_id=session_id,
            qa_score=result.qa_output.qa_score if result.qa_output else 0,
            word_count=result.proofread_output.word_count,
            preview=result.proofread_output.final_markdown[:500],
            ngrok_url=os.environ.get("BASE_URL", "http://localhost:8000")
        ))

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
