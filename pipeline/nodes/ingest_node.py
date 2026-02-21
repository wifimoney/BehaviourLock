"""
Node 1: Ingest
Accepts a local path or zip, normalizes into a clean temp workspace.
Pure Python — no LLM needed.
"""

from __future__ import annotations
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

from models.state import PipelineState


def ingest_node(state: PipelineState) -> PipelineState:
    """
    Normalize the repo source into a clean temp workspace.
    Sets state.repo_path to the normalized directory.
    """
    source = state.repo_path

    if not source:
        return state.model_copy(update={"error": "No repo_path provided", "current_stage": "ingest_failed"})

    source_path = Path(source)

    if not source_path.exists():
        return state.model_copy(update={"error": f"Path does not exist: {source}", "current_stage": "ingest_failed"})

    # Create a clean temp workspace
    workspace = tempfile.mkdtemp(prefix="bloc_")

    try:
        # Handle zip upload
        if source_path.suffix == ".zip":
            with zipfile.ZipFile(source_path, "r") as zf:
                zf.extractall(workspace)
        # Handle directory
        elif source_path.is_dir():
            shutil.copytree(str(source_path), workspace, dirs_exist_ok=True)
        else:
            return state.model_copy(update={"error": "Source must be a directory or .zip file", "current_stage": "ingest_failed"})

        # Strip non-.py files (keep structure for imports)
        _strip_non_python(workspace)

        py_files = list(Path(workspace).rglob("*.py"))
        if not py_files:
            return state.model_copy(update={"error": "No Python files found in repo", "current_stage": "ingest_failed"})

        print(f"[ingest] ✓ Loaded {len(py_files)} Python files into {workspace}")
        return state.model_copy(update={
            "repo_path": workspace,
            "current_stage": "ingest_complete",
        })

    except Exception as e:
        shutil.rmtree(workspace, ignore_errors=True)
        return state.model_copy(update={"error": str(e), "current_stage": "ingest_failed"})


def _strip_non_python(workspace: str) -> None:
    """Remove non-.py files that aren't needed for analysis (binary assets, etc.)"""
    keep_extensions = {".py", ".txt", ".md", ".cfg", ".toml", ".ini", ".env"}
    for path in Path(workspace).rglob("*"):
        if path.is_file() and path.suffix not in keep_extensions:
            path.unlink()
