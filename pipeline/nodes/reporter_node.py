"""
Node 6: Reporter
Direct Claude API call — generates the human-readable confidence report.
This is the final output judges see.
"""

from __future__ import annotations
import json
import os

import anthropic

from models.state import PipelineState, ConfidenceReport

CLIENT = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

_SYSTEM = """You are BehaviorLock's report engine.
Given migration validation results, produce a concise, actionable confidence report for a senior engineer.
Be honest. Be specific. Never hedge with "might" when you have data.
Output ONLY a JSON object."""

_USER = """Generate a confidence report for this migration.

## Validation Summary
- Behavior preservation: {preservation_pct}%
- Test coverage of codebase: {coverage_pct}%
- Tests passing after migration: {passing}/{total}
- Critical drifts (logic changed): {critical_count}
- Non-critical drifts (cosmetic): {non_critical_count}

## Drift Details
{drift_details}

## Migration Changes Applied
{changes_summary}

Respond with JSON:
{{
  "verdict": "SAFE|RISKY|BLOCKED",
  "what_changed": "<2-3 sentences: what the migration actually changed>",
  "why_it_changed": "<1-2 sentences: why these changes were necessary>",
  "rollback_command": "git stash pop",
  "risk_score": <float 0.0 to 1.0>,
  "judge_summary": "<one punchy sentence for the demo card>"
}}

Verdict logic:
- SAFE: preservation >= 98% AND critical_drifts == 0
- RISKY: preservation >= 85% OR critical_drifts <= 2
- BLOCKED: preservation < 85% OR critical_drifts > 2"""


def reporter_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    if not state.validation_result:
        return state.model_copy(update={"error": "No validation result — run validator first", "current_stage": "reporter_failed"})

    vr = state.validation_result

    try:
        drift_details = "\n".join([
            f"- [{d.severity.upper()}] {d.test_name}: {d.description}"
            for d in vr.drifts
        ]) or "No drifts detected."

        changes_summary = "No changes logged."
        if state.migration_patch and state.migration_patch.changes:
            lines = []
            for ch in state.migration_patch.changes[:10]:
                lines.append(f"- [{ch.change_type}] {ch.file}:{ch.lineno} — {ch.description}")
            changes_summary = "\n".join(lines)

        passing = sum(1 for r in vr.migrated_results if r.passed)
        total   = len(vr.migrated_results)

        prompt = _USER.format(
            preservation_pct=vr.behavior_preservation_pct,
            coverage_pct=state.test_suite.coverage_pct if state.test_suite else 0.0,
            passing=passing,
            total=total,
            critical_count=vr.critical_drift_count,
            non_critical_count=vr.non_critical_drift_count,
            drift_details=drift_details,
            changes_summary=changes_summary,
        )

        response = CLIENT.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)

        report = ConfidenceReport(
            verdict=data["verdict"],
            behavior_preservation_pct=vr.behavior_preservation_pct,
            critical_drifts=vr.critical_drift_count,
            non_critical_drifts=vr.non_critical_drift_count,
            what_changed=data.get("what_changed", ""),
            why_it_changed=data.get("why_it_changed", ""),
            rollback_command=data.get("rollback_command", "git stash pop"),
            test_coverage_pct=state.test_suite.coverage_pct if state.test_suite else 0.0,
            risk_score=float(data.get("risk_score", 0.5)),
            judge_summary=data.get("judge_summary", ""),
        )

        print(f"[reporter] ✓ Verdict: {report.verdict} | Risk score: {report.risk_score:.2f}")

        return state.model_copy(update={
            "confidence_report": report,
            "current_stage": "complete",
        })

    except Exception as e:
        return state.model_copy(update={"error": str(e), "current_stage": "reporter_failed"})
