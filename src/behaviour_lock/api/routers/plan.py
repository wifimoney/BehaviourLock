"""Plan generation endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from behaviour_lock.api.deps import get_db, get_rag
from behaviour_lock.api.schemas import PlanResponse
from behaviour_lock.services.agent import Agent

router = APIRouter(prefix="/projects/{slug}/plan", tags=["plan"])


@router.get("", response_model=PlanResponse)
def get_plan(slug: str):
    db = get_db(slug)
    rag = get_rag(slug)
    try:
        agent = Agent(db=db, rag=rag)
        result = agent._generate_plan()
        return PlanResponse(plan=result["plan"])
    finally:
        db.close()
