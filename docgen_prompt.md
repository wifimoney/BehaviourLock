# CodeWords — B.LOC DocGen Workflow
# Paste this directly into Cody when creating a new workflow

---

Build a workflow that generates technical documentation for a Python codebase using an external AI pipeline, then notifies me on Discord for human review.

Here's the exact flow:

**Step 1 — Trigger**
Accept one input: `repo_path` (string, e.g. `./sample_legacy`)
This can be triggered manually from the Run Page, or via webhook from an external tool.

**Step 2 — Run the doc generation pipeline**
Make a POST request to: `https://YOUR_NGROK_URL/docgen/run-direct`
With body: `{"repo_path": "<repo_path>"}`
This kicks off 4 AI agents (scanner → writer → QA → proofreader) and returns:
- `session_id` (string)
- `stage` (should be "awaiting_review")
- `qa_score` (float, 0–1)
- `word_count` (int)
- `preview` (first 500 chars of the doc)
- `error` (null if successful)

Wait 90 seconds for the pipeline to complete (it runs LLM calls sequentially).

**Step 3 — Fetch the full draft**
Make a GET request to: `https://YOUR_NGROK_URL/docgen/draft/<session_id>`
This returns `final_markdown`, `qa_score`, `issues_found`, `biz_logic_added`.

**Step 4 — Post to Discord for human review**
Post a message to my Discord webhook (I'll provide the URL) with this format:

```
📄 **B.LOC Documentation Ready for Review**

**Session:** `{session_id}`
**QA Score:** {qa_score * 100:.0f}%
**Word count:** {word_count}
**Issues found & fixed:** {len(issues_found)}
**Business logic injected:** {len(biz_logic_added)}

**Preview:**
{preview}

---
✅ To approve: POST https://YOUR_NGROK_URL/docgen/approve/{session_id}
   Body: {"status": "approved"}

❌ To reject: POST https://YOUR_NGROK_URL/docgen/approve/{session_id}
   Body: {"status": "rejected", "comment": "your note"}
```

**Step 5 — Human approval (webhook trigger)**
Create a separate webhook trigger so I can approve or reject from Discord or a simple curl command.
When the webhook receives `{"session_id": "...", "status": "approved"}`:
- Make a POST to `https://YOUR_NGROK_URL/docgen/approve/<session_id>` with body `{"status": "approved"}`
- If approved, fetch the final markdown from `GET /docgen/draft/<session_id>` and post it back to Discord as a code block or file
- If rejected, post a "Doc sent back for revision" message

Handle errors: if `error` is not null in step 2, post an error message to Discord instead of proceeding.
