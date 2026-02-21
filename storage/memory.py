"""
storage/memory.py — Unified memory interface for B.LOC agents

This is the single import nodes use. They don't touch db.py or vector_store.py directly.

Usage:
    from storage.memory import RepoMemory
    mem = RepoMemory(repo_path)

    # Store
    mem.record_run(session_id, verdict, pct, drifts, changes)
    mem.record_drift(fn_name, severity, desc, before, after)
    mem.record_functions(scanner_output.functions)
    mem.record_biz_logic(scanner_output.biz_logic_hints)
    mem.record_approved_doc(session_id, markdown)

    # Retrieve
    mem.past_runs()                          → list of past migration results
    mem.known_drifts()                       → all drift patterns for this repo
    mem.changed_functions(new_functions)     → which fns changed since last run
    mem.search_functions("fee calculation")  → semantic search over functions
    mem.search_drifts("rounding edge case")  → similar past drifts
    mem.search_biz_logic("payment cap")      → relevant biz rules
    mem.search_docs("quick start examples")  → from approved docs
    mem.proactive_warnings(patch_changes)    → "seen this before" drift warnings
"""

from __future__ import annotations
import json
from typing import Optional

from storage import db, vector_store


class RepoMemory:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path
        self.repo_id   = db.repo_id(repo_path)
        db.upsert_repo(repo_path)

    # ── Write ────────────────────────────────────────────────────────────────

    def record_run(
        self,
        session_id: str,
        verdict: Optional[str],
        preservation_pct: Optional[float],
        critical_drifts: Optional[int],
        patch_changes: Optional[list] = None,
    ) -> str:
        return db.save_pipeline_run(
            session_id=session_id,
            repo_path=self.repo_path,
            verdict=verdict,
            preservation_pct=preservation_pct,
            critical_drifts=critical_drifts,
            patch_changes=patch_changes,
        )

    def record_drift(
        self,
        function_name: str,
        severity: str,
        description: str,
        before_output: str = "",
        after_output: str = "",
    ) -> None:
        db.save_drift(
            repo_path=self.repo_path,
            function_name=function_name,
            severity=severity,
            description=description,
            before_output=before_output,
            after_output=after_output,
        )
        vector_store.index_drift(self.repo_id, {
            "function_name": function_name,
            "severity":      severity,
            "description":   description,
            "before_output": before_output,
            "after_output":  after_output,
            "observed_at":   "",
        })

    def record_functions(self, functions: list) -> list[dict]:
        """
        Upsert function signatures. Returns list of changed functions:
        [{"name": "...", "previous_sig": "...", "new_sig": "..."}]
        """
        changed = []
        fn_dicts = []
        for f in functions:
            fn_dict = f.model_dump() if hasattr(f, "model_dump") else dict(f)
            result  = db.upsert_function_sig(
                repo_path=self.repo_path,
                function_name=fn_dict["name"],
                signature=fn_dict["signature"],
                return_type=fn_dict.get("returns", "") or "",
                side_effects=fn_dict.get("side_effects", []),
                complexity=fn_dict.get("complexity", "low"),
            )
            if result["changed"] and result["previous"]:
                changed.append({
                    "name":         fn_dict["name"],
                    "previous_sig": result["previous"]["signature"],
                    "new_sig":      fn_dict["signature"],
                })
            fn_dicts.append(fn_dict)

        vector_store.index_functions(self.repo_id, fn_dicts)
        return changed

    def record_biz_logic(self, hints: list[str]) -> None:
        vector_store.index_biz_logic(self.repo_id, hints)

    def record_approved_doc(self, session_id: str, markdown: str) -> None:
        db.update_docgen_approval(session_id, "approved")
        vector_store.index_approved_doc(self.repo_id, session_id, markdown)

    def record_docgen_run(
        self,
        session_id: str,
        qa_score: Optional[float],
        word_count: Optional[int],
        final_markdown: Optional[str],
    ) -> str:
        return db.save_docgen_run(
            session_id=session_id,
            repo_path=self.repo_path,
            qa_score=qa_score,
            word_count=word_count,
            final_markdown=final_markdown,
        )

    # ── Read ─────────────────────────────────────────────────────────────────

    def past_runs(self, limit: int = 5) -> list[dict]:
        return db.get_pipeline_history(self.repo_path, limit)

    def known_drifts(self) -> list[dict]:
        return db.get_drift_patterns(self.repo_path)

    def docgen_history(self, limit: int = 5) -> list[dict]:
        return db.get_docgen_history(self.repo_path, limit)

    def latest_approved_doc(self) -> Optional[str]:
        return db.get_latest_approved_doc(self.repo_path)

    def repo_info(self) -> Optional[dict]:
        return db.get_repo(self.repo_path)

    def stats(self) -> dict:
        return {
            "repo_id":       self.repo_id,
            "db":            db.get_repo(self.repo_path),
            "vector_counts": vector_store.get_collection_stats(self.repo_id),
        }

    # ── Semantic search ───────────────────────────────────────────────────────

    def search_functions(self, query: str, n: int = 5) -> list[dict]:
        return vector_store.retrieve_functions(self.repo_id, query, n)

    def search_drifts(self, query: str, n: int = 5) -> list[dict]:
        return vector_store.retrieve_drifts(self.repo_id, query, n)

    def search_biz_logic(self, query: str, n: int = 5) -> list[dict]:
        return vector_store.retrieve_biz_logic(self.repo_id, query, n)

    def search_docs(self, query: str, n: int = 5) -> list[dict]:
        return vector_store.retrieve_doc_context(self.repo_id, query, n)

    # ── Proactive warnings ────────────────────────────────────────────────────

    def proactive_warnings(self, patch_changes: list[dict]) -> list[dict]:
        """
        For each function being patched, check if we've seen drifts in it before.
        Returns warnings to inject into the migrator/reporter context.
        """
        warnings = []
        for change in patch_changes:
            fn_name = change.get("file", "").split("/")[-1].replace(".py", "")
            desc    = change.get("description", "")

            # Check structured DB first
            all_drifts = self.known_drifts()
            for d in all_drifts:
                if d["function_name"] in desc or fn_name in d["function_name"]:
                    warnings.append({
                        "source":       "memory",
                        "function":     d["function_name"],
                        "severity":     d["severity"],
                        "message":      f"Previously caused drift: {d['description']}",
                        "times_seen":   d["times_seen"],
                    })

            # Semantic similarity check
            similar = self.search_drifts(desc, n=3)
            for s in similar:
                meta = s.get("metadata", {})
                if meta.get("function_name") not in [w["function"] for w in warnings]:
                    warnings.append({
                        "source":   "rag",
                        "function": meta.get("function_name", "unknown"),
                        "severity": meta.get("severity", "unknown"),
                        "message":  s["text"][:200],
                    })

        # Deduplicate
        seen  = set()
        dedup = []
        for w in warnings:
            key = f"{w['function']}_{w['message'][:50]}"
            if key not in seen:
                seen.add(key)
                dedup.append(w)

        return dedup

    def memory_context_for_writer(self, topic: str) -> str:
        """
        Build a context block the writer/QA agents inject into their prompts.
        Pulls biz logic + relevant doc chunks for the given topic.
        """
        biz   = self.search_biz_logic(topic, n=5)
        docs  = self.search_docs(topic, n=3)
        runs  = self.past_runs(limit=3)

        lines = []

        if biz:
            lines.append("## Known business logic for this repo")
            for b in biz:
                lines.append(f"- {b['text']}")

        if docs:
            lines.append("\n## Relevant sections from previously approved docs")
            for d in docs:
                lines.append(d["text"])

        if runs:
            lines.append("\n## Recent migration history")
            for r in runs:
                lines.append(
                    f"- Run {r['ran_at'][:10]}: {r['verdict'] or 'incomplete'}, "
                    f"{r['preservation_pct'] or '?'}% preserved, "
                    f"{r['critical_drifts'] or 0} critical drifts"
                )

        return "\n".join(lines) if lines else ""
