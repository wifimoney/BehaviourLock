"""ChromaDB RAG layer for project knowledge indexing and retrieval."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import chromadb
import httpx
from chromadb.config import Settings
from openai import OpenAI

COLLECTION_NAME = "behaviourlock_knowledge"
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

SOURCE_FILE_DESCRIPTION_PROMPT = """\
You are a senior software engineer analyzing a legacy source file for migration purposes. \
Describe what this file does in plain language. Be specific and thorough.

Cover:
- Purpose and responsibility of this file/module
- Key functions, classes, or entry points and what they do
- Data structures and models defined
- External dependencies and integrations (APIs, databases, other modules)
- Business logic and rules implemented
- Any configuration, constants, or magic values

File path: {filepath}
File content:
```
{content}
```
"""

EXTRACTION_PROMPT = """\
You are a knowledge extraction engine. Analyze the following document and extract \
structured knowledge. Return your output as a series of facts, one per line. Each fact \
should be a self-contained statement that captures an entity, concept, relationship, \
business rule, or technical detail from the document.

Focus on:
- Named entities (systems, tools, people, organizations, products)
- Business rules and constraints
- Data flows and integrations
- Technical specifications (APIs, formats, protocols)
- Workflows and processes
- Domain-specific terminology and definitions
- Configuration details and parameters

Do NOT include filler or meta-commentary. Every line should be a concrete, searchable fact.

Document:
{content}
"""


def _get_llm_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    )


def _describe_source_file(filepath: str, content: str) -> str | None:
    """Use LLM to generate a natural language description of a source file."""
    truncated = content[:12000]
    try:
        client = _get_llm_client()
        model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")
        response = client.chat.completions.create(
            model=model,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": SOURCE_FILE_DESCRIPTION_PROMPT.format(filepath=filepath, content=truncated),
                }
            ],
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content
    except Exception:
        pass
    return None


def _extract_knowledge(content: str) -> str | None:
    """Use LLM to extract entities and fine-grained knowledge from content."""
    # Truncate to ~12k chars to fit context windows comfortably
    truncated = content[:12000]
    try:
        client = _get_llm_client()
        model = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")
        response = client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": EXTRACTION_PROMPT.format(content=truncated),
                }
            ],
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content
    except Exception:
        pass
    return None


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

    def _upsert_chunks(self, chunks: list[str], metadata: dict) -> list[str]:
        """Upsert text chunks into the collection. Returns list of chunk IDs."""
        if not chunks:
            return []
        ids = [_make_id(c) for c in chunks]
        metadatas = [{**metadata, "chunk_index": i} for i in range(len(chunks))]
        self.collection.upsert(ids=ids, documents=chunks, metadatas=metadatas)
        return ids

    def index_text(self, content: str, metadata: dict | None = None, extract: bool = True) -> int:
        """Index raw text + LLM-extracted knowledge. Returns total chunks added."""
        ids = self.index_text_return_ids(content, metadata=metadata, extract=extract)
        return len(ids)

    def index_text_return_ids(self, content: str, metadata: dict | None = None, extract: bool = True) -> list[str]:
        """Index raw text + LLM-extracted knowledge. Returns all chunk IDs created."""
        meta = metadata or {}
        all_ids: list[str] = []

        # 1. Index raw chunks
        raw_chunks = _chunk_text(content)
        all_ids.extend(self._upsert_chunks(raw_chunks, {**meta, "kind": "raw"}))

        # 2. Extract and index fine-grained knowledge
        if extract and content.strip():
            knowledge = _extract_knowledge(content)
            if knowledge:
                facts = [line.strip() for line in knowledge.splitlines() if line.strip()]
                all_ids.extend(self._upsert_chunks(facts, {**meta, "kind": "extracted"}))

        return all_ids

    def index_file(self, filepath: str) -> list[str]:
        """Read a file, chunk it, extract knowledge, and index. Returns chunk IDs."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        content = path.read_text(errors="replace")
        return self.index_text_return_ids(content, metadata={"source": str(path), "type": "file"})

    def index_source_file(self, filepath: str) -> tuple[list[str], str | None]:
        """Index a legacy source file: raw content + LLM-generated description.
        Returns (chunk_ids, description)."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        content = path.read_text(errors="replace")
        meta = {"source": str(path), "type": "source_file"}
        all_ids: list[str] = []

        # 1. Index raw content chunks
        raw_chunks = _chunk_text(content)
        all_ids.extend(self._upsert_chunks(raw_chunks, {**meta, "kind": "raw"}))

        # 2. Generate and index a natural language description
        description = _describe_source_file(str(path), content)
        if description:
            desc_chunks = _chunk_text(description)
            all_ids.extend(self._upsert_chunks(desc_chunks, {**meta, "kind": "description"}))

        return all_ids, description

    def index_pdf(self, filepath: str) -> list[dict]:
        """Extract text from a PDF page-by-page, chunk and index each page.
        Returns list of {page, chunk_ids, text} per page."""
        import pymupdf

        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")

        doc = pymupdf.open(str(path))
        pages: list[dict] = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if not text.strip():
                continue
            meta = {"source": str(path), "type": "pdf", "page": page_num + 1}
            chunk_ids = self.index_text_return_ids(text, metadata=meta, extract=True)
            pages.append({"page": page_num + 1, "chunk_ids": chunk_ids, "text": text})
        doc.close()
        return pages

    def index_url(self, url: str) -> list[str]:
        """Fetch a web page, extract knowledge, and index. Returns chunk IDs."""
        resp = httpx.get(url, follow_redirects=True, timeout=30)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        text = _strip_html(resp.text) if "html" in content_type else resp.text
        return self.index_text_return_ids(text, metadata={"source": url, "type": "url"})

    def index_image_description(self, description: str, image_path: str) -> list[str]:
        """Index a pre-generated image description. Returns chunk IDs."""
        return self.index_text_return_ids(description, metadata={"source": image_path, "type": "image_description"})

    def search(self, query: str, n: int = 5) -> list[dict]:
        """Semantic search. Returns chunks with chunk_id, text, metadata, distance."""
        results = self.collection.query(query_texts=[query], n_results=n)
        items = []
        for i in range(len(results["documents"][0])):
            items.append(
                {
                    "chunk_id": results["ids"][0][i],
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else None,
                }
            )
        return items

    def get_chunks_by_ids(self, chunk_ids: list[str]) -> list[str]:
        """Retrieve chunk texts by their IDs. Returns list of texts (missing IDs skipped)."""
        if not chunk_ids:
            return []
        results = self.collection.get(ids=chunk_ids)
        return results["documents"] if results["documents"] else []

    def tag_chunks_with_node(self, chunk_ids: list[str], node_id: int) -> None:
        """Update ChromaDB metadata on chunks to include their memory node_id."""
        if not chunk_ids:
            return
        existing = self.collection.get(ids=chunk_ids)
        if not existing["ids"]:
            return
        updated_metas = []
        for meta in existing["metadatas"] or []:
            updated_metas.append({**(meta or {}), "node_id": node_id})
        self.collection.update(ids=existing["ids"], metadatas=updated_metas)

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
