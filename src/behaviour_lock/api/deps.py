"""FastAPI dependency injection helpers."""

from __future__ import annotations

from fastapi import HTTPException

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.models import Project
from behaviour_lock.services.projects import (
    list_projects,
    project_chroma_dir,
    project_db_path,
)


def get_project(slug: str) -> Project:
    projects = list_projects()
    for p in projects:
        if p.slug == slug:
            return p
    raise HTTPException(status_code=404, detail=f"Project '{slug}' not found")


def get_db(slug: str) -> Database:
    project = get_project(slug)
    return Database(project_db_path(project))


def get_rag(slug: str) -> RAGStore:
    project = get_project(slug)
    return RAGStore(persist_dir=project_chroma_dir(project))
