"""
storage/db.py — SQLite persistence layer

Schema:
  repos           — known repos, keyed by fingerprint (path hash)
  pipeline_runs   — every migration run result
  drift_patterns  — drift events, used for proactive warnings
  docgen_runs     — every docgen run result + approval status
  function_sigs   — per-function snapshots (for change detection across runs)
"""

from __future__ import annotations
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = os.environ.get("BLOC_DB_PATH", "./bloc_memory.db")


# ─── Bootstrap ────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS repos (
    repo_id     TEXT PRIMARY KEY,   -- sha256 of canonical path
    path        TEXT NOT NULL,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    run_count   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id          TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    ran_at          TEXT NOT NULL,
    verdict         TEXT,           -- SAFE / RISKY / BLOCKED
    preservation_pct REAL,
    critical_drifts INTEGER,
    patch_summary   TEXT,           -- JSON of PatchChange list
    FOREIGN KEY (repo_id) REFERENCES repos(repo_id)
);

CREATE TABLE IF NOT EXISTS drift_patterns (
    pattern_id      TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL,
    function_name   TEXT NOT NULL,
    severity        TEXT NOT NULL,  -- critical / non_critical
    description     TEXT NOT NULL,
    before_output   TEXT,
    after_output    TEXT,
    observed_at     TEXT NOT NULL,
    times_seen      INTEGER DEFAULT 1,
    FOREIGN KEY (repo_id) REFERENCES repos(repo_id)
);

CREATE TABLE IF NOT EXISTS docgen_runs (
    doc_run_id      TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    ran_at          TEXT NOT NULL,
    qa_score        REAL,
    word_count      INTEGER,
    approval_status TEXT DEFAULT 'pending',  -- pending/approved/rejected
    reviewer_comment TEXT,
    reviewed_at     TEXT,
    final_markdown  TEXT,           -- stored so we don't regenerate
    FOREIGN KEY (repo_id) REFERENCES repos(repo_id)
);

CREATE TABLE IF NOT EXISTS function_sigs (
    sig_id          TEXT PRIMARY KEY,
    repo_id         TEXT NOT NULL,
    function_name   TEXT NOT NULL,
    signature       TEXT NOT NULL,
    return_type     TEXT,
    side_effects    TEXT,           -- JSON list
    complexity      TEXT,
    snapshot_hash   TEXT NOT NULL,  -- hash of sig+body for change detection
    last_seen       TEXT NOT NULL,
    FOREIGN KEY (repo_id) REFERENCES repos(repo_id)
);

CREATE INDEX IF NOT EXISTS idx_runs_repo     ON pipeline_runs(repo_id);
CREATE INDEX IF NOT EXISTS idx_drifts_repo   ON drift_patterns(repo_id);
CREATE INDEX IF NOT EXISTS idx_funcsigs_repo ON function_sigs(repo_id, function_name);
CREATE INDEX IF NOT EXISTS idx_docgen_repo   ON docgen_runs(repo_id);
"""


def init_db(path: str = DB_PATH) -> None:
    with sqlite3.connect(path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def get_conn(path: str = DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def repo_id(repo_path: str) -> str:
    """Stable identifier for a repo — sha256 of its canonical path."""
    canonical = str(Path(repo_path).resolve())
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# ─── Repo ─────────────────────────────────────────────────────────────────────

def upsert_repo(repo_path: str) -> str:
    rid = repo_id(repo_path)
    now = _now()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT repo_id FROM repos WHERE repo_id = ?", (rid,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE repos SET last_seen = ?, run_count = run_count + 1 WHERE repo_id = ?",
                (now, rid)
            )
        else:
            conn.execute(
                "INSERT INTO repos (repo_id, path, first_seen, last_seen, run_count) VALUES (?,?,?,?,1)",
                (rid, str(Path(repo_path).resolve()), now, now)
            )
    return rid


def get_repo(repo_path: str) -> Optional[dict]:
    rid = repo_id(repo_path)
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM repos WHERE repo_id = ?", (rid,)).fetchone()
        return dict(row) if row else None


# ─── Pipeline runs ────────────────────────────────────────────────────────────

def save_pipeline_run(
    session_id: str,
    repo_path: str,
    verdict: Optional[str],
    preservation_pct: Optional[float],
    critical_drifts: Optional[int],
    patch_changes: Optional[list],
) -> str:
    import uuid
    run_id = str(uuid.uuid4())[:8]
    rid    = upsert_repo(repo_path)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO pipeline_runs
               (run_id, repo_id, session_id, ran_at, verdict, preservation_pct, critical_drifts, patch_summary)
               VALUES (?,?,?,?,?,?,?,?)""",
            (run_id, rid, session_id, _now(), verdict, preservation_pct,
             critical_drifts, json.dumps(patch_changes or []))
        )
    return run_id


