"""FastAPI application assembly."""

from __future__ import annotations

from dotenv import load_dotenv
from fastapi import FastAPI

from behaviour_lock.api.routers import chat, index, memory, plan, projects, requirements, tasks

load_dotenv()

app = FastAPI(title="BehaviourLock API", version="0.1.0")

app.include_router(projects.router)
app.include_router(requirements.router)
app.include_router(tasks.router)
app.include_router(memory.router)
app.include_router(chat.router)
app.include_router(index.router)
app.include_router(plan.router)
