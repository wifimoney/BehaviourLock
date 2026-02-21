"""
BehaviorLock Pipeline Orchestrator
LangGraph StateGraph wiring all 6 nodes into a sequential pipeline
with conditional edges for error handling.
"""

from __future__ import annotations
from typing import Any

from langgraph.graph import StateGraph, END
from langgraph.graph.state import CompiledStateGraph

from models.state import PipelineState
from pipeline.nodes.ingest_node          import ingest_node
from pipeline.nodes.workflow_miner_node  import workflow_miner_node
from pipeline.nodes.dead_code_node       import dead_code_node
from pipeline.nodes.testgen_node         import testgen_node
from pipeline.nodes.baseline_runner_node import baseline_runner_node
from pipeline.nodes.migrator_node        import migrator_node
from pipeline.nodes.validator_node       import validator_node
from pipeline.nodes.reporter_node        import reporter_node


# ─── Routing ──────────────────────────────────────────────────────────────────

def _route(state: PipelineState) -> str:
    """If any node sets an error, abort the pipeline immediately."""
    return END if state.error else "continue"


# ─── Build graph ──────────────────────────────────────────────────────────────

def build_pipeline() -> CompiledStateGraph:
    # LangGraph requires a dict-based state schema, so we use a thin wrapper
    builder = StateGraph(dict)

    # Register nodes (each wraps our PipelineState node function)
    builder.add_node("ingest",          _wrap(ingest_node))
    builder.add_node("workflow_miner",  _wrap(workflow_miner_node))
    builder.add_node("dead_code",       _wrap(dead_code_node))
    builder.add_node("testgen",         _wrap(testgen_node))
    builder.add_node("baseline_runner", _wrap(baseline_runner_node))
    builder.add_node("migrator",        _wrap(migrator_node))
    builder.add_node("validator",       _wrap(validator_node))
    builder.add_node("reporter",        _wrap(reporter_node))

    # Entry point
    builder.set_entry_point("ingest")

    # Sequential edges with conditional abort on error
    _add_conditional(builder, "ingest",          "workflow_miner")
    _add_conditional(builder, "workflow_miner",  "dead_code")
    _add_conditional(builder, "dead_code",       "testgen")
    _add_conditional(builder, "testgen",         "baseline_runner")
    _add_conditional(builder, "baseline_runner", "migrator")
    _add_conditional(builder, "migrator",        "validator")
    _add_conditional(builder, "validator",       "reporter")

    # Terminal
    builder.add_edge("reporter", END)

    return builder.compile()


def _add_conditional(builder: StateGraph, from_node: str, to_node: str) -> None:
    builder.add_conditional_edges(
        from_node,
        lambda state: END if state.get("error") else to_node,
        {to_node: to_node, END: END},
    )


def _wrap(fn):
    """Wrap a PipelineState → PipelineState function to work with LangGraph's dict state."""
    def _node(state: dict) -> dict:
        ps    = PipelineState(**state)
        result = fn(ps)
        return result.model_dump()
    return _node


# ─── Public API ───────────────────────────────────────────────────────────────

_pipeline: CompiledStateGraph | None = None


def get_pipeline() -> CompiledStateGraph:
    global _pipeline
    if _pipeline is None:
        _pipeline = build_pipeline()
    return _pipeline


async def run_pipeline(repo_path: str, target_module: str | None = None, session_id: str = "") -> PipelineState:
    """Run the full pipeline and return the final PipelineState."""
    pipeline = get_pipeline()

    initial_state = PipelineState(
        session_id=session_id,
        repo_path=repo_path,
        target_module=target_module,
        current_stage="starting",
    ).model_dump()

    final_state_dict = await pipeline.ainvoke(initial_state)
    return PipelineState(**final_state_dict)
