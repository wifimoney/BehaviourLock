"""Indexing pipelines for URLs, files, PDFs, images, and projects."""

from __future__ import annotations

import base64
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from openai import OpenAI

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.services.memory import (
    attach_knowledge_node,
    cluster_into_subsystems,
    summarize_for_root,
)

VISION_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash")

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv", ".tox", ".mypy_cache", "dist", "build", ".eggs"}
SKIP_EXTENSIONS = {".pyc", ".pyo", ".so", ".dll", ".exe", ".bin", ".o", ".a", ".class", ".jar", ".db", ".sqlite"}


@dataclass
class IndexResult:
    chunk_ids: list[str] = field(default_factory=list)
    node_id: int | None = None
    label: str = ""
    detail: str = ""


@dataclass
class ProjectIndexResult:
    files_indexed: int = 0
    total_chunks: int = 0
    subsystems: list[str] = field(default_factory=list)
    file_results: list[IndexResult] = field(default_factory=list)


@dataclass
class PdfIndexResult:
    doc_node_id: int = 0
    pages: int = 0
    total_chunks: int = 0


@dataclass
class ImageIndexResult:
    node_id: int = 0
    sections: int = 0
    total_chunks: int = 0


def _is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def describe_image(image_path: Path) -> str | None:
    """Use OpenRouter vision model to generate a text description of an image."""
    suffix = image_path.suffix.lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    media_type = media_type_map.get(suffix, "image/png")
    image_data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    )
    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{media_type};base64,{image_data}"},
                        },
                        {
                            "type": "text",
                            "text": "Describe this image in detail for a software engineering context. "
                            "Focus on any UI elements, architecture diagrams, data flows, "
                            "or technical content visible. Be thorough and specific.",
                        },
                    ],
                }
            ],
        )
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content
    except Exception:
        pass
    return None


def index_content(db: Database, rag: RAGStore, arg: str) -> IndexResult:
    """Index a URL, file path, or inline text into the RAG store and memory tree."""
    arg = arg.strip()
    if not arg:
        return IndexResult(detail="Empty input — nothing to index.")

    if _is_url(arg):
        chunk_ids = rag.index_url(arg)
        node_id = attach_knowledge_node(db, rag, f"URL: {arg}", chunk_ids, f"Content from {arg}")
        return IndexResult(
            chunk_ids=chunk_ids,
            node_id=node_id,
            label=f"URL: {arg}",
            detail=f"Indexed URL as {len(chunk_ids)} chunk(s), attached as memory node {node_id}.",
        )

    path = Path(arg)
    if path.exists() and path.is_file():
        image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
        if path.suffix.lower() in image_extensions:
            result = index_image(db, rag, path)
            return IndexResult(
                chunk_ids=[],
                node_id=result.node_id,
                label=f"Image: {path.name}",
                detail=f"Indexed image as memory node {result.node_id} with {result.total_chunks} chunk(s)"
                + (f" and {result.sections} section(s)" if result.sections else "")
                + ".",
            )
        elif path.suffix.lower() == ".pdf":
            result = index_pdf(db, rag, path)
            return IndexResult(
                chunk_ids=[],
                node_id=result.doc_node_id,
                label=f"PDF: {path.name}",
                detail=f"Indexed PDF ({result.pages} pages, {result.total_chunks} chunks) as memory node {result.doc_node_id}.",
            )
        else:
            chunk_ids = rag.index_file(arg)
            node_id = attach_knowledge_node(db, rag, f"File: {path.name}", chunk_ids, f"Content from {path.name}")
            return IndexResult(
                chunk_ids=chunk_ids,
                node_id=node_id,
                label=f"File: {path.name}",
                detail=f"Indexed file as {len(chunk_ids)} chunk(s), attached as memory node {node_id}.",
            )

    # Treat as inline text
    text = arg.strip("\"'")
    chunk_ids = rag.index_text_return_ids(text, metadata={"type": "inline"})
    node_id = attach_knowledge_node(db, rag, "Inline text", chunk_ids, text[:200])
    return IndexResult(
        chunk_ids=chunk_ids,
        node_id=node_id,
        label="Inline text",
        detail=f"Indexed text as {len(chunk_ids)} chunk(s), attached as memory node {node_id}.",
    )


def index_image(db: Database, rag: RAGStore, path: Path) -> ImageIndexResult:
    """Index an image: get LLM description, create memory nodes (split if large)."""
    description = describe_image(path)
    if not description:
        return ImageIndexResult(node_id=0, sections=0, total_chunks=0)

    chunk_ids = rag.index_image_description(description, str(path))

    paragraphs = [p.strip() for p in description.split("\n\n") if p.strip()]

    if len(paragraphs) <= 2:
        node_id = attach_knowledge_node(db, rag, f"Image: {path.name}", chunk_ids, description)
        return ImageIndexResult(node_id=node_id or 0, sections=0, total_chunks=len(chunk_ids))

    # Large description — parent image node with child section nodes
    img_node = db.add_memory_node(None, "fact", f"Image: {path.name}", description[:200], chunk_ids)
    root = db.get_root_node()
    if root:
        db.update_memory_node(img_node.id, parent_id=root.id)

    chars_per_para = [len(p) for p in paragraphs]
    total_chars = sum(chars_per_para)
    chunk_cursor = 0
    for i, para in enumerate(paragraphs):
        share = max(1, round(len(chunk_ids) * chars_per_para[i] / total_chars))
        section_cids = chunk_ids[chunk_cursor : chunk_cursor + share]
        chunk_cursor += share
        if i == len(paragraphs) - 1 and chunk_cursor < len(chunk_ids):
            section_cids.extend(chunk_ids[chunk_cursor:])

        preview = para[:150]
        if len(para) > 150:
            preview += "..."
        section_node = db.add_memory_node(img_node.id, "fact", f"Section {i + 1}", preview, section_cids)
        rag.tag_chunks_with_node(section_cids, section_node.id)

    return ImageIndexResult(node_id=img_node.id, sections=len(paragraphs), total_chunks=len(chunk_ids))


