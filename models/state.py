from __future__ import annotations
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ─── Graph node ───────────────────────────────────────────────────────────────

class CallNode(BaseModel):
    id: str
    name: str
    module: str
    lineno: int
    node_type: Literal["function", "class", "entrypoint", "sideeffect"]
    side_effects: list[str] = Field(default_factory=list)  # "file_io", "env_read", "db", "network"


class CallEdge(BaseModel):
    source: str
    target: str
    call_type: Literal["direct", "conditional", "loop"]


class WorkflowGraph(BaseModel):
    nodes: list[CallNode]
    edges: list[CallEdge]
    entrypoints: list[str]
    side_effect_paths: list[list[str]]  # paths that touch side effects


# ─── Test generation ──────────────────────────────────────────────────────────

class GeneratedTest(BaseModel):
    function_name: str
    test_code: str                  # full pytest source
    snapshot_inputs: list[str]      # human-readable description of fixture inputs
    covers_side_effects: bool


class TestSuite(BaseModel):
    tests: list[GeneratedTest]
    total: int
    target_module: str
    coverage_pct: float = 0.0               # % of codebase functions covered
    covered_functions: list[str] = Field(default_factory=list)
    uncovered_functions: list[str] = Field(default_factory=list)


# ─── Baseline run ─────────────────────────────────────────────────────────────

class TestResult(BaseModel):
    test_name: str
    passed: bool
    output: str
    duration_ms: float


class BaselineRun(BaseModel):
    results: list[TestResult]
    passed: int
    failed: int
    total: int
    snapshot_hash: str              # deterministic hash of all outputs for diffing


# ─── Migration patch ─────────────────────────────────────────────────────────

class PatchChange(BaseModel):
    file: str
    change_type: Literal["syntax", "api", "semantic", "dead_code"]
    description: str
    before: str
    after: str
    lineno: int


class MigrationPatch(BaseModel):
    unified_diff: str               # full unified diff string
    changes: list[PatchChange]
    lint_passed: bool
    lint_errors: list[str]


# ─── Validation ───────────────────────────────────────────────────────────────

class DriftItem(BaseModel):
    test_name: str
    severity: Literal["critical", "non_critical"]
    description: str
    before_output: str
    after_output: str


class ValidationResult(BaseModel):
    migrated_results: list[TestResult]
    drifts: list[DriftItem]
    critical_drift_count: int
    non_critical_drift_count: int
    behavior_preservation_pct: float


# ─── Risk assessment ─────────────────────────────────────────────────────

class RiskWarning(BaseModel):
    source: Literal["memory", "rag", "heuristic"]
    function: str
    severity: Literal["critical", "non_critical"]
    message: str
    times_seen: int = 1


class RiskAssessment(BaseModel):
    risk_score: float                         # 0.0 → 1.0
    risk_level: Literal["low", "medium", "high", "blocked"]
    warnings: list[RiskWarning]
    known_drift_count: int
    past_run_count: int
    worst_historical_verdict: Optional[str]   # from past runs
    side_effect_density: float
    test_coverage_gap: float
    computed_at: str                          # ISO timestamp


# ─── Dead code detection ─────────────────────────────────────────────────────

class DeadCodeItem(BaseModel):
    name: str                       # qualified function/block name
    module: str
    lineno: int
    kind: Literal["unreachable", "zero_callers", "commented_block"]
    detail: str                     # human-readable explanation
    source_snippet: str = ""        # first few lines of the dead code


class DeadCodeReport(BaseModel):
    items: list[DeadCodeItem]
    total: int
    unreachable_count: int
    zero_caller_count: int
    commented_block_count: int


# ─── Final report ─────────────────────────────────────────────────────────────

class ConfidenceReport(BaseModel):
    verdict: Literal["SAFE", "RISKY", "BLOCKED"]
    behavior_preservation_pct: float
    critical_drifts: int
    non_critical_drifts: int
    what_changed: str               # LLM plain-English summary
    why_it_changed: str
    rollback_command: str
    test_coverage_pct: float = 0.0   # % of codebase covered by tests
    risk_score: float               # 0.0 (safe) → 1.0 (blocked)
    judge_summary: str              # one-liner for the demo card


# ─── Master pipeline state (LangGraph StateGraph) ────────────────────────────

class PipelineState(BaseModel):
    # Input
    session_id: str = ""
    repo_path: str = ""
    target_module: Optional[str] = None

    # Stage outputs
    workflow_graph: Optional[WorkflowGraph] = None
    dead_code_report: Optional[DeadCodeReport] = None
    test_suite: Optional[TestSuite] = None
    baseline_run: Optional[BaselineRun] = None
    risk_assessment: Optional[RiskAssessment] = None
    migration_patch: Optional[MigrationPatch] = None
    validation_result: Optional[ValidationResult] = None
    confidence_report: Optional[ConfidenceReport] = None

    # Pipeline control
    current_stage: str = "idle"
    error: Optional[str] = None
    migrated_repo_path: Optional[str] = None
