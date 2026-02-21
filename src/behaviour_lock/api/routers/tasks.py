"""Task CRUD + build-context endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from behaviour_lock.api.deps import get_db, get_rag
from behaviour_lock.api.schemas import BuildContextResponse, TaskCreate, TaskOut, TaskUpdate
from behaviour_lock.services.build import generate_build_context

router = APIRouter(prefix="/projects/{slug}/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(slug: str):
    db = get_db(slug)
    try:
        return [
            TaskOut(
                id=t.id, requirement_id=t.requirement_id, tags=[tag.value for tag in t.tags],
                summary=t.summary, implementation_details=t.implementation_details,
                references=t.references, dependencies=t.dependencies, created_at=t.created_at,
            )
            for t in db.list_tasks_sorted()
        ]
    finally:
        db.close()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(slug: str, task_id: int):
    db = get_db(slug)
    try:
        tasks = db.list_tasks()
        task = next((t for t in tasks if t.id == task_id), None)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return TaskOut(
            id=task.id, requirement_id=task.requirement_id, tags=[tag.value for tag in task.tags],
            summary=task.summary, implementation_details=task.implementation_details,
            references=task.references, dependencies=task.dependencies, created_at=task.created_at,
        )
    finally:
        db.close()


@router.post("", response_model=TaskOut, status_code=201)
def create_task(slug: str, body: TaskCreate):
    db = get_db(slug)
    try:
        t = db.add_task(
            requirement_id=body.requirement_id, summary=body.summary, tags=body.tags,
            implementation_details=body.implementation_details, references=body.references,
            dependencies=body.dependencies,
        )
        return TaskOut(
            id=t.id, requirement_id=t.requirement_id, tags=[tag.value for tag in t.tags],
            summary=t.summary, implementation_details=t.implementation_details,
            references=t.references, dependencies=t.dependencies, created_at=t.created_at,
        )
    finally:
        db.close()


@router.put("/{task_id}", response_model=TaskOut)
def update_task(slug: str, task_id: int, body: TaskUpdate):
    db = get_db(slug)
    try:
        t = db.update_task(
            task_id, summary=body.summary, tags=body.tags,
            implementation_details=body.implementation_details, references=body.references,
            dependencies=body.dependencies,
        )
        if not t:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return TaskOut(
            id=t.id, requirement_id=t.requirement_id, tags=[tag.value for tag in t.tags],
            summary=t.summary, implementation_details=t.implementation_details,
            references=t.references, dependencies=t.dependencies, created_at=t.created_at,
        )
    finally:
        db.close()


@router.delete("/{task_id}", status_code=204)
def delete_task(slug: str, task_id: int):
    db = get_db(slug)
    try:
        if not db.delete_task(task_id):
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    finally:
        db.close()


@router.get("/{task_id}/build-context", response_model=BuildContextResponse)
def get_build_context(slug: str, task_id: int):
    db = get_db(slug)
    rag = get_rag(slug)
    try:
        md = generate_build_context(db, rag, task_id)
        return BuildContextResponse(markdown=md, task_id=task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    finally:
        db.close()
