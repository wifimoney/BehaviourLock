"""Gemini chat agent with function calling for structured operations."""
from __future__ import annotations

import json
from typing import Any

from google import genai
from google.genai import types

from behaviour_lock.db import Database
from behaviour_lock.prompts import PLAN_GENERATION_PROMPT, SYSTEM_PROMPT
from behaviour_lock.rag import RAGStore

MODEL = "gemini-2.5-flash"

TOOL_DECLARATIONS = [
    {
        "name": "add_requirement",
        "description": "Store a new user requirement extracted from the conversation.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Concise one-line summary of the requirement."},
                "content": {"type": "string", "description": "Detailed markdown description with implementation specifics."},
            },
            "required": ["summary", "content"],
        },
    },
    {
        "name": "update_requirement",
        "description": "Update an existing requirement by ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "integer", "description": "Requirement ID to update."},
                "summary": {"type": "string", "description": "New summary (optional)."},
                "content": {"type": "string", "description": "New content (optional)."},
            },
            "required": ["id"],
        },
    },
    {
        "name": "delete_requirement",
        "description": "Delete a requirement by ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "integer", "description": "Requirement ID to delete."},
            },
            "required": ["id"],
        },
    },
    {
        "name": "list_requirements",
        "description": "List all stored user requirements.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "add_task",
        "description": "Create a new implementation task.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Concise task summary."},
                "tags": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["infra", "test", "feature", "docs", "refactor"]},
                    "description": "Task tags.",
                },
                "implementation_details": {"type": "string", "description": "Detailed markdown implementation notes."},
                "dependencies": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "List of task IDs that must be completed before this task.",
                },
            },
            "required": ["summary", "tags"],
        },
    },
    {
        "name": "update_task",
        "description": "Update an existing task by ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "integer", "description": "Task ID to update."},
                "summary": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string", "enum": ["infra", "test", "feature", "docs", "refactor"]}},
                "implementation_details": {"type": "string"},
                "dependencies": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["id"],
        },
    },
    {
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
    {
        "name": "list_tasks",
        "description": "List all tasks in topological order (dependencies first, tests prioritized).",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "search_knowledge",
        "description": "Search the RAG knowledge base for relevant project information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "n": {"type": "integer", "description": "Number of results to return."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "generate_plan",
        "description": "Generate a full implementation plan markdown from current requirements and tasks.",
        "parameters": {"type": "object", "properties": {}},
    },
]


class Agent:
    def __init__(self, db: Database, rag: RAGStore):
        self.client = genai.Client()
        self.db = db
        self.rag = rag
        self.history: list[types.Content] = []
        self.tools = types.Tool(function_declarations=TOOL_DECLARATIONS)
        self.config = types.GenerateContentConfig(
            tools=[self.tools],
            system_instruction=SYSTEM_PROMPT,
        )

    def chat(self, user_message: str) -> str:
        """Send a user message, handle tool calls in a loop, return final text response."""
        self.history.append(types.Content(role="user", parts=[types.Part(text=user_message)]))

        while True:
            response = self.client.models.generate_content(
                model=MODEL,
                contents=self.history,
                config=self.config,
            )

            candidate = response.candidates[0]
            # Append the model's response to history
            self.history.append(candidate.content)

            # Check for function calls in the response parts
            function_calls = [p for p in candidate.content.parts if p.function_call]

            if not function_calls:
                # No function calls — extract text and return
                text_parts = [p.text for p in candidate.content.parts if p.text]
                return "\n".join(text_parts) if text_parts else "(No response)"

            # Handle each function call and send results back
            result_parts = []
            for part in function_calls:
                fc = part.function_call
                result = self._handle_tool(fc.name, dict(fc.args))
                result_parts.append(types.Part.from_function_response(
                    name=fc.name,
                    response={"result": json.loads(json.dumps(result, default=str))},
                ))

            self.history.append(types.Content(role="user", parts=result_parts))

    def _handle_tool(self, name: str, input_data: dict[str, Any]) -> Any:
        match name:
            case "add_requirement":
                req = self.db.add_requirement(input_data["summary"], input_data["content"])
                return {"status": "ok", "requirement": req.model_dump()}
            case "update_requirement":
                req = self.db.update_requirement(input_data["id"], input_data.get("summary"), input_data.get("content"))
                if req:
                    return {"status": "ok", "requirement": req.model_dump()}
                return {"status": "error", "message": f"Requirement {input_data['id']} not found."}
            case "delete_requirement":
                ok = self.db.delete_requirement(input_data["id"])
                return {"status": "ok" if ok else "error", "message": "Deleted." if ok else "Not found."}
            case "list_requirements":
                reqs = self.db.list_requirements()
                return {"requirements": [r.model_dump() for r in reqs]}
            case "add_task":
                task = self.db.add_task(
                    summary=input_data["summary"],
                    tags=input_data.get("tags", []),
                    implementation_details=input_data.get("implementation_details", ""),
                    dependencies=input_data.get("dependencies"),
                )
                return {"status": "ok", "task": task.model_dump()}
            case "update_task":
                task = self.db.update_task(
                    input_data["id"],
                    summary=input_data.get("summary"),
                    tags=input_data.get("tags"),
                    implementation_details=input_data.get("implementation_details"),
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
            case "search_knowledge":
                results = self.rag.search(input_data["query"], n=input_data.get("n", 5))
                return {"results": results}
            case "generate_plan":
                return self._generate_plan()
            case _:
                return {"status": "error", "message": f"Unknown tool: {name}"}

    def _generate_plan(self) -> dict[str, str]:
        reqs = self.db.list_requirements()
        tasks = self.db.list_tasks_sorted()

        reqs_text = "\n".join(
            f"### R{r.id}: {r.summary}\n{r.content}" for r in reqs
        ) if reqs else "_No requirements yet._"

        tasks_text = "\n".join(
            f"### T{t.id}: [{', '.join(tag.value for tag in t.tags)}] {t.summary}\n"
            f"Dependencies: {t.dependencies or 'None'}\n{t.implementation_details}"
            for t in tasks
        ) if tasks else "_No tasks yet._"

        plan_prompt = PLAN_GENERATION_PROMPT.format(requirements=reqs_text, tasks=tasks_text)
        return {"plan": plan_prompt}
