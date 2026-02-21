"""Requirement CRUD endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from behaviour_lock.api.deps import get_db
from behaviour_lock.api.schemas import RequirementCreate, RequirementOut, RequirementUpdate

router = APIRouter(prefix="/projects/{slug}/requirements", tags=["requirements"])


@router.get("", response_model=list[RequirementOut])
def list_requirements(slug: str):
    db = get_db(slug)
    try:
        return [
            RequirementOut(id=r.id, summary=r.summary, content=r.content, references=r.references, created_at=r.created_at)
            for r in db.list_requirements()
        ]
    finally:
        db.close()


@router.get("/{req_id}", response_model=RequirementOut)
def get_requirement(slug: str, req_id: int):
    db = get_db(slug)
    try:
        r = db.get_requirement(req_id)
        if not r:
            raise HTTPException(status_code=404, detail=f"Requirement {req_id} not found")
        return RequirementOut(id=r.id, summary=r.summary, content=r.content, references=r.references, created_at=r.created_at)
    finally:
        db.close()


@router.post("", response_model=RequirementOut, status_code=201)
def create_requirement(slug: str, body: RequirementCreate):
    db = get_db(slug)
    try:
        r = db.add_requirement(body.summary, body.content, references=body.references)
        return RequirementOut(id=r.id, summary=r.summary, content=r.content, references=r.references, created_at=r.created_at)
    finally:
        db.close()


@router.put("/{req_id}", response_model=RequirementOut)
def update_requirement(slug: str, req_id: int, body: RequirementUpdate):
    db = get_db(slug)
    try:
        r = db.update_requirement(req_id, summary=body.summary, content=body.content, references=body.references)
        if not r:
            raise HTTPException(status_code=404, detail=f"Requirement {req_id} not found")
        return RequirementOut(id=r.id, summary=r.summary, content=r.content, references=r.references, created_at=r.created_at)
    finally:
        db.close()


@router.delete("/{req_id}", status_code=204)
def delete_requirement(slug: str, req_id: int):
    db = get_db(slug)
    try:
        if not db.delete_requirement(req_id):
            raise HTTPException(status_code=404, detail=f"Requirement {req_id} not found")
    finally:
        db.close()
