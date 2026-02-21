"""
Node 3c: Risk Gate
Pure Python — no LLM call. Scores risk from memory before migration runs.
Blocks high-risk migrations and fires Discord alerts.
"""

from __future__ import annotations
import asyncio
import os
from datetime import datetime, timezone

from models.state import PipelineState, RiskAssessment, RiskWarning
from storage.memory import RepoMemory
from utils.notifications import send_drift_warning


# ─── Risk threshold ──────────────────────────────────────────────────────────

def _threshold() -> float:
    return float(os.environ.get("BLOC_RISK_THRESHOLD", "0.8"))


# ─── Main node ───────────────────────────────────────────────────────────────

def risk_gate_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    if not state.baseline_run:
        return state.model_copy(update={
            "error": "No baseline run — run baseline first",
            "current_stage": "risk_failed",
        })

    try:
        mem = RepoMemory(state.repo_path)

        # Build synthetic changes from workflow graph nodes (patch doesn't exist yet)
        synthetic_changes = _build_synthetic_changes(state)

        # Query memory for warnings
        raw_warnings = mem.proactive_warnings(synthetic_changes)
        warnings = [
            RiskWarning(
                source=w.get("source", "memory"),
                function=w.get("function", "unknown"),
                severity=w.get("severity", "non_critical") if w.get("severity") in ("critical", "non_critical") else "non_critical",
                message=w.get("message", ""),
                times_seen=w.get("times_seen", 1),
            )
            for w in raw_warnings
        ]

        # Query past runs for verdict history
        past_runs = mem.past_runs(limit=10)
        known_drifts = mem.known_drifts()

        # Compute risk score
        risk_score = _compute_risk_score(
            warnings=warnings,
            past_runs=past_runs,
            known_drifts=known_drifts,
            state=state,
        )

        # Determine risk level
        risk_level = _score_to_level(risk_score)

        # Worst historical verdict
        worst_verdict = _worst_verdict(past_runs)

        # Side-effect density
        side_effect_density = _side_effect_density(state)

        # Test coverage gap
        test_coverage_gap = _test_coverage_gap(state)

        assessment = RiskAssessment(
            risk_score=round(risk_score, 4),
            risk_level=risk_level,
            warnings=warnings,
            known_drift_count=len(known_drifts),
            past_run_count=len(past_runs),
            worst_historical_verdict=worst_verdict,
            side_effect_density=round(side_effect_density, 4),
            test_coverage_gap=round(test_coverage_gap, 4),
            computed_at=datetime.now(timezone.utc).isoformat(),
        )

        print(
            f"[risk_gate] score={assessment.risk_score:.2f} "
            f"level={risk_level} warnings={len(warnings)} "
            f"drift_history={len(known_drifts)} past_runs={len(past_runs)}"
        )

        # Fire Discord alert if score > 0.5
        if risk_score > 0.5:
            dashboard_url = os.environ.get("BASE_URL", "http://localhost:8000")
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(send_drift_warning(
                        repo_path=state.repo_path,
                        session_id=state.session_id,
                        risk_score=risk_score,
                        warnings=warnings,
                        dashboard_url=dashboard_url,
                    ))
                else:
                    loop.run_until_complete(send_drift_warning(
                        repo_path=state.repo_path,
                        session_id=state.session_id,
                        risk_score=risk_score,
                        warnings=warnings,
                        dashboard_url=dashboard_url,
                    ))
            except Exception as e:
                print(f"[risk_gate] Discord notification failed (non-fatal): {e}")

        # Decide whether to block
        threshold = _threshold()
        if risk_score >= threshold:
            return state.model_copy(update={
                "risk_assessment": assessment,
                "current_stage": "risk_blocked",
            })

        return state.model_copy(update={
            "risk_assessment": assessment,
            "current_stage": "risk_analyzed",
        })

    except Exception as e:
        return state.model_copy(update={
            "error": str(e),
            "current_stage": "risk_failed",
        })


# ─── Risk score algorithm ────────────────────────────────────────────────────

def _compute_risk_score(
    warnings: list[RiskWarning],
    past_runs: list[dict],
    known_drifts: list[dict],
    state: PipelineState,
) -> float:
    """
    Max 1.0, four weighted factors:
    - Known drift severity  (max 0.35): critical * 0.15 + non_critical * 0.05
    - Past verdict history  (max 0.25): BLOCKED * 0.10 + RISKY * 0.05
    - Side-effect density   (max 0.20): (se_nodes / total_nodes) * 0.4
    - Test coverage gap     (max 0.20): (1 - coverage_pct/100) * 0.2
    """

    # Factor 1: Known drift severity (max 0.35)
    critical_count = sum(1 for w in warnings if w.severity == "critical")
    non_critical_count = sum(1 for w in warnings if w.severity == "non_critical")
    drift_factor = min(critical_count * 0.15 + non_critical_count * 0.05, 0.35)

    # Factor 2: Past verdict history (max 0.25)
    blocked_count = sum(1 for r in past_runs if r.get("verdict") == "BLOCKED")
    risky_count = sum(1 for r in past_runs if r.get("verdict") == "RISKY")
    verdict_factor = min(blocked_count * 0.10 + risky_count * 0.05, 0.25)

    # Factor 3: Side-effect density (max 0.20)
    se_density = _side_effect_density(state)
    se_factor = min(se_density * 0.4, 0.20)

    # Factor 4: Test coverage gap (max 0.20)
    cov_gap = _test_coverage_gap(state)
    cov_factor = min(cov_gap * 0.2, 0.20)

    total = drift_factor + verdict_factor + se_factor + cov_factor
    return min(total, 1.0)


def _score_to_level(score: float) -> str:
    if score < 0.3:
        return "low"
    if score < 0.5:
        return "medium"
    if score < 0.8:
        return "high"
    return "blocked"


def _worst_verdict(past_runs: list[dict]) -> str | None:
    priority = {"BLOCKED": 3, "RISKY": 2, "SAFE": 1}
    worst = None
    worst_p = 0
    for r in past_runs:
        v = r.get("verdict")
        if v and priority.get(v, 0) > worst_p:
            worst = v
            worst_p = priority[v]
    return worst


# ─── Helper metrics ──────────────────────────────────────────────────────────

def _side_effect_density(state: PipelineState) -> float:
    if not state.workflow_graph or not state.workflow_graph.nodes:
        return 0.0
    total = len(state.workflow_graph.nodes)
    se_nodes = sum(1 for n in state.workflow_graph.nodes if n.node_type == "sideeffect")
    return se_nodes / total if total > 0 else 0.0


def _test_coverage_gap(state: PipelineState) -> float:
    if not state.test_suite:
        return 1.0  # no tests = full gap
    return 1.0 - (state.test_suite.coverage_pct / 100.0)


def _build_synthetic_changes(state: PipelineState) -> list[dict]:
    """Build synthetic patch changes from workflow graph nodes for proactive_warnings()."""
    changes = []
    if state.workflow_graph:
        for node in state.workflow_graph.nodes:
            changes.append({
                "file": node.module,
                "description": f"{node.name} ({node.node_type}): {', '.join(node.side_effects) or 'no side effects'}",
            })
    return changes
