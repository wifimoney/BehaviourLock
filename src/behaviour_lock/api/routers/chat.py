"""Chat endpoints — the core agent interaction."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from behaviour_lock.api.deps import get_db, get_rag
from behaviour_lock.api.schemas import ChatMessage, ChatRequest, ChatResponse
from behaviour_lock.prompts import SYSTEM_PROMPT
from behaviour_lock.services.agent import Agent

router = APIRouter(prefix="/projects/{slug}/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(slug: str, body: ChatRequest):
    db = get_db(slug)
    rag = get_rag(slug)
    try:
        # Load persisted chat history
        messages = db.load_chat_messages()
        if not messages:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        agent = Agent(db=db, rag=rag, messages=messages)
        # No confirm_fn — auto-approve all tool calls in API mode

        snapshot = len(agent.messages)
        response_text = agent.chat(body.message)

        # Persist new messages (everything after the snapshot)
        for msg in agent.messages[snapshot:]:
            db.save_chat_message(msg)

        # Return only user + assistant messages for display
        display_messages = [
            ChatMessage(role=m["role"], content=m.get("content"))
            for m in agent.messages
            if m.get("role") in ("user", "assistant")
        ]

        return ChatResponse(response=response_text, messages=display_messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    finally:
        db.close()


@router.get("/history", response_model=list[ChatMessage])
def get_chat_history(slug: str):
    db = get_db(slug)
    try:
        messages = db.load_chat_messages()
        return [
            ChatMessage(role=m["role"], content=m.get("content"))
            for m in messages
            if m.get("role") in ("user", "assistant")
        ]
    finally:
        db.close()


@router.delete("/history", status_code=204)
def clear_chat_history(slug: str):
    db = get_db(slug)
    try:
        db.clear_chat_messages()
    finally:
        db.close()
