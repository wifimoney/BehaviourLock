"""Chat agent using OpenRouter (OpenAI-compatible) with tool calling."""

from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.prompts import PLAN_GENERATION_PROMPT, SYSTEM_PROMPT
from behaviour_lock.services.memory import attach_knowledge_node, format_tree_text

MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_memory_tree",
            "description": (
                "Get the full memory tree structure showing the project's knowledge hierarchy. "
                "Returns a tree with root → subsystems → files/facts, each with summaries. "
                "Use this for orientation before diving into specific nodes."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_memory_node",
            "description": (
                "Get full details of a specific memory node by ID, including its summary "
                "and the actual text content from its linked RAG chunks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "node_id": {"type": "integer", "description": "Memory node ID to look up."},
                },
                "required": ["node_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "index_user_knowledge",
            "description": (
                "Index information provided by the user in the chat into the RAG knowledge base "
                "and attach it to the memory tree. Use this when the user shares facts, context, "
                "or domain knowledge in conversation that should be persisted. "
                "Returns the memory node ID created."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "The text content to index into the knowledge base."},
                    "source_description": {
                        "type": "string",
                        "description": "Brief label for the source, e.g. 'user chat — auth requirements'.",
                    },
                },
                "required": ["content", "source_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": (
                "Search the RAG knowledge base for relevant project information. "
                "Returns matching chunks with their chunk_id, text, metadata (including node_id), and distance. "
                "Use the node_id from results metadata to reference memory nodes when creating requirements or tasks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."},
                    "n": {"type": "integer", "description": "Number of results to return (default 5)."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_requirement",
            "description": (
                "Store a new user requirement. MUST include references to memory node IDs that ground this requirement. "
                "First call search_knowledge to find relevant nodes, then pass their node IDs here."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Concise one-line summary of the requirement."},
                    "content": {
                        "type": "string",
                        "description": "Detailed markdown description with implementation specifics.",
                    },
                    "references": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of memory node IDs that ground this requirement. Must not be empty.",
                    },
                },
                "required": ["summary", "content", "references"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_requirement",
            "description": "Update an existing requirement by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Requirement ID to update."},
                    "summary": {"type": "string", "description": "New summary (optional)."},
                    "content": {"type": "string", "description": "New content (optional)."},
                    "references": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New list of memory node IDs (optional).",
                    },
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_requirement",
            "description": "Delete a requirement and all its child tasks by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Requirement ID to delete."},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_requirements",
            "description": "List all stored user requirements with their references and child task counts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_task",
            "description": (
                "Create a new implementation task linked to a parent requirement. "
                "MUST include requirement_id and references to memory node IDs that ground this task. "
                "First call search_knowledge to find relevant nodes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "requirement_id": {
                        "type": "integer",
                        "description": "ID of the parent requirement this task belongs to.",
                    },
                    "summary": {"type": "string", "description": "Concise task summary."},
                    "tags": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["infra", "test", "feature", "docs", "refactor"]},
                        "description": "Task tags.",
                    },
                    "implementation_details": {
                        "type": "string",
                        "description": "Detailed markdown implementation notes.",
                    },
                    "references": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of memory node IDs that ground this task. Must not be empty.",
                    },
                    "dependencies": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "List of task IDs that must be completed before this task.",
                    },
                },
                "required": ["requirement_id", "summary", "tags", "references"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Update an existing task by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Task ID to update."},
                    "summary": {"type": "string"},
                    "tags": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["infra", "test", "feature", "docs", "refactor"]},
                    },
                    "implementation_details": {"type": "string"},
                    "references": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Updated memory node ID references.",
                    },
                    "dependencies": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete a task by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Task ID to delete."},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "List all tasks in topological order (dependencies first, tests prioritized).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_plan",
            "description": "Generate a full implementation plan markdown from current requirements and tasks, with memory tree context and all referenced node summaries inlined.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


