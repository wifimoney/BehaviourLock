"""Pydantic models for UserRequirement and Task."""
from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, Field


class TagEnum(str, enum.Enum):
    INFRA = "infra"
    TEST = "test"
    FEATURE = "feature"
    DOCS = "docs"
    REFACTOR = "refactor"


class UserRequirement(BaseModel):
    id: int | None = None
    summary: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Task(BaseModel):
    id: int | None = None
    tags: list[TagEnum] = Field(default_factory=list)
    summary: str
    implementation_details: str = ""
    dependencies: list[int] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
