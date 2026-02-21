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
