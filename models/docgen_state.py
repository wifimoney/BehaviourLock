from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ─── Agent 1: Scanner output ──────────────────────────────────────────────────

class ExtractedFunction(BaseModel):
    name: str
    signature: str
    docstring: Optional[str]
    params: list[dict]          # [{"name": "x", "type": "int", "desc": "..."}]
    returns: Optional[str]
    side_effects: list[str]
    calls: list[str]            # other functions it calls
    lineno: int
    complexity: Literal["low", "medium", "high"]


class ExtractedClass(BaseModel):
    name: str
    docstring: Optional[str]
    methods: list[str]
    base_classes: list[str]
    lineno: int


class ScannerOutput(BaseModel):
    functions: list[ExtractedFunction]
    classes: list[ExtractedClass]
    module_purpose: str          # LLM-inferred one-liner about what this module does
    biz_logic_hints: list[str]   # LLM-spotted business rules (e.g. "fee capped at 5%")
    dependencies: list[str]      # external imports
    entrypoints: list[str]       # public-facing functions


# ─── Agent 2: Writer output ───────────────────────────────────────────────────

class DocSection(BaseModel):
    title: str
    content: str                 # markdown


class WriterDraft(BaseModel):
    overview: str                # module-level overview paragraph
    sections: list[DocSection]   # one per function/class
    usage_examples: list[str]    # code snippets showing how to use
    raw_markdown: str            # full assembled draft


# ─── Agent 3: QA / Biz Logic output ──────────────────────────────────────────

class QAIssue(BaseModel):
    section: str
    issue_type: str  # Flexible for different model versions
    description: str
    suggested_fix: str


class QAOutput(BaseModel):
    issues_found: list[QAIssue]
    biz_logic_added: list[str]   # new biz logic points injected
    revised_markdown: str        # markdown with QA fixes applied
    qa_score: float              # 0.0–1.0 confidence the doc is accurate


# ─── Agent 4: Proofreader output ─────────────────────────────────────────────

class ProofreadOutput(BaseModel):
    changes_made: list[str]      # list of edits ("fixed inconsistent tone on line 42")
    final_markdown: str          # final polished markdown
    word_count: int
    ready_for_review: bool       # False if proofreader flagged something serious


# ─── Human-in-the-loop ────────────────────────────────────────────────────────

class HumanReview(BaseModel):
    status: Literal["pending", "approved", "rejected", "revision_requested"]
    reviewer_comment: Optional[str] = None
    reviewed_at: Optional[str] = None


# ─── Requests ─────────────────────────────────────────────────────────────────

class DocGenRequest(BaseModel):
    repo_path: str
    target_module: Optional[str] = None


class ApprovalRequest(BaseModel):
    status: str           # "approved" | "rejected" | "revision_requested"
    comment: Optional[str] = None


# ─── Master DocGen state ──────────────────────────────────────────────────────

class DocGenState(BaseModel):
    # Input
    session_id: str
    repo_path: str
    target_module: Optional[str] = None
    source_code: str = ""        # raw source passed to scanner

    # Stage outputs
    scanner_output: Optional[ScannerOutput] = None
    writer_draft: Optional[WriterDraft] = None
    qa_output: Optional[QAOutput] = None
    proofread_output: Optional[ProofreadOutput] = None

    # Human review
    human_review: HumanReview = Field(default_factory=lambda: HumanReview(status="pending"))

    # Control
    current_stage: str = "idle"
    error: Optional[str] = None
    iteration: int = 0           # how many revision loops happened
