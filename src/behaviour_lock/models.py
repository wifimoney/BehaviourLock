"""Pydantic models for UserRequirement and Task."""

from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, Field


class Project(BaseModel):
    slug: str  # URL-safe directory name
    name: str
    source_path: str  # legacy project folder that was indexed
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TagEnum(enum.StrEnum):
    INFRA = "infra"
    TEST = "test"
    FEATURE = "feature"
    DOCS = "docs"
    REFACTOR = "refactor"


class MemoryNode(BaseModel):
    id: int | None = None
    parent_id: int | None = None
    node_type: str  # "root" | "subsystem" | "file" | "fact"
    label: str  # short name (filename, subsystem name, etc.)
    summary: str  # LLM-generated description
    chunk_ids: list[str] = Field(default_factory=list)  # ChromaDB chunk IDs grounding this node
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserRequirement(BaseModel):
    id: int | None = None
    summary: str
    content: str
    references: list[str] = Field(default_factory=list)  # memory node IDs grounding this requirement
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Task(BaseModel):
    id: int | None = None
    requirement_id: int  # FK — every task belongs to a requirement
    tags: list[TagEnum] = Field(default_factory=list)
    summary: str
    implementation_details: str = ""
    references: list[str] = Field(default_factory=list)  # memory node IDs grounding this task
    dependencies: list[int] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
