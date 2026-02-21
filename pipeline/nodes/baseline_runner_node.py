"""
Node 3b: Baseline Runner
Pure Python — writes generated tests to disk, runs pytest in a subprocess,
captures results, stores snapshot hash.
"""

from __future__ import annotations
import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

from models.state import PipelineState, BaselineRun, TestResult


def baseline_runner_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    if not state.test_suite:
        return state.model_copy(update={"error": "No test suite — run testgen first", "current_stage": "baseline_failed"})

    repo_path  = state.repo_path
    test_suite = state.test_suite

    try:
        # Write test files to a temp dir inside the repo (so imports resolve)
        test_dir = Path(repo_path) / "_bloc_tests"
        test_dir.mkdir(exist_ok=True)
        (test_dir / "__init__.py").touch()

        written_files: list[Path] = []
        for i, test in enumerate(test_suite.tests):
            safe_name = test.function_name.replace(".", "_")
            test_file = test_dir / f"test_{safe_name}_{i}.py"
            test_file.write_text(test.test_code, encoding="utf-8")
            written_files.append(test_file)

        results = _run_pytest(repo_path, test_dir)

        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        # Snapshot hash — deterministic fingerprint of all test outputs
        output_blob = json.dumps(
            [{"name": r.test_name, "output": r.output, "passed": r.passed} for r in results],
            sort_keys=True,
        )
        snapshot_hash = hashlib.sha256(output_blob.encode()).hexdigest()[:16]

        baseline = BaselineRun(
            results=results,
            passed=passed,
            failed=failed,
            total=len(results),
            snapshot_hash=snapshot_hash,
        )

        print(f"[baseline_runner] ✓ {passed}/{len(results)} tests passed | hash: {snapshot_hash}")

        return state.model_copy(update={
            "baseline_run": baseline,
            "current_stage": "baseline_complete",
        })

    except Exception as e:
        return state.model_copy(update={"error": str(e), "current_stage": "baseline_failed"})


# ─── pytest runner ────────────────────────────────────────────────────────────

def _run_pytest(repo_path: str, test_dir: Path) -> list[TestResult]:
    report_path = Path(repo_path) / "_bloc_report.json"

    import sys
    cmd = [
        sys.executable, "-m", "pytest",
        str(test_dir),
        "--json-report",
        f"--json-report-file={report_path}",
        "--tb=short",
        "-q",
        "--timeout=30",
    ]

    start = time.time()
    proc = subprocess.run(
        cmd,
        cwd=repo_path,
        capture_output=True,
        text=True,
        timeout=120,
    )
    elapsed = (time.time() - start) * 1000

    # Parse JSON report if available
    if report_path.exists():
        try:
            report = json.loads(report_path.read_text())
            return _parse_json_report(report)
        except Exception:
            pass

    # Fallback: parse stdout
    return _parse_stdout(proc.stdout + proc.stderr, elapsed)


def _parse_json_report(report: dict) -> list[TestResult]:
    results = []
    for test in report.get("tests", []):
        results.append(TestResult(
            test_name=test.get("nodeid", "unknown"),
            passed=test.get("outcome", "") == "passed",
            output=test.get("call", {}).get("longrepr", "") or "",
            duration_ms=test.get("call", {}).get("duration", 0) * 1000,
        ))
    return results


def _parse_stdout(output: str, elapsed_ms: float) -> list[TestResult]:
    """Minimal fallback parser for pytest stdout."""
    results = []
    for line in output.splitlines():
        if " PASSED" in line or " FAILED" in line or " ERROR" in line:
            passed = " PASSED" in line
            name   = line.split("::")[0].strip() if "::" in line else line.strip()
            results.append(TestResult(
                test_name=name,
                passed=passed,
                output=line,
                duration_ms=elapsed_ms / max(len(results) + 1, 1),
            ))
    if not results:
        # Return a synthetic result reflecting overall run
        all_passed = "failed" not in output.lower() and "error" not in output.lower()
        results.append(TestResult(
            test_name="suite",
            passed=all_passed,
            output=output[:500],
            duration_ms=elapsed_ms,
        ))
    return results
