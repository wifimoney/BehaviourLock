"""
Node 2: Workflow Miner
Pure Python — ast + networkx.
Extracts: entry points, call chains, side effects, hidden dependencies.
No LLM needed.
"""

from __future__ import annotations
import ast
import os
from pathlib import Path
from typing import Optional

import networkx as nx

from models.state import PipelineState, WorkflowGraph, CallNode, CallEdge


# Side effect patterns to detect
SIDE_EFFECT_PATTERNS = {
    "file_io":   {"open", "read", "write", "readline", "readlines", "writelines"},
    "env_read":  {"os.environ", "os.getenv", "environ.get"},
    "network":   {"requests.get", "requests.post", "urllib", "httpx", "aiohttp", "socket"},
    "db":        {"execute", "cursor", "commit", "rollback", "session.add", "session.query"},
    "subprocess":{"subprocess.run", "subprocess.call", "os.system", "Popen"},
}

ENTRYPOINT_NAMES = {
    "main", "__main__", "run", "start", "execute", "handle", "process",
    "app", "application", "cli", "entry",
}


def workflow_miner_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    repo_path = state.repo_path
    target_module = state.target_module

    try:
        graph, nodes, edges = _build_call_graph(repo_path, target_module)
        entrypoints = _find_entrypoints(nodes)
        side_effect_paths = _find_side_effect_paths(graph, nodes, entrypoints)

        workflow = WorkflowGraph(
            nodes=nodes,
            edges=edges,
            entrypoints=entrypoints,
            side_effect_paths=side_effect_paths,
        )

        node_count = len(nodes)
        edge_count = len(edges)
        sep_count  = len(side_effect_paths)
        print(f"[workflow_miner] ✓ {node_count} nodes, {edge_count} edges, {sep_count} side-effect paths")

        return state.model_copy(update={
            "workflow_graph": workflow,
            "current_stage": "workflow_mined",
        })

    except Exception as e:
        return state.model_copy(update={"error": str(e), "current_stage": "workflow_miner_failed"})


# ─── AST visitor ──────────────────────────────────────────────────────────────

class _CallVisitor(ast.NodeVisitor):
    def __init__(self, module_name: str):
        self.module_name = module_name
        self.functions: dict[str, dict] = {}   # name -> {lineno, calls, side_effects}
        self._current_fn: Optional[str] = None

    def visit_FunctionDef(self, node: ast.FunctionDef):
        qname = f"{self.module_name}.{node.name}"
        self.functions[qname] = {
            "lineno":      node.lineno,
            "calls":       [],
            "side_effects": [],
        }
        prev = self._current_fn
        self._current_fn = qname
        self.generic_visit(node)
        self._current_fn = prev

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, node: ast.Call):
        if not self._current_fn:
            self.generic_visit(node)
            return

        call_name = _extract_call_name(node)
        if call_name:
            self.functions[self._current_fn]["calls"].append(call_name)

            # Check for side effects
            for effect_type, patterns in SIDE_EFFECT_PATTERNS.items():
                if any(p in call_name for p in patterns):
                    self.functions[self._current_fn]["side_effects"].append(effect_type)

        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        # Catch os.environ access (attribute, not a call)
        if isinstance(node.value, ast.Name) and node.value.id == "os":
            if node.attr in {"environ"}:
                if self._current_fn:
                    self.functions[self._current_fn]["side_effects"].append("env_read")
        self.generic_visit(node)


def _extract_call_name(node: ast.Call) -> Optional[str]:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        parts = []
        curr = node.func
        while isinstance(curr, ast.Attribute):
            parts.append(curr.attr)
            curr = curr.value
        if isinstance(curr, ast.Name):
            parts.append(curr.id)
        return ".".join(reversed(parts))
    return None


# ─── Graph construction ───────────────────────────────────────────────────────

def _build_call_graph(
    repo_path: str,
    target_module: Optional[str],
) -> tuple[nx.DiGraph, list[CallNode], list[CallEdge]]:

    G = nx.DiGraph()
    all_functions: dict[str, dict] = {}

    py_files = list(Path(repo_path).rglob("*.py"))

    for py_file in py_files:
        mod_name = _file_to_module(py_file, repo_path)

        # If a target module is specified, only analyse that file + deps
        if target_module and target_module not in mod_name:
            continue

        try:
            source = py_file.read_text(encoding="utf-8", errors="replace")
            tree = ast.parse(source)
        except SyntaxError:
            # Python 2 syntax — still extract what we can
            source = py_file.read_text(encoding="utf-8", errors="replace")
            try:
                import ast as _ast
                tree = _ast.parse(source, feature_version=(2, 7))
            except Exception:
                continue

        visitor = _CallVisitor(mod_name)
        visitor.visit(tree)
        all_functions.update(visitor.functions)

    # Build nodes
    call_nodes: list[CallNode] = []
    for qname, info in all_functions.items():
        mod, _, fn = qname.rpartition(".")
        node_type = "entrypoint" if fn.lower() in ENTRYPOINT_NAMES else "function"
        if info["side_effects"]:
            node_type = "sideeffect"

        cn = CallNode(
            id=qname,
            name=fn,
            module=mod,
            lineno=info["lineno"],
            node_type=node_type,
            side_effects=list(set(info["side_effects"])),
        )
        call_nodes.append(cn)
        G.add_node(qname, **cn.model_dump())

    # Build edges — match call names to known function ids
    fn_names = {n.name: n.id for n in call_nodes}
    call_edges: list[CallEdge] = []

    for qname, info in all_functions.items():
        for callee_name in info["calls"]:
            # Try exact qname match first, then short name
            callee_id = callee_name if callee_name in G else fn_names.get(callee_name)
            if callee_id and callee_id != qname:
                G.add_edge(qname, callee_id)
                call_edges.append(CallEdge(
                    source=qname,
                    target=callee_id,
                    call_type="direct",
                ))

    return G, call_nodes, call_edges


def _find_entrypoints(nodes: list[CallNode]) -> list[str]:
    return [n.id for n in nodes if n.node_type == "entrypoint" or n.name.lower() in ENTRYPOINT_NAMES]


def _find_side_effect_paths(
    G: nx.DiGraph,
    nodes: list[CallNode],
    entrypoints: list[str],
) -> list[list[str]]:
    se_nodes = {n.id for n in nodes if n.side_effects}
    paths: list[list[str]] = []

    for ep in entrypoints:
        if ep not in G:
            continue
        for se_node in se_nodes:
            if se_node not in G:
                continue
            try:
                for path in nx.all_simple_paths(G, ep, se_node, cutoff=8):
                    paths.append(path)
                    if len(paths) >= 20:  # cap for demo
                        return paths
            except nx.NetworkXError:
                continue

    return paths


def _file_to_module(py_file: Path, repo_root: str) -> str:
    rel = py_file.relative_to(repo_root)
    parts = list(rel.parts)
    if parts[-1] == "__init__.py":
        parts = parts[:-1]
    else:
        parts[-1] = parts[-1].replace(".py", "")
    return ".".join(parts) if parts else "root"
