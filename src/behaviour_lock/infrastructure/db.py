"""SQLite database layer for requirements and tasks."""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from behaviour_lock.models import MemoryNode, TagEnum, Task, UserRequirement

DEFAULT_DB_PATH = Path("behaviourlock.db")

# Sentinel for distinguishing "not provided" from None in update_memory_node
_SENTINEL = object()


class Database:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self.on_memory_event: Callable[..., None] | None = None
        self._init_schema()

    def _init_schema(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS requirements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary TEXT NOT NULL,
                content TEXT NOT NULL,
                references_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requirement_id INTEGER NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                summary TEXT NOT NULL,
                implementation_details TEXT NOT NULL DEFAULT '',
                references_json TEXT NOT NULL DEFAULT '[]',
                dependencies TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (requirement_id) REFERENCES requirements(id)
            );
            CREATE TABLE IF NOT EXISTS memory_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER,
                node_type TEXT NOT NULL,
                label TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                chunk_ids_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES memory_nodes(id)
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT,
                tool_calls_json TEXT,
                tool_call_id TEXT,
                created_at TEXT NOT NULL
            );
        """)
        self.conn.commit()

    def close(self):
        self.conn.close()

    # --- Chat Messages ---

    def save_chat_message(self, msg: dict) -> None:
        now = datetime.utcnow().isoformat()
        tool_calls_json = None
        if msg.get("tool_calls"):
            tool_calls_json = json.dumps(msg["tool_calls"], default=str)
        self.conn.execute(
            "INSERT INTO chat_messages (role, content, tool_calls_json, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (msg.get("role", ""), msg.get("content"), tool_calls_json, msg.get("tool_call_id"), now),
        )
        self.conn.commit()

    def load_chat_messages(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM chat_messages ORDER BY id").fetchall()
        messages: list[dict] = []
        for r in rows:
            msg: dict = {"role": r["role"]}
            if r["content"] is not None:
                msg["content"] = r["content"]
            if r["tool_calls_json"]:
                msg["tool_calls"] = json.loads(r["tool_calls_json"])
            if r["tool_call_id"]:
                msg["tool_call_id"] = r["tool_call_id"]
            messages.append(msg)
        return messages

    def clear_chat_messages(self) -> None:
        self.conn.execute("DELETE FROM chat_messages")
        self.conn.commit()

    # --- Requirements CRUD ---

    def add_requirement(self, summary: str, content: str, references: list[str] | None = None) -> UserRequirement:
        now = datetime.utcnow().isoformat()
        refs = references or []
        cur = self.conn.execute(
            "INSERT INTO requirements (summary, content, references_json, created_at) VALUES (?, ?, ?, ?)",
            (summary, content, json.dumps(refs), now),
        )
        self.conn.commit()
        return UserRequirement(id=cur.lastrowid, summary=summary, content=content, references=refs, created_at=now)

    def update_requirement(
        self, req_id: int, summary: str | None = None, content: str | None = None, references: list[str] | None = None
    ) -> UserRequirement | None:
        row = self.conn.execute("SELECT * FROM requirements WHERE id = ?", (req_id,)).fetchone()
        if not row:
            return None
        new_summary = summary if summary is not None else row["summary"]
        new_content = content if content is not None else row["content"]
        new_refs = references if references is not None else json.loads(row["references_json"])
        self.conn.execute(
            "UPDATE requirements SET summary = ?, content = ?, references_json = ? WHERE id = ?",
            (new_summary, new_content, json.dumps(new_refs), req_id),
        )
        self.conn.commit()
        return UserRequirement(
            id=req_id, summary=new_summary, content=new_content, references=new_refs, created_at=row["created_at"]
        )

    def delete_requirement(self, req_id: int) -> bool:
        # Also delete child tasks
        self.conn.execute("DELETE FROM tasks WHERE requirement_id = ?", (req_id,))
        cur = self.conn.execute("DELETE FROM requirements WHERE id = ?", (req_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def list_requirements(self) -> list[UserRequirement]:
        rows = self.conn.execute("SELECT * FROM requirements ORDER BY id").fetchall()
        return [_row_to_requirement(r) for r in rows]

    def get_requirement(self, req_id: int) -> UserRequirement | None:
        row = self.conn.execute("SELECT * FROM requirements WHERE id = ?", (req_id,)).fetchone()
        return _row_to_requirement(row) if row else None

    # --- Tasks CRUD ---

    def add_task(
        self,
        requirement_id: int,
        summary: str,
        tags: list[str],
        implementation_details: str = "",
        references: list[str] | None = None,
        dependencies: list[int] | None = None,
    ) -> Task:
        now = datetime.utcnow().isoformat()
        deps = dependencies or []
        refs = references or []
        tag_enums = [TagEnum(t) for t in tags]
        cur = self.conn.execute(
            "INSERT INTO tasks (requirement_id, tags, summary, implementation_details, references_json, dependencies, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                requirement_id,
                json.dumps(tags),
                summary,
                implementation_details,
                json.dumps(refs),
                json.dumps(deps),
                now,
            ),
        )
        self.conn.commit()
        return Task(
            id=cur.lastrowid,
            requirement_id=requirement_id,
            tags=tag_enums,
            summary=summary,
            implementation_details=implementation_details,
            references=refs,
            dependencies=deps,
            created_at=now,
        )

    def update_task(
        self,
        task_id: int,
        summary: str | None = None,
        tags: list[str] | None = None,
        implementation_details: str | None = None,
        references: list[str] | None = None,
        dependencies: list[int] | None = None,
    ) -> Task | None:
        row = self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        new_summary = summary if summary is not None else row["summary"]
        new_tags = tags if tags is not None else json.loads(row["tags"])
        new_details = implementation_details if implementation_details is not None else row["implementation_details"]
        new_refs = references if references is not None else json.loads(row["references_json"])
        new_deps = dependencies if dependencies is not None else json.loads(row["dependencies"])
        self.conn.execute(
            "UPDATE tasks SET summary = ?, tags = ?, implementation_details = ?, references_json = ?, dependencies = ? WHERE id = ?",
            (new_summary, json.dumps(new_tags), new_details, json.dumps(new_refs), json.dumps(new_deps), task_id),
        )
        self.conn.commit()
        return Task(
            id=task_id,
            requirement_id=row["requirement_id"],
            tags=[TagEnum(t) for t in new_tags],
            summary=new_summary,
            implementation_details=new_details,
            references=new_refs,
            dependencies=new_deps,
            created_at=row["created_at"],
        )

    def delete_task(self, task_id: int) -> bool:
        cur = self.conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def list_tasks(self) -> list[Task]:
        rows = self.conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
        return [_row_to_task(r) for r in rows]

    def list_tasks_for_requirement(self, req_id: int) -> list[Task]:
        rows = self.conn.execute("SELECT * FROM tasks WHERE requirement_id = ? ORDER BY id", (req_id,)).fetchall()
        return [_row_to_task(r) for r in rows]

    def list_tasks_sorted(self) -> list[Task]:
        """Return tasks in topological order (dependencies first, tests prioritized)."""
        tasks = self.list_tasks()
        return topological_sort(tasks)

    # --- Memory Nodes CRUD ---

    def add_memory_node(
        self, parent_id: int | None, node_type: str, label: str, summary: str = "", chunk_ids: list[str] | None = None
    ) -> MemoryNode:
        now = datetime.utcnow().isoformat()
        cids = chunk_ids or []
        cur = self.conn.execute(
            "INSERT INTO memory_nodes (parent_id, node_type, label, summary, chunk_ids_json, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (parent_id, node_type, label, summary, json.dumps(cids), now),
        )
        self.conn.commit()
        node = MemoryNode(
            id=cur.lastrowid,
            parent_id=parent_id,
            node_type=node_type,
            label=label,
            summary=summary,
            chunk_ids=cids,
            created_at=now,
        )
        if self.on_memory_event:
            self.on_memory_event("created", node)
        return node

    def update_memory_node(
        self,
        node_id: int,
        summary: str | None = None,
        label: str | None = None,
        parent_id: int | None = _SENTINEL,
        chunk_ids: list[str] | None = None,
    ) -> MemoryNode | None:
        row = self.conn.execute("SELECT * FROM memory_nodes WHERE id = ?", (node_id,)).fetchone()
        if not row:
            return None
        new_summary = summary if summary is not None else row["summary"]
        new_label = label if label is not None else row["label"]
        new_parent = parent_id if parent_id is not _SENTINEL else row["parent_id"]
        new_cids = chunk_ids if chunk_ids is not None else json.loads(row["chunk_ids_json"])
        self.conn.execute(
            "UPDATE memory_nodes SET summary = ?, label = ?, parent_id = ?, chunk_ids_json = ? WHERE id = ?",
            (new_summary, new_label, new_parent, json.dumps(new_cids), node_id),
        )
        self.conn.commit()
        node = MemoryNode(
            id=node_id,
            parent_id=new_parent,
            node_type=row["node_type"],
            label=new_label,
            summary=new_summary,
            chunk_ids=new_cids,
            created_at=row["created_at"],
        )
        if self.on_memory_event:
            self.on_memory_event("updated", node)
        return node

    def get_memory_node(self, node_id: int) -> MemoryNode | None:
        row = self.conn.execute("SELECT * FROM memory_nodes WHERE id = ?", (node_id,)).fetchone()
        return _row_to_memory_node(row) if row else None

    def get_children(self, parent_id: int | None) -> list[MemoryNode]:
        if parent_id is None:
            rows = self.conn.execute("SELECT * FROM memory_nodes WHERE parent_id IS NULL ORDER BY id").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM memory_nodes WHERE parent_id = ? ORDER BY id", (parent_id,)
            ).fetchall()
        return [_row_to_memory_node(r) for r in rows]

    def get_root_node(self) -> MemoryNode | None:
        row = self.conn.execute("SELECT * FROM memory_nodes WHERE node_type = 'root' LIMIT 1").fetchone()
        return _row_to_memory_node(row) if row else None

    def get_memory_tree(self) -> dict | None:
        """Build the full memory tree as a nested dict."""
        rows = self.conn.execute("SELECT * FROM memory_nodes ORDER BY id").fetchall()
        if not rows:
            return None
        nodes = [_row_to_memory_node(r) for r in rows]
        return _build_tree(nodes)

    def delete_memory_node(self, node_id: int) -> bool:
        """Delete a memory node and all its descendants."""
        # Capture node info before deletion for logging
        deleted_nodes = []
        if self.on_memory_event:
            for nid in self._collect_descendant_ids(node_id):
                n = self.get_memory_node(nid)
                if n:
                    deleted_nodes.append(n)
        # Gather all descendant IDs via BFS
        to_delete = self._collect_descendant_ids(node_id)
        placeholders = ",".join("?" * len(to_delete))
        cur = self.conn.execute(f"DELETE FROM memory_nodes WHERE id IN ({placeholders})", to_delete)
        self.conn.commit()
        if self.on_memory_event:
            for n in deleted_nodes:
                self.on_memory_event("removed", n)
        return cur.rowcount > 0

    def _collect_descendant_ids(self, node_id: int) -> list[int]:
        ids = [node_id]
        queue = [node_id]
        while queue:
            pid = queue.pop(0)
            children = self.conn.execute("SELECT id FROM memory_nodes WHERE parent_id = ?", (pid,)).fetchall()
            for c in children:
                ids.append(c["id"])
                queue.append(c["id"])
        return ids


def _row_to_memory_node(r: sqlite3.Row) -> MemoryNode:
    return MemoryNode(
        id=r["id"],
        parent_id=r["parent_id"],
        node_type=r["node_type"],
        label=r["label"],
        summary=r["summary"],
        chunk_ids=json.loads(r["chunk_ids_json"]),
        created_at=r["created_at"],
    )


def _build_tree(nodes: list[MemoryNode]) -> dict | None:
    """Build a nested dict tree from a flat list of MemoryNodes."""
    node_map: dict[int, dict] = {}
    for n in nodes:
        node_map[n.id] = {
            "id": n.id,
            "label": n.label,
            "summary": n.summary,
            "node_type": n.node_type,
            "children": [],
        }
    root = None
    for n in nodes:
        entry = node_map[n.id]
        if n.parent_id is not None and n.parent_id in node_map:
            node_map[n.parent_id]["children"].append(entry)
        elif n.node_type == "root" or n.parent_id is None:
            root = entry
    return root


def _row_to_requirement(r: sqlite3.Row) -> UserRequirement:
    return UserRequirement(
        id=r["id"],
        summary=r["summary"],
        content=r["content"],
        references=json.loads(r["references_json"]),
        created_at=r["created_at"],
    )


def _row_to_task(r: sqlite3.Row) -> Task:
    return Task(
        id=r["id"],
        requirement_id=r["requirement_id"],
        tags=[TagEnum(t) for t in json.loads(r["tags"])],
        summary=r["summary"],
        implementation_details=r["implementation_details"],
        references=json.loads(r["references_json"]),
        dependencies=json.loads(r["dependencies"]),
        created_at=r["created_at"],
    )


def topological_sort(tasks: list[Task]) -> list[Task]:
    """Sort tasks so dependencies come first. Among peers, test tasks come first."""
    task_map = {t.id: t for t in tasks}
    in_degree: dict[int, int] = defaultdict(int)
    graph: dict[int, list[int]] = defaultdict(list)

    for t in tasks:
        if t.id not in in_degree:
            in_degree[t.id] = 0
        for dep_id in t.dependencies:
            if dep_id in task_map:
                graph[dep_id].append(t.id)
                in_degree[t.id] += 1

    queue = sorted(
        [tid for tid, deg in in_degree.items() if deg == 0],
        key=lambda tid: (0 if TagEnum.TEST in task_map[tid].tags else 1, tid),
    )
    result = []
    while queue:
        tid = queue.pop(0)
        result.append(task_map[tid])
        for neighbor in graph[tid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
                queue.sort(key=lambda x: (0 if TagEnum.TEST in task_map[x].tags else 1, x))

    seen = {t.id for t in result}
    for t in tasks:
        if t.id not in seen:
            result.append(t)

    return result
