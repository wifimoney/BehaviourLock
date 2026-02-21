"""
Node 2b: Dead Code Detector
Pure Python — ast + networkx.
Flags unreachable functions, commented-out blocks >5 lines,
and functions with zero callers in the call graph.
Runs after workflow_miner so it can reuse the graph.
"""

from __future__ import annotations
import ast
import re
from pathlib import Path
from typing import Optional

import networkx as nx

from models.state import (
    PipelineState,
    DeadCodeItem,
    DeadCodeReport,
)


def dead_code_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    try:
        wg = state.workflow_graph
        if not wg:
            return state.model_copy(update={
                "error": "dead_code_node requires workflow_graph",
                "current_stage": "dead_code_failed",
            })

        # Rebuild networkx DiGraph from the existing workflow graph
        G = nx.DiGraph()
        for n in wg.nodes:
            G.add_node(n.id)
        for e in wg.edges:
            G.add_edge(e.source, e.target)

        items: list[DeadCodeItem] = []

        # 1) Zero-caller functions: nodes with in-degree 0 that are NOT entrypoints
        entrypoint_ids = set(wg.entrypoints)
        for n in wg.nodes:
            if n.id in entrypoint_ids:
                continue
            if G.in_degree(n.id) == 0:
                items.append(DeadCodeItem(
                    name=n.name,
                    module=n.module,
                    lineno=n.lineno,
                    kind="zero_callers",
                    detail=f"Function '{n.name}' has no callers in the call graph",
                ))

        # 2) Unreachable functions: not reachable from any entrypoint
        reachable: set[str] = set()
        for ep in wg.entrypoints:
            if ep in G:
                reachable |= nx.descendants(G, ep) | {ep}

        for n in wg.nodes:
            if n.id not in reachable and n.id not in entrypoint_ids:
                # Avoid duplicate if already flagged as zero_callers
                already = any(i.name == n.name and i.module == n.module and i.kind == "zero_callers" for i in items)
                if not already:
                    items.append(DeadCodeItem(
                        name=n.name,
                        module=n.module,
                        lineno=n.lineno,
                        kind="unreachable",
                        detail=f"Function '{n.name}' is unreachable from any entrypoint",
                    ))

        # 3) Commented-out blocks >5 lines — scan source files
        repo_path = state.repo_path
        target_module = state.target_module
        items.extend(_find_commented_blocks(repo_path, target_module))

        report = DeadCodeReport(
            items=items,
            total=len(items),
            unreachable_count=sum(1 for i in items if i.kind == "unreachable"),
            zero_caller_count=sum(1 for i in items if i.kind == "zero_callers"),
            commented_block_count=sum(1 for i in items if i.kind == "commented_block"),
        )

        print(f"[dead_code] ✓ {report.total} items: "
              f"{report.zero_caller_count} zero-callers, "
              f"{report.unreachable_count} unreachable, "
              f"{report.commented_block_count} commented blocks")

        return state.model_copy(update={
            "dead_code_report": report,
            "current_stage": "dead_code_detected",
        })

    except Exception as e:
        return state.model_copy(update={
            "error": str(e),
            "current_stage": "dead_code_failed",
        })


def _find_commented_blocks(
    repo_path: str,
    target_module: Optional[str],
) -> list[DeadCodeItem]:
    """Scan Python files for consecutive commented-out lines >5."""
    items: list[DeadCodeItem] = []
    comment_line_re = re.compile(r"^\s*#(?!\s*!)")  # lines starting with # (not shebangs)

    for py_file in Path(repo_path).rglob("*.py"):
        if target_module:
            mod = _file_to_module(py_file, repo_path)
            if target_module not in mod:
                continue

        try:
            lines = py_file.read_text(encoding="utf-8", errors="replace").splitlines()
        except Exception:
            continue

        mod_name = _file_to_module(py_file, repo_path)
        run_start: int | None = None
        run_lines: list[str] = []

        for i, line in enumerate(lines):
            if comment_line_re.match(line) and line.strip() != "#":
                if run_start is None:
                    run_start = i + 1  # 1-indexed
                run_lines.append(line)
            else:
                if run_start is not None and len(run_lines) > 5:
                    snippet = "\n".join(run_lines[:6])
                    items.append(DeadCodeItem(
                        name=f"commented_block_L{run_start}",
                        module=mod_name,
                        lineno=run_start,
                        kind="commented_block",
                        detail=f"Commented-out block ({len(run_lines)} lines)",
                        source_snippet=snippet,
                    ))
                run_start = None
                run_lines = []

        # Handle block at end of file
        if run_start is not None and len(run_lines) > 5:
            snippet = "\n".join(run_lines[:6])
            items.append(DeadCodeItem(
                name=f"commented_block_L{run_start}",
                module=mod_name,
                lineno=run_start,
                kind="commented_block",
                detail=f"Commented-out block ({len(run_lines)} lines)",
                source_snippet=snippet,
            ))

    return items


def _file_to_module(py_file: Path, repo_root: str) -> str:
    rel = py_file.relative_to(repo_root)
    parts = list(rel.parts)
    if parts[-1] == "__init__.py":
        parts = parts[:-1]
    else:
        parts[-1] = parts[-1].replace(".py", "")
    return ".".join(parts) if parts else "root"
