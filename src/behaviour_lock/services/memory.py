"""Shared memory tree utilities for the hierarchical knowledge graph."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.models import MemoryNode

CLUSTER_PROMPT = """\
You are organizing source files from a legacy codebase into logical subsystems.

Given the following file nodes (each with a label and summary), group them into \
2-8 subsystems. Each subsystem should represent a coherent area of the codebase \
(e.g., "Authentication", "Database Layer", "API Endpoints", "Frontend Components").

File nodes:
{file_nodes}

Return a JSON array where each element has:
- "subsystem": short name for the subsystem
- "summary": one-sentence description of what this subsystem does
- "file_node_ids": list of file node IDs belonging to this subsystem

Return ONLY the JSON array, no other text.
"""

ROOT_SUMMARY_PROMPT = """\
You are summarizing a software project based on its subsystems.

Subsystems:
{subsystems}

Write a concise 2-3 sentence summary of the overall project based on these subsystems. \
Focus on what the project does and its key components. Return ONLY the summary text.
"""

PICK_SUBSYSTEM_PROMPT = """\
You are placing a new knowledge node into a project's memory tree.

The new node:
- Label: {label}
- Summary: {summary}

Existing subsystems:
{subsystems}

Which subsystem should this node belong to? If none fit well, respond with "new".
Otherwise respond with the subsystem's ID number only.
"""

RESUMMARIZE_PROMPT = """\
You are updating the summary for a node in a project knowledge tree.

Node label: {label}
Node type: {node_type}

Children summaries:
{children}

Write a concise 1-2 sentence summary that captures what this node and its children \
represent. Return ONLY the summary text.
"""

CLASSIFY_INPUT_PROMPT = """\
You are a knowledge triage system for a legacy code migration project.

Decide whether the following user message contains important project knowledge that \
should be persisted as a memory node. Project knowledge includes:
- Technology decisions (languages, frameworks, tools)
- Coding standards and style guides
- Architecture decisions
- Business rules or domain constraints
- Deployment or infrastructure requirements
- Migration strategies or preferences

Casual conversation, questions, greetings, commands, or vague statements are NOT knowledge.

User message:
\"\"\"{message}\"\"\"

If the message contains knowledge worth remembering, respond with a JSON object:
{{"memorize": true, "label": "<short 5-8 word label>", "summary": "<1-2 sentence summary of the knowledge>"}}

If not, respond with:
{{"memorize": false}}

