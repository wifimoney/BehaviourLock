"""
Node 3: Test Generator
Direct Claude API call (not LangChain) — we want tight control over the prompt
and structured JSON output for test code.
"""

from __future__ import annotations
import hashlib
import json
import os
import re
from pathlib import Path

import openai

from models.state import PipelineState, GeneratedTest, TestSuite

CLIENT = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)

TESTGEN_SYSTEM = """You are an expert Python test engineer specialising in characterization tests.

Your job: given a Python function and its call graph context, generate a pytest test that:
1. Calls the function with realistic inputs
2. If the function returns a value, assert the result matches the expected "golden" result
3. If the function prints, use the `capsys` fixture to capture and assert against the expected output
4. Covers any side effects (file I/O, env reads, etc.) with mocks

Rules:
- Use pytest and unittest.mock ONLY — NO third-party libraries (no pytest-mock, no mocker fixture, no pytest-snapshot)
- Use `with unittest.mock.patch(...)` or the `@patch` decorator for mocking — DO NOT use the `mocker` fixture
- Make fixtures deterministic (no random, no time.now())
- If side effects are present, mock them and assert they were called
- Output ONLY valid Python code — no markdown, no explanation
- The test must be runnable standalone (include all imports)
- Hardcode the expected "golden" strings/values directly in the test assertions
- DO NOT use a `snapshot` or `mocker` fixture"""

TESTGEN_USER = """Generate a characterization test for this Python function.

## Function source:
```python
{function_source}
```

## Call graph context (what this function calls):
{call_context}

## Side effects detected:
{side_effects}

## Module path:
{module_path}

Respond with a JSON object:
{{
  "test_code": "<full pytest file as a string>",
  "snapshot_inputs": ["<human-readable description of each fixture input>"],
  "covers_side_effects": true/false
}}"""


def testgen_node(state: PipelineState) -> PipelineState:
    if state.error:
        return state

    repo_path  = state.repo_path
    wf_graph   = state.workflow_graph

    if not wf_graph:
        return state.model_copy(update={"error": "No workflow graph — run workflow_miner first", "current_stage": "testgen_failed"})

    try:
        # Pick target functions: entrypoints + side-effect nodes (highest value)
        target_nodes = [
            n for n in wf_graph.nodes
            if n.node_type in {"entrypoint", "sideeffect"}
        ][:8]  # cap at 8 for hackathon speed

        if not target_nodes:
            target_nodes = wf_graph.nodes[:5]

        generated: list[GeneratedTest] = []
        edge_map = _build_edge_map(wf_graph)

        for node in target_nodes:
            fn_source = _extract_function_source(repo_path, node.module, node.name)
            if not fn_source:
                continue

            call_context = _build_call_context(node, edge_map, wf_graph)
            result = _call_claude_testgen(
                function_source=fn_source,
                call_context=call_context,
                side_effects=node.side_effects,
                module_path=node.module,
            )

            if result:
                generated.append(GeneratedTest(
                    function_name=node.id,
                    test_code=result["test_code"],
                    snapshot_inputs=result.get("snapshot_inputs", []),
                    covers_side_effects=result.get("covers_side_effects", False),
                ))

        if not generated:
            return state.model_copy(update={"error": "Test generation produced no tests", "current_stage": "testgen_failed"})

        # Coverage gap analysis: compare tested functions vs all functions
        all_fn_ids = {n.id for n in wf_graph.nodes if n.node_type != "class"}
        covered = {t.function_name for t in generated}
        uncovered = sorted(all_fn_ids - covered)
        coverage_pct = (len(covered) / len(all_fn_ids) * 100) if all_fn_ids else 100.0

        suite = TestSuite(
            tests=generated,
            total=len(generated),
            target_module=state.target_module or "all",
            coverage_pct=round(coverage_pct, 1),
            covered_functions=sorted(covered),
            uncovered_functions=uncovered,
        )

        print(f"[testgen] ✓ Generated {len(generated)} characterization tests "
              f"({coverage_pct:.0f}% coverage, {len(uncovered)} uncovered)")

        return state.model_copy(update={
            "test_suite": suite,
            "current_stage": "testgen_complete",
        })

    except Exception as e:
        return state.model_copy(update={"error": str(e), "current_stage": "testgen_failed"})


# ─── Claude API call (now Gemini via OpenRouter) ──────────────────────────────

def _call_claude_testgen(
    function_source: str,
    call_context: str,
    side_effects: list[str],
    module_path: str,
) -> dict | None:
    prompt = TESTGEN_USER.format(
        function_source=function_source,
        call_context=call_context,
        side_effects=", ".join(side_effects) if side_effects else "none",
        module_path=module_path,
    )

    response = CLIENT.chat.completions.create(
        model="google/gemini-2.0-flash-001",
        max_tokens=4096,
        messages=[
            {"role": "system", "content": TESTGEN_SYSTEM},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )

    raw = response.choices[0].message.content
    print(f"[testgen] FINISH REASON: {response.choices[0].finish_reason}")
    print(f"[testgen] RAW LLM OUTPUT (len={len(raw)}):\n---START---\n{raw}\n---END---")
    raw = raw.strip()

    from utils.json_utils import parse_json_robust
    try:
        return parse_json_robust(raw)
    except Exception as e:
        print(f"[testgen] ❌ JSON Error: {e}")
        # Attempt to salvage — wrap in minimal structure
        return {"test_code": raw, "snapshot_inputs": [], "covers_side_effects": False}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _extract_function_source(repo_path: str, module: str, fn_name: str) -> str | None:
    """Find the source code of a specific function in the repo."""
    import ast as _ast

    # Convert module path to file path
    mod_parts  = module.split(".")
    candidates = [
        Path(repo_path) / Path(*mod_parts).with_suffix(".py"),
        Path(repo_path) / Path(*mod_parts) / "__init__.py",
    ]

    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            source = candidate.read_text(encoding="utf-8", errors="replace")
            try:
                tree = _ast.parse(source)
                for node in _ast.walk(tree):
                    if isinstance(node, (_ast.FunctionDef, _ast.AsyncFunctionDef)):
                        if node.name == fn_name:
                            lines = source.splitlines()
                            end   = node.end_lineno or (node.lineno + 20)
                            return "\n".join(lines[node.lineno - 1: end])
            except SyntaxError:
                # Regex fallback for legacy Python 2
                lines = source.splitlines()
                pattern = re.compile(rf"^\s*def\s+{fn_name}\s*\(")
                for i, line in enumerate(lines):
                    if pattern.match(line):
                        # Find end by looking for next non-indented def or class or end of file
                        start = i
                        for j in range(i + 1, len(lines)):
                            if lines[j].strip() and not lines[j].startswith(" "):
                                return "\n".join(lines[start:j])
                        return "\n".join(lines[start:])
        except Exception:
            continue
    return None


def _build_edge_map(wf_graph) -> dict[str, list[str]]:
    edge_map: dict[str, list[str]] = {}
    for edge in wf_graph.edges:
        edge_map.setdefault(edge.source, []).append(edge.target)
    return edge_map


def _build_call_context(node, edge_map: dict[str, list[str]], wf_graph) -> str:
    callees = edge_map.get(node.id, [])
    node_map = {n.id: n for n in wf_graph.nodes}
    lines = []
    for c in callees[:5]:  # limit context size
        cn = node_map.get(c)
        if cn:
            lines.append(f"- calls `{cn.name}` (module: {cn.module}, side_effects: {cn.side_effects})")
    return "\n".join(lines) if lines else "No outgoing calls detected."
