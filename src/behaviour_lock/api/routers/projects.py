"""Project CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from behaviour_lock.api.schemas import ProjectCreate, ProjectOut
from behaviour_lock.services.projects import (
    create_project,
    delete_project,
    list_projects,
)

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects_endpoint():
    return [
        ProjectOut(slug=p.slug, name=p.name, source_path=p.source_path, created_at=p.created_at)
        for p in list_projects()
    ]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project_endpoint(body: ProjectCreate):
    project = create_project(body.name, body.source_path)
    return ProjectOut(slug=project.slug, name=project.name, source_path=project.source_path, created_at=project.created_at)


@router.delete("/{slug}", status_code=204)
def delete_project_endpoint(slug: str):
    if not delete_project(slug):
        raise HTTPException(status_code=404, detail=f"Project '{slug}' not found")