Return ONLY the JSON object, no other text.
"""


def _get_llm_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    )


def _llm_call(prompt: str, max_tokens: int = 1024) -> str | None:
    try:
        client = _get_llm_client()
        model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content.strip()
    except Exception:
        pass
    return None


def attach_knowledge_node(db: Database, rag: RAGStore, label: str, chunk_ids: list[str], summary: str) -> int | None:
    """Create a fact node in the memory tree, auto-picking the best subsystem parent.
    Returns the new node ID, or None if tree has no root."""
    root = db.get_root_node()
    if root is None:
        node = db.add_memory_node(None, "fact", label, summary, chunk_ids)
        rag.tag_chunks_with_node(chunk_ids, node.id)
        return node.id

    subsystems = db.get_children(root.id)
    if not subsystems:
        node = db.add_memory_node(root.id, "fact", label, summary, chunk_ids)
        rag.tag_chunks_with_node(chunk_ids, node.id)
        _emit_linked(db, node, root)
        resummarize_ancestors(db, node.id)
        return node.id

    # Ask LLM to pick the best subsystem
    sub_list = "\n".join(f"- ID {s.id}: {s.label} — {s.summary}" for s in subsystems)
    prompt = PICK_SUBSYSTEM_PROMPT.format(label=label, summary=summary, subsystems=sub_list)
    answer = _llm_call(prompt, max_tokens=64)

    parent_id = root.id  # fallback
    if answer:
        answer = answer.strip().strip('"').strip("'")
        if answer.lower() == "new":
            new_sub = db.add_memory_node(root.id, "subsystem", label, summary)
            parent_id = new_sub.id
        else:
            try:
                chosen_id = int(answer)
                if any(s.id == chosen_id for s in subsystems):
                    parent_id = chosen_id
            except ValueError:
                pass

    node = db.add_memory_node(parent_id, "fact", label, summary, chunk_ids)
    rag.tag_chunks_with_node(chunk_ids, node.id)
    parent_node = db.get_memory_node(parent_id)
    if parent_node:
        _emit_linked(db, node, parent_node)
    resummarize_ancestors(db, node.id)
    return node.id


def _emit_linked(db: Database, child: MemoryNode, parent: MemoryNode) -> None:
    """Fire a 'linked' event on the db callback if set."""
    if db.on_memory_event:
        db.on_memory_event("linked", child, parent)


def resummarize_ancestors(db: Database, node_id: int) -> None:
    """Walk up the tree from node_id, re-summarizing each ancestor from its children."""
    node = db.get_memory_node(node_id)
    if node is None or node.parent_id is None:
        return

    current_id = node.parent_id
    while current_id is not None:
        parent = db.get_memory_node(current_id)
        if parent is None:
            break
        children = db.get_children(current_id)
        if not children:
            break
        children_text = "\n".join(f"- {c.label}: {c.summary}" for c in children)
        prompt = RESUMMARIZE_PROMPT.format(
            label=parent.label,
            node_type=parent.node_type,
            children=children_text,
        )
        new_summary = _llm_call(prompt, max_tokens=256)
        if new_summary:
            db.update_memory_node(current_id, summary=new_summary)
        current_id = parent.parent_id


def cluster_into_subsystems(file_nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """LLM call to group file nodes into subsystems.
    Input: list of {id, label, summary}
    Returns: list of {subsystem, summary, file_node_ids}
    """
    if not file_nodes:
        return []

    nodes_text = "\n".join(f"- ID {n['id']}: {n['label']} — {n['summary']}" for n in file_nodes)
    prompt = CLUSTER_PROMPT.format(file_nodes=nodes_text)
    result = _llm_call(prompt, max_tokens=2048)
    if not result:
        return [
            {"subsystem": "General", "summary": "All project files", "file_node_ids": [n["id"] for n in file_nodes]}
        ]

    # Parse JSON from LLM response
    try:
        # Strip markdown code fences if present
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        clusters = json.loads(cleaned)
        if isinstance(clusters, list):
            return clusters
    except (json.JSONDecodeError, ValueError):
        pass

    return [{"subsystem": "General", "summary": "All project files", "file_node_ids": [n["id"] for n in file_nodes]}]


def summarize_for_root(subsystem_summaries: list[dict[str, str]]) -> str:
    """LLM call to produce a root summary from subsystem summaries.
    Input: list of {name, summary}
    Returns: summary string
    """
    subs_text = "\n".join(f"- {s['name']}: {s['summary']}" for s in subsystem_summaries)
    prompt = ROOT_SUMMARY_PROMPT.format(subsystems=subs_text)
    result = _llm_call(prompt, max_tokens=512)
    return result or "Project knowledge base"


def format_tree_text(tree: dict | None, indent: int = 0) -> str:
    """Recursive text formatter for displaying the memory tree."""
    if tree is None:
        return "(empty memory tree)"

    prefix = "  " * indent
    icon = {"root": "🌳", "subsystem": "📦", "file": "📄", "fact": "💡"}.get(tree["node_type"], "•")
    line = f"{prefix}{icon} [{tree['node_type'].upper()}] {tree['label']}"
    if tree.get("summary"):
        line += f" — {tree['summary']}"
    lines = [line]
    for child in tree.get("children", []):
        lines.append(format_tree_text(child, indent + 1))
    return "\n".join(lines)


def classify_user_input(message: str) -> dict | None:
    """Check if a user message contains project knowledge worth memorizing.
    Returns {label, summary} if yes, None if no."""
    if len(message.strip()) < 15:
        return None
    prompt = CLASSIFY_INPUT_PROMPT.format(message=message)
    result = _llm_call(prompt, max_tokens=256)
    if not result:
        return None
    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and parsed.get("memorize"):
            return {"label": parsed.get("label", "user knowledge"), "summary": parsed.get("summary", message[:200])}
    except (json.JSONDecodeError, ValueError):
        pass
    return None
