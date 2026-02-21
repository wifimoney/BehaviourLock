"""
Agent 2 — WRITER
Takes scanner output and writes full technical documentation in markdown.
Covers: module overview, per-function docs, usage examples.
"""

from __future__ import annotations
import json
import os

import openai

from models.docgen_state import DocGenState, DocSection, WriterDraft
from storage.memory import RepoMemory

client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)


def _build_writer_prompt(state: DocGenState, memory_context: str = "") -> str:
    scanner = state.scanner_output

    func_summaries = []
    for f in scanner.functions:
        func_summaries.append(
            f"- `{f.signature}` → returns `{f.returns or 'None'}`"
            f"{' [SIDE EFFECTS: ' + ', '.join(f.side_effects) + ']' if f.side_effects else ''}"
            f"{chr(10) + '  Docstring: ' + f.docstring if f.docstring else ''}"
        )

    class_summaries = []
    for c in scanner.classes:
        class_summaries.append(
            f"- `{c.name}` (bases: {', '.join(c.base_classes) or 'object'}) "
            f"— methods: {', '.join(c.methods)}"
        )

    biz = "\n".join(f"- {h}" for h in scanner.biz_logic_hints) or "None detected"

    memory_section = ""
    if memory_context:
        memory_section = f"\n\n## Memory context from previous runs\n{memory_context}\n"

    return f"""You are a senior technical writer creating documentation for a Python module.

Module purpose: {scanner.module_purpose}
Entry points: {', '.join(scanner.entrypoints) or 'unknown'}
Dependencies: {', '.join(scanner.dependencies[:15])}

Functions:
{chr(10).join(func_summaries) or 'None'}

Classes:
{chr(10).join(class_summaries) or 'None'}

Business logic hints:
{biz}
{memory_section}
Source code snippet for context:
```python
{state.source_code[:3000]}
```

Write comprehensive technical documentation in markdown. Include:
1. A module overview section (2-3 paragraphs)
2. A "Key Concepts" section explaining the business logic
3. Per-function documentation with params, returns, example usage, and side effects warnings
4. A "Quick Start" section with 2-3 realistic usage examples
5. A "Notes & Gotchas" section for any footguns or important behaviours

Return ONLY valid JSON:
{{
  "overview": "module overview paragraph",
  "sections": [
    {{"title": "section title", "content": "markdown content"}}
  ],
  "usage_examples": ["```python\\n# example 1\\n```", "```python\\n# example 2\\n```"],
  "raw_markdown": "the complete assembled markdown document"
}}"""


def writer_node(state: DocGenState) -> DocGenState:
    state.current_stage = "writing"

    if state.error:
        return state

    if not state.scanner_output:
        state.error = "writer_node: no scanner output"
        return state

    try:
        # ── Pull RAG context from memory ──────────────────────────────────
        memory_context = ""
        if state.repo_path:
            try:
                mem = RepoMemory(state.repo_path)
                memory_context = mem.memory_context_for_writer(
                    state.scanner_output.module_purpose or "Python module"
                )
                if memory_context:
                    print(f"[writer] ✓ Injected memory context ({len(memory_context)} chars)")
            except Exception as mem_err:
                print(f"[writer] ⚠ Memory read failed (non-fatal): {mem_err}")

        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            max_tokens=8192,
            messages=[{"role": "user", "content": _build_writer_prompt(state, memory_context)}]
        )

        text = response.choices[0].message.content.strip()
        from utils.json_utils import parse_json_robust
        try:
            data = parse_json_robust(text)
        except Exception as e:
            print(f"[writer] ❌ JSON Parse Error: {e}")
            print(f"[writer] 📄 Raw LLM Output:\n{text}")
            raise e

        sections = [DocSection(**s) for s in data.get("sections", [])]

        state.writer_draft = WriterDraft(
            overview=data.get("overview", ""),
            sections=sections,
            usage_examples=data.get("usage_examples", []),
            raw_markdown=data.get("raw_markdown", ""),
        )
        state.current_stage = "written"

    except Exception as e:
        state.error = f"writer_node: {e}"

    return state
