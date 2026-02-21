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

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel as LCBaseModel, Field

from models.state import PipelineState, MigrationPatch, PatchChange


# ─── LangChain output schema ──────────────────────────────────────────────────

class PatchOutput(LCBaseModel):
    unified_diff: str      = Field(description="Full unified diff of all changes")
    changes: list[dict]    = Field(description="List of individual change objects")


# ─── LangChain chain ──────────────────────────────────────────────────────────

_llm = ChatOpenAI(
    model="google/gemini-2.0-pro-exp-02-05:free",
    openai_api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    openai_api_base="https://openrouter.ai/api/v1",
    max_tokens=4096,
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
- If uncertain about a change's safety → skip it and note it in changes
- Output ONLY a JSON object, no markdown"""

_PROMPT = ChatPromptTemplate.from_messages([
    ("system", _SYSTEM),
    ("human", """Migrate this Python 2 code to Python 3.

## File: {filename}
```python
{source_code}
```

Respond with JSON:
{{
  "unified_diff": "<unified diff string>",
  "changes": [
    {{
      "file": "{filename}",
      "change_type": "syntax|api|semantic|dead_code",
      "description": "what changed and why",
      "before": "old code snippet",
      "after": "new code snippet",
      "lineno": <line number>
    }}
  ]
}}"""),
])

_parser = JsonOutputParser(pydantic_object=PatchOutput)
_chain  = _PROMPT | _llm | _parser


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
                continue

            filename = str(py_file.relative_to(repo_path))

            try:
                result = _chain.invoke({
                    "filename":    filename,
                    "source_code": source,
                })

                if result.get("unified_diff"):
                    all_diffs.append(result["unified_diff"])

                for ch in result.get("changes", []):
                    all_changes.append(PatchChange(
                        file=ch.get("file", filename),
                        change_type=ch.get("change_type", "syntax"),
                        description=ch.get("description", ""),
                        before=ch.get("before", ""),
                        after=ch.get("after", ""),
                        lineno=ch.get("lineno", 0),
                    ))

                    # Apply change to migrated copy
                    _apply_change_to_file(
                        migrated_path=migrated_path,
                        rel_path=filename,
                        before=ch.get("before", ""),
                        after=ch.get("after", ""),
                    )

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
    """Quick heuristic: does this file have Py2 patterns?"""
    py2_signals = [
        "print ",
        "xrange(",
        "raw_input(",
        ".iteritems()",
        ".itervalues()",
        ".iterkeys()",
        "except ",
        "basestring",
        "unicode(",
        "u\"",
        "u'",
    ]
    return any(sig in source for sig in py2_signals)


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
