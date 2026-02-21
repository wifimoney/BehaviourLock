"""Content indexing endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from behaviour_lock.api.deps import get_db, get_rag
from behaviour_lock.api.schemas import IndexRequest, IndexResponse
from behaviour_lock.services.indexing import index_content

router = APIRouter(prefix="/projects/{slug}/index", tags=["index"])


@router.post("", response_model=IndexResponse)
def index_content_endpoint(slug: str, body: IndexRequest):
    db = get_db(slug)
    rag = get_rag(slug)
    try:
        result = index_content(db, rag, body.content)
        return IndexResponse(
            chunk_ids=result.chunk_ids,
            node_id=result.node_id,
            label=result.label,
            detail=result.detail,
        )
    finally:
        db.close()
