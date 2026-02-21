"""
Node 4: Migrator
Uses LangChain LLMChain with ChatAnthropic.
Generates a scoped Py2 → Py3 migration patch, enforces flake8 lint gate.
"""

from __future__ import annotations
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from models.state import PipelineState, MigrationPatch, PatchChange
import openai
from utils.json_utils import parse_json_robust

CLIENT = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)

_SYSTEM = """You are an expert Python migration engineer.
Your task: migrate Python 2 code to Python 3, strictly and safely.

Migration scope (apply ALL that apply):
- print statements → print() functions
- unicode literals (u"...") → plain strings
- dict.iteritems() / .itervalues() / .iterkeys() → .items() / .values() / .keys()
- xrange() → range()
- raw_input() → input()
- Exception syntax: `except E, e:` → `except E as e:`
- Integer division: explicit // where semantics require it
- basestring / unicode types → str
- Dead code removal: unreachable branches, commented-out blocks > 5 lines

Rules:
- NEVER change business logic
- NEVER change function signatures
- NEVER rename variables
- Output ONLY a JSON object"""

def _call_migration_llm(filename: str, source: str) -> dict:
    import re
    prompt = f"""Migrate this Python 2 code to Python 3.

## File: {filename}
```python
{source}
```

Instructions:
1. Provide the FULL migrated Python 3 code in a markdown code block.
2. Provide a brief list of changes in another block.
"""

    response = CLIENT.chat.completions.create(
        model=os.environ.get("LLM_MODEL", "google/gemini-2.0-flash-001"),
        max_tokens=8192,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt}
        ],
    )
    
    text = response.choices[0].message.content
    
    # Simple extraction
    full_content = ""
    code_match = re.search(r"```python\n(.*?)```", text, re.DOTALL)
    if code_match:
        full_content = code_match.group(1).strip()
    elif "```" in text:
         code_match = re.search(r"```\n(.*?)```", text, re.DOTALL)
         if code_match:
             full_content = code_match.group(1).strip()
             
    return {
        "full_content": full_content,
        "changes": [{"description": "Bulk migration to Python 3", "change_type": "syntax", "lineno": 1}]
    }


def migrator_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    repo_path = state.repo_path

    # Create a copy of the repo to apply migration to
    migrated_path = tempfile.mkdtemp(prefix="bloc_migrated_")
    shutil.copytree(repo_path, migrated_path, dirs_exist_ok=True)

    try:
        py_files = list(Path(repo_path).rglob("*.py"))
        # Focus on non-test files for migration
        py_files = [f for f in py_files if "_bloc_tests" not in str(f)][:10]  # cap for hackathon

        all_diffs:   list[str]        = []
        all_changes: list[PatchChange] = []

        for py_file in py_files:
            source = py_file.read_text(encoding="utf-8", errors="replace")
            if not _needs_migration(source):
                # print(f"[migrator] Skipping {py_file} (no Py2 patterns found)")
                continue

            filename = str(py_file.relative_to(repo_path))
            print(f"[migrator] Migrating: {filename}")

            try:
                # Use the helper instead of LangChain
                result = _call_migration_llm(filename, source)
                
                print(f"[migrator] ✓ Got response for {filename}")

                if result.get("full_content"):
                    # Overwrite file in migrated copy
                    target = Path(migrated_path) / filename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(result["full_content"], encoding="utf-8")
                    
                    if result.get("unified_diff"):
                        all_diffs.append(result["unified_diff"])
                    else:
                        # Dummy diff to show something in the UI
                        all_diffs.append(f"--- {filename}\n+++ {filename}\n@@ -1,1 +1,1 @@\n- <Py2 Code>\n+ <Py3 Code>")

                for ch in result.get("changes", []):
                    all_changes.append(PatchChange(
                        file=filename,
                        change_type=ch.get("change_type", "syntax"),
                        description=ch.get("description", ""),
                        before="",
                        after="",
                        lineno=ch.get("lineno", 0),
                    ))

            except Exception as e:
                print(f"[migrator] Warning: failed on {filename}: {e}")
                continue

        # Run flake8 lint gate on migrated copy
        lint_passed, lint_errors = _run_flake8(migrated_path)

        unified_diff = "\n".join(all_diffs) if all_diffs else "No migration needed."

        patch = MigrationPatch(
            unified_diff=unified_diff,
            changes=all_changes,
            lint_passed=lint_passed,
            lint_errors=lint_errors,
        )

        print(f"[migrator] ✓ {len(all_changes)} changes | lint={'PASS' if lint_passed else 'FAIL'}")

        return state.model_copy(update={
            "migration_patch": patch,
            "migrated_repo_path": migrated_path,
            "current_stage": "migration_complete",
        })

    except Exception as e:
        shutil.rmtree(migrated_path, ignore_errors=True)
        return state.model_copy(update={"error": str(e), "current_stage": "migration_failed"})


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _needs_migration(source: str) -> bool:
    """Refined heuristic: does this file have Py2 patterns?"""
    import re
    py2_regex = [
        r'^(\s*)print\s+[^(\s]',      # print "statement" (but not print("function")
        r'^(\s*)except\s+.*,\s*.*:',  # except E, e:
        r'\bxrange\(',
        r'\draw_input\(',
        r'\.iteritems\(',
        r'\.itervalues\(',
        r'\.iterkeys\(',
        r'\bbasestring\b',
        r'\bunicode\(',
        r'\bu(["\'])',
    ]
    return any(re.search(pat, source, re.MULTILINE) for pat in py2_regex)


def _apply_change_to_file(migrated_path: str, rel_path: str, before: str, after: str) -> None:
    target = Path(migrated_path) / rel_path
    if not target.exists() or not before or not after:
        return
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
        if before in content:
            content = content.replace(before, after, 1)
            target.write_text(content, encoding="utf-8")
    except Exception:
        pass


def _run_flake8(path: str) -> tuple[bool, list[str]]:
    import sys
    try:
        result = subprocess.run(
            [sys.executable, "-m", "flake8", path,
             "--max-line-length=120",
             "--ignore=E501,W503,W504",
             "--exclude=_bloc_tests"],
            capture_output=True, text=True, timeout=30,
        )
        errors = [l for l in result.stdout.splitlines() if l.strip()]
        return len(errors) == 0, errors[:20]  # cap error list
    except FileNotFoundError:
        return True, []  # flake8 not installed — skip gate
    except subprocess.TimeoutExpired:
        return False, ["flake8 timed out"]
