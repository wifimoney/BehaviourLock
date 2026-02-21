"""
Agent 1 — SCANNER
Reads raw source code, extracts all functions/classes/params via AST,
then uses Claude to infer module purpose and spot business logic hints.
"""

from __future__ import annotations
import ast
import json
import os
from pathlib import Path

import anthropic

from models.docgen_state import (
    DocGenState, ExtractedFunction, ExtractedClass, ScannerOutput
)
from storage.memory import RepoMemory

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ─── Pure AST extraction ──────────────────────────────────────────────────────

def _extract_functions(tree: ast.Module) -> list[dict]:
    funcs = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            params = []
            for arg in node.args.args:
                annotation = ""
                if arg.annotation:
                    try:
                        annotation = ast.unparse(arg.annotation)
                    except Exception:
                        annotation = ""
                params.append({"name": arg.arg, "type": annotation, "desc": ""})

            returns = ""
            if node.returns:
                try:
                    returns = ast.unparse(node.returns)
                except Exception:
                    pass

            docstring = ast.get_docstring(node) or ""

            # Detect side effects
            side_effects = []
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    try:
                        call = ast.unparse(child)
                        if any(s in call for s in ["open(", "write(", "read("]):
                            if "file_io" not in side_effects:
                                side_effects.append("file_io")
                        if any(s in call for s in ["os.environ", "getenv"]):
                            if "env_read" not in side_effects:
                                side_effects.append("env_read")
                        if any(s in call for s in ["requests.", "urllib", "http"]):
                            if "network" not in side_effects:
                                side_effects.append("network")
                        if any(s in call for s in ["cursor.", "execute(", "query("]):
                            if "db" not in side_effects:
                                side_effects.append("db")
                    except Exception:
                        pass

            # Calls made
            calls = []
            for child in ast.walk(node):
                if isinstance(child, ast.Call) and isinstance(child.func, ast.Name):
                    if child.func.id not in calls and child.func.id != node.name:
                        calls.append(child.func.id)

            # Rough complexity
            branch_count = sum(
                1 for n in ast.walk(node)
                if isinstance(n, (ast.If, ast.For, ast.While, ast.Try, ast.ExceptHandler))
            )
            complexity = "low" if branch_count <= 2 else "medium" if branch_count <= 6 else "high"

            funcs.append({
                "name": node.name,
                "signature": f"def {node.name}({', '.join(a['name'] for a in params)})",
                "docstring": docstring,
                "params": params,
                "returns": returns,
                "side_effects": side_effects,
                "calls": calls[:10],
                "lineno": node.lineno,
                "complexity": complexity,
            })
    return funcs


def _extract_classes(tree: ast.Module) -> list[dict]:
    classes = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            methods = [
                n.name for n in ast.walk(node)
                if isinstance(n, ast.FunctionDef)
            ]
            bases = []
            for base in node.bases:
                try:
                    bases.append(ast.unparse(base))
                except Exception:
                    pass
            classes.append({
                "name": node.name,
                "docstring": ast.get_docstring(node) or "",
                "methods": methods,
                "base_classes": bases,
                "lineno": node.lineno,
            })
    return classes


def _get_imports(tree: ast.Module) -> list[str]:
    deps = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                deps.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                deps.append(node.module)
    return list(set(deps))


# ─── LLM pass: infer module purpose + biz logic ──────────────────────────────

def _llm_infer(source_code: str, functions: list[dict], classes: list[dict]) -> dict:
    func_names = [f["name"] for f in functions]
    class_names = [c["name"] for c in classes]

    prompt = f"""You are a technical documentation expert analysing legacy Python code.

Source code:
```python
{source_code[:4000]}
```

Functions found: {func_names}
Classes found: {class_names}

Return ONLY valid JSON with this exact schema:
{{
  "module_purpose": "one sentence describing what this module does",
  "biz_logic_hints": ["list of business rules you spotted, e.g. 'fee is capped at 5%'"],
  "entrypoints": ["list of function names that are the public API / main entry points"]
}}"""

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}]
    )

    text = response.content[0].text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


# ─── Node ─────────────────────────────────────────────────────────────────────

def scanner_node(state: DocGenState) -> DocGenState:
    state.current_stage = "scanning"

    try:
        source = state.source_code
        if not source and state.repo_path:
            # Load all .py files concatenated
            parts = []
            for p in Path(state.repo_path).rglob("*.py"):
                try:
                    parts.append(f"# === {p.name} ===\n" + p.read_text(errors="ignore"))
                except Exception:
                    pass
            source = "\n\n".join(parts)
            state.source_code = source

        if not source:
            raise ValueError("No source code found")

        # Parse first non-empty file for AST (use concatenated for LLM)
        try:
            tree = ast.parse(source)
        except SyntaxError:
            # Py2 syntax — best effort, parse what we can
            tree = ast.parse("# could not fully parse", mode="exec")

        raw_funcs   = _extract_functions(tree)
        raw_classes = _extract_classes(tree)
        deps        = _get_imports(tree)

        llm_data = _llm_infer(source, raw_funcs, raw_classes)

        functions = [ExtractedFunction(**f) for f in raw_funcs]
        classes   = [ExtractedClass(**c) for c in raw_classes]

        state.scanner_output = ScannerOutput(
            functions=functions,
            classes=classes,
            module_purpose=llm_data.get("module_purpose", ""),
            biz_logic_hints=llm_data.get("biz_logic_hints", []),
            dependencies=deps,
            entrypoints=llm_data.get("entrypoints", []),
        )
        state.current_stage = "scanned"

        # ── Persist to memory ─────────────────────────────────────────────
        if state.repo_path:
            try:
                mem = RepoMemory(state.repo_path)
                changed = mem.record_functions(functions)
                mem.record_biz_logic(state.scanner_output.biz_logic_hints)
                if changed:
                    print(f"[scanner] ✓ {len(changed)} function(s) changed since last run: "
                          f"{[c['name'] for c in changed]}")
                    # Attach changed functions to state for QA awareness
                    state.scanner_output.biz_logic_hints += [
                        f"CHANGED SINCE LAST RUN: {c['name']} — signature was: {c['previous_sig']}"
                        for c in changed
                    ]
                print(f"[scanner] ✓ Indexed {len(functions)} functions into memory for {mem.repo_id}")
            except Exception as mem_err:
                print(f"[scanner] ⚠ Memory write failed (non-fatal): {mem_err}")

    except Exception as e:
        state.error = f"scanner_node: {e}"

    return state
