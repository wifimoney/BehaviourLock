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

import os
import json
from typing import Optional

# ─── ChromaDB Fallback Logic ──────────────────────────────────────────────────
try:
    import chromadb
    from chromadb.utils import embedding_functions
    CHROMA_AVAILABLE = True
except Exception as e:
    print(f"[vector_store] ⚠ ChromaDB initialization failed: {e}")
    print("[vector_store] ℹ Using JSON Fallback Storage (Lite Mode)")
    CHROMA_AVAILABLE = False

CHROMA_PATH = os.environ.get("BLOC_CHROMA_PATH", "./bloc_chroma")

_client: Optional[object] = None


def _get_client():
    global _client
    if _client is None:
        if CHROMA_AVAILABLE:
            try:
                _client = chromadb.PersistentClient(path=CHROMA_PATH)
            except Exception as e:
                print(f"[vector_store] ⚠ Failed to create PersistentClient: {e}")
                _client = FallbackClient(CHROMA_PATH)
        else:
            _client = FallbackClient(CHROMA_PATH)
    return _client


class FallbackClient:
    """Mock ChromaDB client that uses JSON files."""
    def __init__(self, path: str):
        self.path = Path(path)
        self.path.mkdir(exist_ok=True)
        self.collections = {}

    def get_or_create_collection(self, name, **kwargs):
        if name not in self.collections:
            self.collections[name] = FallbackCollection(self.path / f"{name}.json")
        return self.collections[name]


class FallbackCollection:
    def __init__(self, path: Path):
        self.path = path
        self.data = {"documents": [], "ids": [], "metadatas": []}
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text())
            except: pass

    def upsert(self, documents, ids, metadatas):
        for d, i, m in zip(documents, ids, metadatas):
            if i in self.data["ids"]:
                idx = self.data["ids"].index(i)
                self.data["documents"][idx] = d
                self.data["metadatas"][idx] = m
            else:
                self.data["documents"].append(d)
                self.data["ids"].append(i)
                self.data["metadatas"].append(m)
        self.save()

    def query(self, query_texts, n_results=5):
        # Very simple keyword search for the fallback
        query = query_texts[0].lower()
        results = []
        for i, doc in enumerate(self.data["documents"]):
            if query in doc.lower():
                results.append((doc, self.data["metadatas"][i]))
        
        # Limit to n_results
        results = results[:n_results]
        
        return {
            "documents": [[r[0] for r in results]],
            "metadatas": [[r[1] for r in results]]
        }

    def count(self):
        return len(self.data["ids"])

    def save(self):
        self.path.write_text(json.dumps(self.data))


def _ef():
    if CHROMA_AVAILABLE:
        return embedding_functions.DefaultEmbeddingFunction()
    return None


def _col(repo_id: str, kind: str):
    name = f"{repo_id}_{kind}"[:63]
    return _get_client().get_or_create_collection(name=name)


from pathlib import Path

# ─── Index functions ──────────────────────────────────────────────────────────

def index_functions(repo_id: str, functions: list[dict]) -> None:
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
    col = _col(repo_id, "docs")
    chunks = [markdown[i:i+500] for i in range(0, len(markdown), 500)]
    docs, ids, metas = [], [], []
    for i, chunk in enumerate(chunks):
        docs.append(chunk)
        ids.append(f"doc_{repo_id}_{session_id}_{i}")
        metas.append({"session_id": session_id, "chunk": str(i)})
    col.upsert(documents=docs, ids=ids, metadatas=metas)


# ─── Retrieval ────────────────────────────────────────────────────────────────

def retrieve_functions(repo_id: str, query: str, n: int = 5) -> list[dict]:
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
    stats = {}
    for kind in ["functions", "drifts", "biz_logic", "docs"]:
        try:
            col = _col(repo_id, kind)
            stats[kind] = col.count()
        except Exception:
            stats[kind] = 0
    return stats
