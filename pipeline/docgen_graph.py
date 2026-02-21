"""
DocGen Pipeline — LangGraph StateGraph
Scanner → Writer → QA → Proofreader → [awaiting human review]
"""

from __future__ import annotations
from langgraph.graph import StateGraph, END

from models.docgen_state import DocGenState
from pipeline.nodes.docgen_scanner_node import scanner_node
from pipeline.nodes.docgen_writer_node import writer_node
from pipeline.nodes.docgen_qa_node import qa_node
from pipeline.nodes.docgen_proofreader_node import proofreader_node


def _abort_if_error(state: DocGenState) -> str:
    return "end" if state.error else "continue"


def build_docgen_graph():
    g = StateGraph(DocGenState)

    g.add_node("scanner",     scanner_node)
    g.add_node("writer",      writer_node)
    g.add_node("qa",          qa_node)
    g.add_node("proofreader", proofreader_node)

    g.set_entry_point("scanner")

    g.add_conditional_edges("scanner",     _abort_if_error, {"continue": "writer",      "end": END})
    g.add_conditional_edges("writer",      _abort_if_error, {"continue": "qa",          "end": END})
    g.add_conditional_edges("qa",          _abort_if_error, {"continue": "proofreader", "end": END})
    g.add_conditional_edges("proofreader", _abort_if_error, {"continue": END,           "end": END})

    return g.compile()


_graph = build_docgen_graph()


def run_docgen_pipeline(state: DocGenState) -> DocGenState:
    result = _graph.invoke(state)
    return DocGenState(**result) if isinstance(result, dict) else result
