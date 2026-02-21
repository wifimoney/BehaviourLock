"""Project registry — manages isolated project workspaces."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

from behaviour_lock.models import Project

REGISTRY_DIR = Path.home() / ".behaviourlock"
PROJECTS_DIR = REGISTRY_DIR / "projects"
REGISTRY_FILE = REGISTRY_DIR / "projects.json"


def _ensure_dirs():
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "project"


def _load_registry() -> list[Project]:
    _ensure_dirs()
    if not REGISTRY_FILE.exists():
        return []
    data = json.loads(REGISTRY_FILE.read_text())
    return [Project(**p) for p in data]


def _save_registry(projects: list[Project]):
    _ensure_dirs()
    REGISTRY_FILE.write_text(json.dumps([p.model_dump(mode="json") for p in projects], indent=2, default=str))


def list_projects() -> list[Project]:
    return _load_registry()


def create_project(name: str, source_path: str) -> Project:
    projects = _load_registry()
    slug = _slugify(name)

    # Ensure unique slug
    existing_slugs = {p.slug for p in projects}
    base_slug = slug
    counter = 1
    while slug in existing_slugs:
        slug = f"{base_slug}-{counter}"
        counter += 1

    project = Project(slug=slug, name=name, source_path=source_path, created_at=datetime.utcnow())

    # Create project data directory
    project_dir(project).mkdir(parents=True, exist_ok=True)

    projects.append(project)
    _save_registry(projects)
    return project


def delete_project(slug: str) -> bool:
    projects = _load_registry()
    filtered = [p for p in projects if p.slug != slug]
    if len(filtered) == len(projects):
        return False
    _save_registry(filtered)
    # Optionally clean up data dir
    import shutil

    data_dir = PROJECTS_DIR / slug
    if data_dir.exists():
        shutil.rmtree(data_dir)
    return True


def project_dir(project: Project) -> Path:
    return PROJECTS_DIR / project.slug


def project_db_path(project: Project) -> Path:
    return project_dir(project) / "db.sqlite"


def project_chroma_dir(project: Project) -> str:
    return str(project_dir(project) / "chroma_data")
