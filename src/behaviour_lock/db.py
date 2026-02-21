"""SQLite database layer for requirements and tasks."""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from behaviour_lock.models import Task, TagEnum, UserRequirement

DEFAULT_DB_PATH = Path("behaviourlock.db")


class Database:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self):
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS requirements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tags TEXT NOT NULL DEFAULT '[]',
                summary TEXT NOT NULL,
                implementation_details TEXT NOT NULL DEFAULT '',
                dependencies TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
        """)
        self.conn.commit()

    def close(self):
        self.conn.close()

    # --- Requirements CRUD ---

    def add_requirement(self, summary: str, content: str) -> UserRequirement:
        now = datetime.utcnow().isoformat()
        cur = self.conn.execute(
            "INSERT INTO requirements (summary, content, created_at) VALUES (?, ?, ?)",
            (summary, content, now),
        )
        self.conn.commit()
        return UserRequirement(id=cur.lastrowid, summary=summary, content=content, created_at=now)

    def update_requirement(self, req_id: int, summary: str | None = None, content: str | None = None) -> UserRequirement | None:
        row = self.conn.execute("SELECT * FROM requirements WHERE id = ?", (req_id,)).fetchone()
        if not row:
            return None
        new_summary = summary if summary is not None else row["summary"]
        new_content = content if content is not None else row["content"]
        self.conn.execute(
            "UPDATE requirements SET summary = ?, content = ? WHERE id = ?",
            (new_summary, new_content, req_id),
        )
        self.conn.commit()
        return UserRequirement(id=req_id, summary=new_summary, content=new_content, created_at=row["created_at"])

    def delete_requirement(self, req_id: int) -> bool:
        cur = self.conn.execute("DELETE FROM requirements WHERE id = ?", (req_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def list_requirements(self) -> list[UserRequirement]:
        rows = self.conn.execute("SELECT * FROM requirements ORDER BY id").fetchall()
        return [
            UserRequirement(id=r["id"], summary=r["summary"], content=r["content"], created_at=r["created_at"])
            for r in rows
        ]

    # --- Tasks CRUD ---

    def add_task(self, summary: str, tags: list[str], implementation_details: str = "", dependencies: list[int] | None = None) -> Task:
        now = datetime.utcnow().isoformat()
        deps = dependencies or []
        tag_enums = [TagEnum(t) for t in tags]
        cur = self.conn.execute(
            "INSERT INTO tasks (tags, summary, implementation_details, dependencies, created_at) VALUES (?, ?, ?, ?, ?)",
            (json.dumps(tags), summary, implementation_details, json.dumps(deps), now),
        )
        self.conn.commit()
        return Task(id=cur.lastrowid, tags=tag_enums, summary=summary, implementation_details=implementation_details, dependencies=deps, created_at=now)

    def update_task(self, task_id: int, summary: str | None = None, tags: list[str] | None = None,
                    implementation_details: str | None = None, dependencies: list[int] | None = None) -> Task | None:
        row = self.conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return None
        new_summary = summary if summary is not None else row["summary"]
        new_tags = tags if tags is not None else json.loads(row["tags"])
        new_details = implementation_details if implementation_details is not None else row["implementation_details"]
        new_deps = dependencies if dependencies is not None else json.loads(row["dependencies"])
        self.conn.execute(
            "UPDATE tasks SET summary = ?, tags = ?, implementation_details = ?, dependencies = ? WHERE id = ?",
            (new_summary, json.dumps(new_tags), new_details, json.dumps(new_deps), task_id),
        )
        self.conn.commit()
        return Task(id=task_id, tags=[TagEnum(t) for t in new_tags], summary=new_summary,
                    implementation_details=new_details, dependencies=new_deps, created_at=row["created_at"])

    def delete_task(self, task_id: int) -> bool:
        cur = self.conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def list_tasks(self) -> list[Task]:
        rows = self.conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
        return [
            Task(id=r["id"], tags=[TagEnum(t) for t in json.loads(r["tags"])], summary=r["summary"],
                 implementation_details=r["implementation_details"],
                 dependencies=json.loads(r["dependencies"]), created_at=r["created_at"])
            for r in rows
        ]

    def list_tasks_sorted(self) -> list[Task]:
        """Return tasks in topological order (dependencies first, tests prioritized)."""
        tasks = self.list_tasks()
        return topological_sort(tasks)


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

    # Start with zero in-degree, prioritize test tasks
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

    # Append any remaining tasks (cycles or orphaned references)
    seen = {t.id for t in result}
    for t in tasks:
        if t.id not in seen:
            result.append(t)

    return result
