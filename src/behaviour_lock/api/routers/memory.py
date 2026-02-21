"""Memory tree endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from behaviour_lock.api.deps import get_db
from behaviour_lock.api.schemas import MemoryNodeOut

router = APIRouter(prefix="/projects/{slug}/memory", tags=["memory"])


@router.get("/tree")
def get_memory_tree(slug: str):
    db = get_db(slug)
    try:
        tree = db.get_memory_tree()
        if tree is None:
            return {"tree": None}
        return {"tree": tree}
    finally:
        db.close()


@router.get("/nodes/{node_id}", response_model=MemoryNodeOut)
def get_memory_node(slug: str, node_id: int):
    db = get_db(slug)
    try:
        node = db.get_memory_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail=f"Memory node {node_id} not found")
        return MemoryNodeOut(
            id=node.id, parent_id=node.parent_id, node_type=node.node_type,
            label=node.label, summary=node.summary, chunk_ids=node.chunk_ids, created_at=node.created_at,
        )
    finally:
        db.close()


@router.get("/nodes/{node_id}/children", response_model=list[MemoryNodeOut])
def get_memory_node_children(slug: str, node_id: int):
    db = get_db(slug)
    try:
        children = db.get_children(node_id)
        return [
            MemoryNodeOut(
                id=c.id, parent_id=c.parent_id, node_type=c.node_type,
                label=c.label, summary=c.summary, chunk_ids=c.chunk_ids, created_at=c.created_at,
            )
            for c in children
        ]
    finally:
        db.close()
