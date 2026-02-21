"""Build context markdown generation for tasks."""

from __future__ import annotations

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.models import MemoryNode


def generate_build_context(db: Database, rag: RAGStore, task_id: int) -> str:
    """Generate build context markdown for a task. Returns the markdown string.
    Raises ValueError if task not found."""
    tasks = db.list_tasks()
    task = next((t for t in tasks if t.id == task_id), None)
    if not task:
        raise ValueError(f"Task T{task_id} not found.")

    req = db.get_requirement(task.requirement_id)
    dep_tasks = [t for t in tasks if t.id in task.dependencies]

    # --- Collect and deduplicate memory nodes ---
    all_ref_ids: list[str] = []
    if req and req.references:
        all_ref_ids.extend(req.references)
    if task.references:
        all_ref_ids.extend(task.references)

    seen: set[int] = set()
    nodes: list[MemoryNode] = []
    for ref in all_ref_ids:
        try:
            nid = int(ref)
            if nid in seen:
                continue
            seen.add(nid)
            node = db.get_memory_node(nid)
            if node:
                nodes.append(node)
        except (ValueError, TypeError):
            pass

    # --- Build markdown ---
    lines = [
        f"# Build Context: T{task.id}",
        "",
        f"## Task: {task.summary}",
        f"**Tags:** {', '.join(tag.value for tag in task.tags)}",
        f"**Dependencies:** {', '.join(f'T{d}' for d in task.dependencies) if task.dependencies else 'None'}",
        "",
        "### Implementation Details",
        task.implementation_details or "_No implementation details provided._",
        "",
    ]

    # Parent requirement (concise reference)
    if req:
        lines.extend(
            [
                f"## Parent Requirement: R{req.id} — {req.summary}",
                req.content,
                "",
            ]
        )

    # Dependency tasks
    if dep_tasks:
        lines.append("## Dependency Tasks")
        for dt in dep_tasks:
            lines.append(f"\n### T{dt.id}: {dt.summary}")
            lines.append(f"**Tags:** {', '.join(tag.value for tag in dt.tags)}")
            lines.append(dt.implementation_details or "_No details._")
        lines.append("")

    # Memory node summaries (deduplicated, concise)
    if nodes:
        lines.append("## Grounding Context")
        lines.append("")
        lines.append("| Node | Label | Summary |")
        lines.append("|------|-------|---------|")
        for node in nodes:
            summary = (node.summary or "").replace("\n", " ").strip()
            if len(summary) > 200:
                summary = summary[:200] + "..."
            lines.append(f"| {node.id} | {node.label} | {summary} |")
        lines.append("")

    # Raw chunks (deduplicated across all nodes)
    if nodes:
        lines.append("## Reference Material")
        for node in nodes:
            chunk_texts = rag.get_chunks_by_ids(node.chunk_ids)
            if not chunk_texts:
                continue
            lines.append(f"\n### Node {node.id}: {node.label}")
            for j, txt in enumerate(chunk_texts, 1):
                lines.append(f"\n**Chunk {j}:**")
                lines.append(f"```\n{txt}\n```")
        lines.append("")

    return "\n".join(lines)