class Agent:
    def __init__(self, db: Database, rag: RAGStore, messages: list[dict[str, Any]] | None = None):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        )
        self.db = db
        self.rag = rag
        self.confirm_fn: Any = None  # (kind, summary, content, context) -> ("yes"|"no"|"refine", feedback)
        if messages is not None:
            self.messages: list[dict[str, Any]] = messages
        else:
            self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    def chat(self, user_message: str) -> str:
        """Send a user message, handle tool calls in a loop, return final text response."""
        self.messages.append({"role": "user", "content": user_message})

        while True:
            response = self.client.chat.completions.create(
                model=MODEL,
                messages=self.messages,
                tools=TOOLS,
                max_tokens=4096,
            )

            choice = response.choices[0]
            message = choice.message

            self.messages.append(message.model_dump(exclude_none=True))

            if choice.finish_reason != "tool_calls" or not message.tool_calls:
                return message.content or "(No response)"

            for tool_call in message.tool_calls:
                name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                result = self._handle_tool(name, args)
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result, default=str),
                    }
                )

    def _handle_tool(self, name: str, input_data: dict[str, Any]) -> Any:
        match name:
            case "get_memory_tree":
                tree = self.db.get_memory_tree()
                if tree is None:
                    return {"tree": "(empty — no knowledge indexed yet)"}
                return {"tree": format_tree_text(tree)}
            case "get_memory_node":
                node = self.db.get_memory_node(input_data["node_id"])
                if not node:
                    return {"status": "error", "message": f"Node {input_data['node_id']} not found."}
                chunk_texts = self.rag.get_chunks_by_ids(node.chunk_ids)
                children = self.db.get_children(node.id)
                return {
                    "node": node.model_dump(),
                    "chunk_texts": chunk_texts,
                    "children": [
                        {"id": c.id, "label": c.label, "node_type": c.node_type, "summary": c.summary} for c in children
                    ],
                }
            case "index_user_knowledge":
                label = input_data.get("source_description", "user knowledge")
                content_preview = input_data["content"][:300]
                if len(input_data["content"]) > 300:
                    content_preview += "..."
                if self.confirm_fn:
                    action, feedback = self.confirm_fn("memory", label, content_preview, "")
                    if action == "no":
                        return {"status": "rejected", "message": "User chose not to store this memory."}
                    if action == "refine":
                        return {
                            "status": "needs_refinement",
                            "feedback": feedback,
                            "message": f"User wants changes before storing this memory: {feedback}. "
                            "Adjust the content/label and call index_user_knowledge again.",
                        }
                chunk_ids = self.rag.index_text_return_ids(
                    input_data["content"],
                    metadata={"source": label, "type": "user_chat"},
                )
                summary = input_data["content"][:200]
                if len(input_data["content"]) > 200:
                    summary += "..."
                node_id = attach_knowledge_node(self.db, self.rag, label, chunk_ids, summary)
                return {"status": "ok", "node_id": node_id, "chunk_ids": chunk_ids, "count": len(chunk_ids)}
            case "search_knowledge":
                results = self.rag.search(input_data["query"], n=input_data.get("n", 5))
                return {"results": results}
            case "add_requirement":
                if self.confirm_fn:
                    context = self._build_refs_context(input_data.get("references", []))
                    action, feedback = self.confirm_fn(
                        "requirement",
                        input_data["summary"],
                        input_data["content"],
                        context,
                    )
                    if action == "no":
                        return {
                            "status": "rejected",
                            "message": "User rejected this requirement. Ask if they want to modify it or skip.",
                        }
                    if action == "refine":
                        return {
                            "status": "needs_refinement",
                            "feedback": feedback,
                            "message": f"User wants changes: {feedback}. "
                            "Adjust the summary/content and call add_requirement again.",
                        }
                req = self.db.add_requirement(
                    input_data["summary"],
                    input_data["content"],
                    references=input_data.get("references", []),
                )
                return {"status": "ok", "requirement": req.model_dump()}
            case "update_requirement":
                req = self.db.update_requirement(
                    input_data["id"],
                    summary=input_data.get("summary"),
                    content=input_data.get("content"),
                    references=input_data.get("references"),
                )
                if req:
                    return {"status": "ok", "requirement": req.model_dump()}
                return {"status": "error", "message": f"Requirement {input_data['id']} not found."}
            case "delete_requirement":
                ok = self.db.delete_requirement(input_data["id"])
                return {
                    "status": "ok" if ok else "error",
                    "message": "Deleted (and child tasks)." if ok else "Not found.",
                }
            case "list_requirements":
                reqs = self.db.list_requirements()
                result = []
                for r in reqs:
                    tasks = self.db.list_tasks_for_requirement(r.id)
                    result.append({**r.model_dump(), "task_count": len(tasks), "task_ids": [t.id for t in tasks]})
                return {"requirements": result}
            case "add_task":
                if self.confirm_fn:
                    tags_str = ", ".join(input_data.get("tags", []))
                    details = input_data.get("implementation_details", "")
                    full_content = f"Tags: {tags_str}\nRequirement: R{input_data['requirement_id']}"
                    if details:
                        full_content += f"\n\n{details}"
                    context = self._build_refs_context(input_data.get("references", []))
                    action, feedback = self.confirm_fn(
                        "task",
                        input_data["summary"],
                        full_content,
                        context,
                    )
                    if action == "no":
                        return {
                            "status": "rejected",
                            "message": "User rejected this task. Ask if they want to modify it or skip.",
                        }
                    if action == "refine":
                        return {
                            "status": "needs_refinement",
                            "feedback": feedback,
                            "message": f"User wants changes: {feedback}. "
                            "Adjust the summary/details and call add_task again.",
                        }
                task = self.db.add_task(
                    requirement_id=input_data["requirement_id"],
                    summary=input_data["summary"],
                    tags=input_data.get("tags", []),
                    implementation_details=input_data.get("implementation_details", ""),
                    references=input_data.get("references", []),
                    dependencies=input_data.get("dependencies"),
                )
                return {"status": "ok", "task": task.model_dump()}
            case "update_task":
                task = self.db.update_task(
                    input_data["id"],
                    summary=input_data.get("summary"),
                    tags=input_data.get("tags"),
                    implementation_details=input_data.get("implementation_details"),
                    references=input_data.get("references"),
                    dependencies=input_data.get("dependencies"),
                )
                if task:
                    return {"status": "ok", "task": task.model_dump()}
                return {"status": "error", "message": f"Task {input_data['id']} not found."}
            case "delete_task":
                ok = self.db.delete_task(input_data["id"])
                return {"status": "ok" if ok else "error", "message": "Deleted." if ok else "Not found."}
            case "list_tasks":
                tasks = self.db.list_tasks_sorted()
                return {"tasks": [t.model_dump() for t in tasks]}
            case "generate_plan":
                return self._generate_plan()
            case _:
                return {"status": "error", "message": f"Unknown tool: {name}"}

    def _build_refs_context(self, refs: list[str]) -> str:
        """Resolve memory node IDs into a human-readable context string."""
        parts = []
        for ref in refs:
            try:
                node = self.db.get_memory_node(int(ref))
                if node:
                    parts.append(f"  Node {node.id} ({node.node_type}): {node.label} — {node.summary}")
            except (ValueError, TypeError):
                pass
        return "\n".join(parts) if parts else ""

    def _generate_plan(self) -> dict[str, str]:
        reqs = self.db.list_requirements()
        tasks = self.db.list_tasks_sorted()

        # Memory tree context
        tree = self.db.get_memory_tree()
        tree_text = format_tree_text(tree) if tree else "_No memory tree built yet._"

        sections = []
        for r in reqs:
            # Resolve references as node IDs → node summaries
            node_summaries = []
            for ref in r.references:
                try:
                    node = self.db.get_memory_node(int(ref))
                    if node:
                        node_summaries.append(f"[Node {node.id}] {node.label}: {node.summary}")
                except (ValueError, TypeError):
                    node_summaries.append(f"[ref: {ref}]")

            child_tasks = self.db.list_tasks_for_requirement(r.id)
            section = f"### R{r.id}: {r.summary}\n{r.content}\n"
            if node_summaries:
                section += "\n**Grounding context (memory nodes):**\n"
                for ns in node_summaries:
                    section += f"> {ns}\n"
            if child_tasks:
                section += "\n**Tasks:**\n"
                for t in child_tasks:
                    tags_str = ", ".join(tag.value for tag in t.tags)
                    deps_str = ", ".join(str(d) for d in t.dependencies) if t.dependencies else "None"
                    section += f"- T{t.id} [{tags_str}]: {t.summary} (deps: {deps_str})\n"
            sections.append(section)

        reqs_text = "\n".join(sections) if sections else "_No requirements yet._"

        tasks_text_parts = []
        for t in tasks:
            # Resolve references as node IDs → node summaries
            node_summaries = []
            for ref in t.references:
                try:
                    node = self.db.get_memory_node(int(ref))
                    if node:
                        node_summaries.append(f"[Node {node.id}] {node.label}: {node.summary}")
                except (ValueError, TypeError):
                    node_summaries.append(f"[ref: {ref}]")

            part = (
                f"### T{t.id}: [{', '.join(tag.value for tag in t.tags)}] {t.summary}\n"
                f"Parent requirement: R{t.requirement_id}\n"
                f"Dependencies: {t.dependencies or 'None'}\n"
                f"{t.implementation_details}\n"
            )
            if node_summaries:
                part += "\n**Grounding context (memory nodes):**\n"
                for ns in node_summaries:
                    part += f"> {ns}\n"
            tasks_text_parts.append(part)

        tasks_text = "\n".join(tasks_text_parts) if tasks_text_parts else "_No tasks yet._"

        plan = PLAN_GENERATION_PROMPT.format(
            memory_tree=tree_text,
            requirements=reqs_text,
            tasks=tasks_text,
        )
        return {"plan": plan}
