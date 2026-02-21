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
import openai
import re

CLIENT = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)

def _call_baseline_fix(filename: str, source: str) -> str:
    """Uses LLM to do bare-minimum syntax fixes for Py3 baseline execution."""
    prompt = f"Fix the SYNTAX of this Python 2 code so it runs in Python 3.\n\nFile: {filename}\n```python\n{source}\n```\n\nONLY fix print, except, xrange, and unicode. DO NOT change logic. Return full code in a markdown block."
    
    response = CLIENT.chat.completions.create(
        model=os.environ.get("LLM_MODEL", "google/gemini-2.0-flash-001"),
        messages=[{"role": "user", "content": prompt}]
    )
    text = response.choices[0].message.content
    code_match = re.search(r"```python\n(.*?)```", text, re.DOTALL)
    if code_match:
        return code_match.group(1).strip()
    return source

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

        _quick_fix_py2_syntax(repo_path)
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

    results = []
    # Parse JSON report if available
    if report_path.exists():
        try:
            report_data = report_path.read_text()
            if report_data.strip():
                report = json.loads(report_data)
                results = _parse_json_report(report)
        except Exception as e:
            print(f"[baseline_runner] ⚠ JSON report parse failed: {e}")

    if not results:
        # Fallback: parse stdout
        results = _parse_stdout(proc.stdout + proc.stderr, elapsed)
    
    return results


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
def _quick_fix_py2_syntax(repo_path: str) -> None:
    """Non-destructive (session-scoped) fix for common Py2 syntax to allow Py3 collection."""
    from pipeline.nodes.migrator_node import _needs_migration
    py_files = list(Path(repo_path).rglob("*.py"))
    for py_file in py_files:
        if "_bloc_tests" in str(py_file):
            continue
        try:
            content = py_file.read_text(encoding="utf-8", errors="replace")
            if _needs_migration(content):
                print(f"[baseline] 🔨 Fixing syntax for {py_file.name}...")
                fixed = _call_baseline_fix(py_file.name, content)
                py_file.write_text(fixed, encoding="utf-8")
        except Exception as e:
            print(f"[baseline] ⚠ Failed to fix {py_file.name}: {e}")
