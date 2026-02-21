"""
storage/vector_store.py — ChromaDB RAG layer

Per-repo collections, namespaced by repo_id.
Stores: function docs, drift descriptions, biz logic hints, doc sections.
Used by: writer_node, qa_node, migrator_node, reporter_node for context retrieval.

Collections per repo:
  {repo_id}_functions  — function signatures + docstrings
  {repo_id}_drifts     — drift patterns observed
  {repo_id}_biz_logic  — business logic hints extracted over time
  {repo_id}_docs       — approved doc sections (for continuity)
"""

from __future__ import annotations
import os
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions

CHROMA_PATH = os.environ.get("BLOC_CHROMA_PATH", "./bloc_chroma")

_client: Optional[chromadb.ClientAPI] = None


def _get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
    return _client


def _ef():
    """Default embedding function — uses sentence-transformers locally, no API cost."""
    return embedding_functions.DefaultEmbeddingFunction()


def _col(repo_id: str, kind: str):
    """Get or create a namespaced collection."""
    name = f"{repo_id}_{kind}"[:63]  # Chroma max name length
    return _get_client().get_or_create_collection(
        name=name,
        embedding_function=_ef(),
        metadata={"repo_id": repo_id, "kind": kind}
    )


# ─── Index functions ──────────────────────────────────────────────────────────

def index_functions(repo_id: str, functions: list[dict]) -> None:
    """
    Upsert function docs into the vector store.
    Each function becomes one document: signature + docstring + side effects.
    """
    col = _col(repo_id, "functions")
    if not functions:
        return

    docs, ids, metas = [], [], []
    for f in functions:
        text = (
            f"Function: {f.get('signature', f.get('name', ''))}\n"
            f"Returns: {f.get('returns', 'unknown') or 'unknown'}\n"
            f"Side effects: {', '.join(f.get('side_effects', [])) or 'none'}\n"
            f"Complexity: {f.get('complexity', 'unknown')}\n"
            f"Docstring: {f.get('docstring', '') or ''}\n"
            f"Calls: {', '.join(f.get('calls', []))}"
        )
        fn_id = f"fn_{repo_id}_{f.get('name', 'unknown')}"
        docs.append(text)
        ids.append(fn_id)
        metas.append({
            "name":         f.get("name", ""),
            "complexity":   f.get("complexity", ""),
            "has_side_fx":  str(bool(f.get("side_effects"))),
            "lineno":       str(f.get("lineno", 0)),
        })

    col.upsert(documents=docs, ids=ids, metadatas=metas)


def index_drift(repo_id: str, drift: dict) -> None:
    """Index a drift pattern for future proactive warnings."""
    col = _col(repo_id, "drifts")
    text = (
        f"Drift in function: {drift['function_name']}\n"
        f"Severity: {drift['severity']}\n"
        f"Description: {drift['description']}\n"
        f"Before: {drift.get('before_output', '')}\n"
        f"After: {drift.get('after_output', '')}"
    )
    drift_id = f"drift_{repo_id}_{drift['function_name']}_{drift.get('observed_at','')[:10]}"
    col.upsert(
        documents=[text],
        ids=[drift_id],
        metadatas=[{"function_name": drift["function_name"], "severity": drift["severity"]}]
    )


def index_biz_logic(repo_id: str, hints: list[str]) -> None:
    """Index business logic hints extracted by the scanner."""
    if not hints:
        return
    col = _col(repo_id, "biz_logic")
    docs, ids, metas = [], [], []
    for i, hint in enumerate(hints):
        docs.append(hint)
        ids.append(f"biz_{repo_id}_{i}_{hash(hint) % 99999}")
        metas.append({"type": "biz_logic"})
    col.upsert(documents=docs, ids=ids, metadatas=metas)


def index_approved_doc(repo_id: str, session_id: str, markdown: str) -> None:
    """Index approved documentation sections for future continuity."""
    col = _col(repo_id, "docs")
    # Split into ~500 char chunks
    chunks = [markdown[i:i+500] for i in range(0, len(markdown), 500)]
    docs, ids, metas = [], [], []
    for i, chunk in enumerate(chunks):
        docs.append(chunk)
        ids.append(f"doc_{repo_id}_{session_id}_{i}")
        metas.append({"session_id": session_id, "chunk": str(i)})
    col.upsert(documents=docs, ids=ids, metadatas=metas)


# ─── Retrieval ────────────────────────────────────────────────────────────────

def retrieve_functions(repo_id: str, query: str, n: int = 5) -> list[dict]:
    """Semantic search over indexed functions. Returns list of {text, metadata}."""
    try:
        col = _col(repo_id, "functions")
        if col.count() == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(n, col.count()))
        return [
            {"text": doc, "metadata": meta}
            for doc, meta in zip(
                results["documents"][0],
                results["metadatas"][0]
            )
        ]
    except Exception:
        return []


def retrieve_drifts(repo_id: str, query: str, n: int = 5) -> list[dict]:
    """Retrieve similar past drifts — used by migrator for proactive warnings."""
    try:
        col = _col(repo_id, "drifts")
        if col.count() == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(n, col.count()))
        return [
            {"text": doc, "metadata": meta}
            for doc, meta in zip(
                results["documents"][0],
                results["metadatas"][0]
            )
        ]
    except Exception:
        return []


def retrieve_biz_logic(repo_id: str, query: str, n: int = 5) -> list[dict]:
    """Retrieve relevant business logic hints for a given context."""
    try:
        col = _col(repo_id, "biz_logic")
        if col.count() == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(n, col.count()))
        return [
            {"text": doc, "metadata": meta}
            for doc, meta in zip(
                results["documents"][0],
                results["metadatas"][0]
            )
        ]
    except Exception:
        return []


def retrieve_doc_context(repo_id: str, query: str, n: int = 5) -> list[dict]:
    """Retrieve relevant chunks from previously approved docs."""
    try:
        col = _col(repo_id, "docs")
        if col.count() == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(n, col.count()))
        return [
            {"text": doc, "metadata": meta}
            for doc, meta in zip(
                results["documents"][0],
                results["metadatas"][0]
            )
        ]
    except Exception:
        return []


def get_collection_stats(repo_id: str) -> dict:
    """How much is stored for this repo across all collections."""
    stats = {}
    for kind in ["functions", "drifts", "biz_logic", "docs"]:
        try:
            col = _col(repo_id, kind)
            stats[kind] = col.count()
        except Exception:
            stats[kind] = 0
    return stats
