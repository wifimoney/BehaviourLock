import os
import json
import openai
from models.docgen_state import DocGenState, ProofreadOutput

client = openai.OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", ""),
)

def proofreader_node(state: DocGenState) -> DocGenState:
    state.current_stage = "proofreading"
    print(f"[docgen:proofreader] Polishing documentation")

    if state.error:
        return state

    raw_md = state.qa_output.revised_markdown if state.qa_output else state.writer_draft.raw_markdown

    prompt = f"""You are a professional technical proofreader. 
Your task is to take the following documentation draft and perform a final polish.

Focus on:
1. Consistency in tone and terminology
2. Correcting any formatting irregularities
3. Tightening the language (removing fluff)
4. Ensuring the markdown structure is valid and clean
5. Checking for any obvious hallucinations or logical gaps

Documentation to polish:
---
{raw_md}
---

Return ONLY valid JSON:
{{
  "changes_made": ["list of specific edits you performed"],
  "final_markdown": "the fully polished markdown",
  "word_count": 123,
  "ready_for_review": true
}}"""

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )

        text = response.choices[0].message.content.strip()
        from utils.json_utils import parse_json_robust
        data = parse_json_robust(text)

        state.proofread_output = ProofreadOutput(
            changes_made=data.get("changes_made", []),
            final_markdown=data.get("final_markdown", raw_md),
            word_count=int(data.get("word_count", len(raw_md.split()))),
            ready_for_review=bool(data.get("ready_for_review", True))
        )
        state.current_stage = "awaiting_review"

    except Exception as e:
        state.error = f"proofreader_node: {e}"

    return state
