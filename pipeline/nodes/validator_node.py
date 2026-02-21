"""
Node 5: Validator
Pure Python — re-run characterization tests against the migrated codebase,
diff against baseline snapshot, classify drifts.
"""

from __future__ import annotations
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from models.state import (
    PipelineState, ValidationResult, TestResult, DriftItem
)
from pipeline.nodes.baseline_runner_node import _run_pytest


def validator_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    if not state.baseline_run:
        return state.model_copy(update={"error": "No baseline — run baseline_runner first", "current_stage": "validator_failed"})

    if not state.migrated_repo_path:
        return state.model_copy(update={"error": "No migrated repo — run migrator first", "current_stage": "validator_failed"})

    if not state.test_suite:
        return state.model_copy(update={"error": "No test suite", "current_stage": "validator_failed"})

    migrated_path = state.migrated_repo_path
    baseline      = state.baseline_run
    test_suite    = state.test_suite

    try:
        # Copy the generated tests into the migrated repo
        test_dir = Path(migrated_path) / "_bloc_tests"
        test_dir.mkdir(exist_ok=True)
        (test_dir / "__init__.py").touch()

        for i, test in enumerate(test_suite.tests):
            safe_name = test.function_name.replace(".", "_")
            test_file = test_dir / f"test_{safe_name}_{i}.py"
            test_file.write_text(test.test_code, encoding="utf-8")

        migrated_results = _run_pytest(migrated_path, test_dir)

        # Diff against baseline
        baseline_map  = {r.test_name: r for r in baseline.results}
        migrated_map  = {r.test_name: r for r in migrated_results}

        drifts: list[DriftItem] = []

        for test_name, migrated_result in migrated_map.items():
            baseline_result = baseline_map.get(test_name)

            if baseline_result is None:
                continue

            # A drift is: baseline passed but migrated failed, OR output changed
            is_failure_drift = baseline_result.passed and not migrated_result.passed
            is_output_drift  = (
                baseline_result.passed
                and migrated_result.passed
                and baseline_result.output.strip() != migrated_result.output.strip()
                and baseline_result.output.strip() != ""
            )

            if is_failure_drift or is_output_drift:
                severity = "critical" if is_failure_drift else "non_critical"
                drifts.append(DriftItem(
                    test_name=test_name,
                    severity=severity,
                    description=_describe_drift(
                        is_failure_drift, is_output_drift,
                        baseline_result, migrated_result
                    ),
                    before_output=baseline_result.output[:300],
                    after_output=migrated_result.output[:300],
                ))

        total = len(migrated_results)
        passing = sum(1 for r in migrated_results if r.passed)
        preservation_pct = (passing / total * 100) if total > 0 else 0.0

        critical_count     = sum(1 for d in drifts if d.severity == "critical")
        non_critical_count = sum(1 for d in drifts if d.severity == "non_critical")

        result = ValidationResult(
            migrated_results=migrated_results,
            drifts=drifts,
            critical_drift_count=critical_count,
            non_critical_drift_count=non_critical_count,
            behavior_preservation_pct=round(preservation_pct, 1),
        )

        print(
            f"[validator] ✓ {passing}/{total} tests pass | "
            f"{critical_count} critical drifts | "
            f"{preservation_pct:.1f}% preserved"
        )

        return state.model_copy(update={
            "validation_result": result,
            "current_stage": "validation_complete",
        })

    except Exception as e:
        return state.model_copy(update={"error": str(e), "current_stage": "validator_failed"})


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _describe_drift(
    is_failure: bool,
    is_output: bool,
    before: TestResult,
    after: TestResult,
) -> str:
    if is_failure:
        return (
            f"Test passed on legacy code but FAILED after migration. "
            f"Migration likely changed behavior. Error: {after.output[:200]}"
        )
    if is_output:
        return (
            f"Test passed both before and after, but output changed. "
            f"May indicate cosmetic change or subtle logic shift."
        )
    return "Unknown drift type."
