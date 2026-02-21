import os
import httpx
import asyncio

async def send_discord_notification(session_id: str, qa_score: float, word_count: int, preview: str, ngrok_url: str):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print("[notify] ⚠ Discord webhook URL not set in .env")
        return

    content = f"""
📄 **B.LOC Documentation Ready for Review**

**Session:** `{session_id}`
**QA Score:** {qa_score * 100:.0f}%
**Word count:** {word_count}

**Preview:**
{preview}...

---
✅ **To approve:** `curl -X POST {ngrok_url}/docgen/approve/{session_id} -H "Content-Type: application/json" -d '{{"status": "approved"}}'`

❌ **To reject:** `curl -X POST {ngrok_url}/docgen/approve/{session_id} -H "Content-Type: application/json" -d '{{"status": "rejected", "comment": "needs more detail"}}'`
"""

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(webhook_url, json={"content": content})
            if resp.status_code == 204:
                print(f"[notify] ✓ Discord notification sent for session {session_id}")
            else:
                print(f"[notify] ⚠ Discord notification failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[notify] ⚠ Discord notification error: {e}")


async def send_drift_warning(
    repo_path: str,
    session_id: str,
    risk_score: float,
    warnings: list,
    dashboard_url: str,
):
    """Fire-and-forget Discord alert when risk score exceeds 0.5."""
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        print("[notify] ⚠ Discord webhook URL not set — skipping drift warning")
        return

    severity_icon = {"critical": "🔴", "non_critical": "🟡"}
    warning_lines = []
    for w in warnings[:10]:
        sev = getattr(w, "severity", None) or w.get("severity", "non_critical")
        fn = getattr(w, "function", None) or w.get("function", "unknown")
        msg = getattr(w, "message", None) or w.get("message", "")
        icon = severity_icon.get(sev, "⚪")
        warning_lines.append(f"  {icon} **{fn}** — {msg[:120]}")

    warning_block = "\n".join(warning_lines) if warning_lines else "  (no specific warnings)"
    level_emoji = "🟢" if risk_score < 0.3 else "🟡" if risk_score < 0.5 else "🟠" if risk_score < 0.8 else "🔴"

    content = f"""
⚠️ **B.LOC Risk Alert — Pre-Migration Warning**

**Repo:** `{repo_path}`
**Session:** `{session_id}`
**Risk Score:** {level_emoji} {risk_score * 100:.0f}%

**Warnings:**
{warning_block}

---
🔗 **Dashboard:** {dashboard_url}
✅ **Override:** `curl -X POST {dashboard_url}/override-risk/{session_id}`
"""

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(webhook_url, json={"content": content})
            if resp.status_code == 204:
                print(f"[notify] ✓ Drift warning sent for session {session_id}")
            else:
                print(f"[notify] ⚠ Drift warning failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[notify] ⚠ Drift warning error: {e}")
