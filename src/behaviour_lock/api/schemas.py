"""Request/response models for the API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# --- Projects ---

class ProjectCreate(BaseModel):
    name: str
    source_path: str


class ProjectOut(BaseModel):
    slug: str
    name: str
    source_path: str
    created_at: datetime


# --- Requirements ---

class RequirementCreate(BaseModel):
    summary: str
    content: str
    references: list[str] = Field(default_factory=list)


class RequirementUpdate(BaseModel):
    summary: str | None = None
    content: str | None = None
    references: list[str] | None = None


class RequirementOut(BaseModel):
    id: int
    summary: str
    content: str
    references: list[str]
    created_at: datetime


# --- Tasks ---

class TaskCreate(BaseModel):
    requirement_id: int
    summary: str
    tags: list[str] = Field(default_factory=list)
    implementation_details: str = ""
    references: list[str] = Field(default_factory=list)
    dependencies: list[int] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    summary: str | None = None
    tags: list[str] | None = None
    implementation_details: str | None = None
    references: list[str] | None = None
    dependencies: list[int] | None = None


class TaskOut(BaseModel):
    id: int
    requirement_id: int
    tags: list[str]
    summary: str
    implementation_details: str
    references: list[str]
    dependencies: list[int]
    created_at: datetime


# --- Memory ---

class MemoryNodeOut(BaseModel):
    id: int
    parent_id: int | None
    node_type: str
    label: str
    summary: str
    chunk_ids: list[str]
    created_at: datetime


# --- Chat ---

class ChatRequest(BaseModel):
    message: str


class ChatMessage(BaseModel):
    role: str
    content: str | None = None


class ChatResponse(BaseModel):
    response: str
    messages: list[ChatMessage]


# --- Index ---

class IndexRequest(BaseModel):
    content: str


class IndexResponse(BaseModel):
    chunk_ids: list[str]
    node_id: int | None = None
    label: str = ""
    detail: str = ""


# --- Build / Plan ---

class BuildContextResponse(BaseModel):
    markdown: str
    task_id: int


class PlanResponse(BaseModel):
    plan: str