def index_pdf(db: Database, rag: RAGStore, path: Path) -> PdfIndexResult:
    """Index a PDF: extract text per page, create a document node with page children."""
    pages = rag.index_pdf(str(path))
    if not pages:
        return PdfIndexResult(doc_node_id=0, pages=0, total_chunks=0)

    total_chunks = sum(len(p["chunk_ids"]) for p in pages)
    all_chunk_ids = [cid for p in pages for cid in p["chunk_ids"]]
    doc_node = db.add_memory_node(
        None, "fact", f"PDF: {path.name}", f"PDF document with {len(pages)} pages", all_chunk_ids
    )

    root = db.get_root_node()
    if root:
        db.update_memory_node(doc_node.id, parent_id=root.id)

    for p in pages:
        preview = p["text"][:150].replace("\n", " ")
        if len(p["text"]) > 150:
            preview += "..."
        page_node = db.add_memory_node(doc_node.id, "fact", f"Page {p['page']}", preview, p["chunk_ids"])
        rag.tag_chunks_with_node(p["chunk_ids"], page_node.id)

    return PdfIndexResult(doc_node_id=doc_node.id, pages=len(pages), total_chunks=total_chunks)


def index_project(
    db: Database,
    rag: RAGStore,
    folder: str,
    on_file_indexed: Callable[..., None] | None = None,
) -> ProjectIndexResult:
    """Walk a project folder, index each source file, and build the memory tree.

    on_file_indexed(rel_path, index, total, chunks) is called after each file for progress.
    """
    folder_path = Path(folder).expanduser().resolve()
    if not folder_path.exists() or not folder_path.is_dir():
        return ProjectIndexResult()

    files: list[Path] = []
    for p in sorted(folder_path.rglob("*")):
        if any(skip in p.parts for skip in SKIP_DIRS):
            continue
        if p.is_file() and p.suffix.lower() not in SKIP_EXTENSIONS:
            files.append(p)

    if not files:
        return ProjectIndexResult()

    total_chunks = 0
    file_nodes: list[dict] = []
    file_results: list[IndexResult] = []

    for i, f in enumerate(files, 1):
        rel = f.relative_to(folder_path)
        try:
            chunk_ids, description = rag.index_source_file(str(f))
            total_chunks += len(chunk_ids)

            summary = description[:200] if description else f"Source file: {rel}"
            node = db.add_memory_node(None, "file", str(rel), summary, chunk_ids)
            rag.tag_chunks_with_node(chunk_ids, node.id)
            file_nodes.append({"id": node.id, "label": str(rel), "summary": summary})
            file_results.append(
                IndexResult(chunk_ids=chunk_ids, node_id=node.id, label=str(rel), detail=f"{len(chunk_ids)} chunks")
            )

            if on_file_indexed:
                on_file_indexed(rel_path=str(rel), index=i, total=len(files), chunks=len(chunk_ids))
        except Exception as e:
            file_results.append(IndexResult(label=str(rel), detail=f"error: {e}"))
            if on_file_indexed:
                on_file_indexed(rel_path=str(rel), index=i, total=len(files), chunks=0)

    if not file_nodes:
        return ProjectIndexResult(files_indexed=len(files), total_chunks=total_chunks, file_results=file_results)

    # Build memory tree: cluster files into subsystems
    clusters = cluster_into_subsystems(file_nodes)

    subsystem_summaries: list[dict[str, str]] = []
    subsystem_nodes = []
    subsystem_names: list[str] = []

    for cluster in clusters:
        sub_name = cluster.get("subsystem", "General")
        sub_summary = cluster.get("summary", "")
        sub_node = db.add_memory_node(None, "subsystem", sub_name, sub_summary)
        subsystem_nodes.append(sub_node)
        subsystem_summaries.append({"name": sub_name, "summary": sub_summary})
        subsystem_names.append(f"{sub_name}: {len(cluster.get('file_node_ids', []))} files")

        for fid in cluster.get("file_node_ids", []):
            db.update_memory_node(fid, parent_id=sub_node.id)

    root_summary = summarize_for_root(subsystem_summaries)
    root = db.add_memory_node(None, "root", "Project Root", root_summary)

    for sub_node in subsystem_nodes:
        db.update_memory_node(sub_node.id, parent_id=root.id)

    return ProjectIndexResult(
        files_indexed=len(files),
        total_chunks=total_chunks,
        subsystems=subsystem_names,
        file_results=file_results,
    )
