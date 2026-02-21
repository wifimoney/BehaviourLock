"""
Agent 3 — QA / BIZ LOGIC
Reviews the writer's draft against the raw source code.
Catches inaccuracies, missing context, and injects business logic the writer missed.
"""

from __future__ import annotations
import json
import os

import openai

from models.docgen_state import DocGenState, QAIssue, QAOutput
from storage.memory import RepoMemory

client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)


def _build_qa_prompt(state: DocGenState, memory_biz: str = "") -> str:
    draft = state.writer_draft.raw_markdown
    biz_hints = "\n".join(f"- {h}" for h in state.scanner_output.biz_logic_hints)
    if memory_biz:
        biz_hints += f"\n\n**Additional business logic from memory (previous runs):**\n{memory_biz}"
    source_snippet = state.source_code[:3000]

    return f"""You are a QA engineer and domain expert reviewing technical documentation.

Your job:
1. Cross-reference the documentation draft against the actual source code
2. Flag any inaccuracies or misleading descriptions
3. Identify missing business logic that should be documented
4. Ensure all side effects, edge cases, and error conditions are captured
5. Add any missing business context from the hints below

Known business logic hints from code analysis:
{biz_hints or 'None'}

Source code (ground truth):
```python
{source_snippet}
```

Documentation draft to review:
---
{draft[:4000]}
---

Return ONLY valid JSON:
{{
  "issues_found": [
    {{
      "section": "section title where issue found",
      "issue_type": "missing_context|inaccurate|missing_biz_logic|ambiguous",
      "description": "what is wrong or missing",
      "suggested_fix": "how to fix it"
    }}
  ],
  "biz_logic_added": ["list of business logic points you are injecting"],
  "revised_markdown": "the full revised markdown with all fixes applied",
  "qa_score": 0.85
}}"""


def qa_node(state: DocGenState) -> DocGenState:
    state.current_stage = "qa"

    if state.error:
        return state

    if not state.writer_draft:
        state.error = "qa_node: no writer draft"
        return state

    try:
        # ── Pull biz logic from memory ────────────────────────────────────
        memory_biz = ""
        if state.repo_path:
            try:
                mem = RepoMemory(state.repo_path)
                results = mem.search_biz_logic(
                    state.scanner_output.module_purpose or "business logic", n=6
                )
                if results:
                    memory_biz = "\n".join(f"- {r['text']}" for r in results)
                    print(f"[qa] ✓ Injected {len(results)} biz logic chunks from memory")
            except Exception as mem_err:
                print(f"[qa] ⚠ Memory read failed (non-fatal): {mem_err}")

        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            max_tokens=8192,
            messages=[{"role": "user", "content": _build_qa_prompt(state, memory_biz)}]
        )

        text = response.choices[0].message.content.strip()
        from utils.json_utils import parse_json_robust
        data = parse_json_robust(text)

        issues = [QAIssue(**i) for i in data.get("issues_found", [])]

        state.qa_output = QAOutput(
            issues_found=issues,
            biz_logic_added=data.get("biz_logic_added", []),
            revised_markdown=data.get("revised_markdown", state.writer_draft.raw_markdown),
            qa_score=float(data.get("qa_score", 0.8)),
        )
        state.current_stage = "qa_complete"

    except Exception as e:
        state.error = f"qa_node: {e}"

    return state