def get_pipeline_history(repo_path: str, limit: int = 10) -> list[dict]:
    rid = repo_id(repo_path)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM pipeline_runs WHERE repo_id = ? ORDER BY ran_at DESC LIMIT ?",
            (rid, limit)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Drift patterns ───────────────────────────────────────────────────────────

def save_drift(
    repo_path: str,
    function_name: str,
    severity: str,
    description: str,
    before_output: str = "",
    after_output: str = "",
) -> None:
    import uuid
    rid = repo_id(repo_path)
    # Deduplicate: if same function + description seen before, increment counter
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT pattern_id, times_seen FROM drift_patterns WHERE repo_id=? AND function_name=? AND description=?",
            (rid, function_name, description)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE drift_patterns SET times_seen = times_seen + 1, observed_at = ? WHERE pattern_id = ?",
                (_now(), existing["pattern_id"])
            )
        else:
            conn.execute(
                """INSERT INTO drift_patterns
                   (pattern_id, repo_id, function_name, severity, description, before_output, after_output, observed_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4())[:8], rid, function_name, severity,
                 description, before_output, after_output, _now())
            )


def get_drift_patterns(repo_path: str) -> list[dict]:
    rid = repo_id(repo_path)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM drift_patterns WHERE repo_id = ? ORDER BY times_seen DESC",
            (rid,)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── Function signatures ──────────────────────────────────────────────────────

def upsert_function_sig(
    repo_path: str,
    function_name: str,
    signature: str,
    return_type: str,
    side_effects: list[str],
    complexity: str,
) -> dict:
    """
    Store/update a function signature snapshot.
    Returns {"changed": bool, "previous": dict|None}
    """
    import uuid
    rid           = repo_id(repo_path)
    snapshot_hash = hashlib.sha256(f"{signature}{return_type}{sorted(side_effects)}".encode()).hexdigest()[:12]

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM function_sigs WHERE repo_id=? AND function_name=?",
            (rid, function_name)
        ).fetchone()

        previous = dict(existing) if existing else None
        changed  = existing and existing["snapshot_hash"] != snapshot_hash

        if existing:
            conn.execute(
                """UPDATE function_sigs
                   SET signature=?, return_type=?, side_effects=?, complexity=?,
                       snapshot_hash=?, last_seen=?
                   WHERE repo_id=? AND function_name=?""",
                (signature, return_type, json.dumps(side_effects), complexity,
                 snapshot_hash, _now(), rid, function_name)
            )
        else:
            conn.execute(
                """INSERT INTO function_sigs
                   (sig_id, repo_id, function_name, signature, return_type, side_effects, complexity, snapshot_hash, last_seen)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (str(uuid.uuid4())[:8], rid, function_name, signature,
                 return_type, json.dumps(side_effects), complexity, snapshot_hash, _now())
            )

    return {"changed": bool(changed), "previous": previous}


def get_function_sigs(repo_path: str) -> list[dict]:
    rid = repo_id(repo_path)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM function_sigs WHERE repo_id = ?", (rid,)
        ).fetchall()
    return [dict(r) for r in rows]


# ─── DocGen runs ──────────────────────────────────────────────────────────────

def save_docgen_run(
    session_id: str,
    repo_path: str,
    qa_score: Optional[float],
    word_count: Optional[int],
    final_markdown: Optional[str],
) -> str:
    import uuid
    doc_run_id = str(uuid.uuid4())[:8]
    rid        = repo_id(repo_path)
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO docgen_runs
               (doc_run_id, repo_id, session_id, ran_at, qa_score, word_count, final_markdown)
               VALUES (?,?,?,?,?,?,?)""",
            (doc_run_id, rid, session_id, _now(), qa_score, word_count, final_markdown)
        )
    return doc_run_id


def update_docgen_approval(
    session_id: str,
    status: str,
    comment: Optional[str] = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE docgen_runs
               SET approval_status=?, reviewer_comment=?, reviewed_at=?
               WHERE session_id=?""",
            (status, comment, _now(), session_id)
        )


def get_docgen_history(repo_path: str, limit: int = 5) -> list[dict]:
    rid = repo_id(repo_path)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM docgen_runs WHERE repo_id=? ORDER BY ran_at DESC LIMIT ?",
            (rid, limit)
        ).fetchall()
    return [dict(r) for r in rows]


def get_latest_approved_doc(repo_path: str) -> Optional[str]:
    """Return the most recently approved markdown for this repo."""
    rid = repo_id(repo_path)
    with get_conn() as conn:
        row = conn.execute(
            """SELECT final_markdown FROM docgen_runs
               WHERE repo_id=? AND approval_status='approved'
               ORDER BY reviewed_at DESC LIMIT 1""",
            (rid,)
        ).fetchone()
    return row["final_markdown"] if row else None


# ─── Init on import ───────────────────────────────────────────────────────────
init_db()
