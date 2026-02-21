"""ChromaDB RAG layer for project knowledge indexing and retrieval."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import chromadb
import httpx
from chromadb.config import Settings


COLLECTION_NAME = "behaviourlock_knowledge"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


class RAGStore:
    def __init__(self, persist_dir: str = "./chroma_data"):
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def index_text(self, content: str, metadata: dict | None = None) -> int:
        """Index raw text (meeting notes, comments, etc.). Returns number of chunks added."""
        chunks = _chunk_text(content)
        if not chunks:
            return 0
        meta = metadata or {}
        ids = [_make_id(c) for c in chunks]
        metadatas = [{**meta, "chunk_index": i} for i in range(len(chunks))]
        self.collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)
        return len(chunks)

    def index_file(self, filepath: str) -> int:
        """Read a file, chunk it, and index. Returns number of chunks added."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        content = path.read_text(errors="replace")
        return self.index_text(content, metadata={"source": str(path), "type": "file"})

    def index_url(self, url: str) -> int:
        """Fetch a web page and index its text content. Returns number of chunks added."""
        resp = httpx.get(url, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "html" in content_type:
            text = _strip_html(resp.text)
        else:
            text = resp.text
        return self.index_text(text, metadata={"source": url, "type": "url"})

    def index_image_description(self, description: str, image_path: str) -> int:
        """Index a pre-generated image description (Claude vision output)."""
        return self.index_text(description, metadata={"source": image_path, "type": "image_description"})

    def search(self, query: str, n: int = 5) -> list[dict]:
        """Semantic search, return relevant chunks with metadata."""
        results = self.collection.query(query_texts=[query], n_results=n)
        items = []
        for i in range(len(results["documents"][0])):
            items.append({
                "text": results["documents"][0][i],
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results["distances"] else None,
            })
        return items

    @property
    def count(self) -> int:
        return self.collection.count()


def _chunk_text(text: str) -> list[str]:
    """Split text into overlapping chunks."""
    if len(text) <= CHUNK_SIZE:
        return [text] if text.strip() else []
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return chunks


def _strip_html(html: str) -> str:
    """Naive HTML to text: remove tags, collapse whitespace."""
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _make_id(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]
