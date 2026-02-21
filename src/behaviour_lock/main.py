"""CLI entrypoint with rich chat UI and slash commands."""
from __future__ import annotations

import base64
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types
import click
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from behaviour_lock.agent import Agent
from behaviour_lock.db import Database
from behaviour_lock.rag import RAGStore

console = Console()

VISION_MODEL = "gemini-2.5-flash"


def _show_requirements(db: Database):
    reqs = db.list_requirements()
    if not reqs:
        console.print("[dim]No requirements stored yet.[/dim]")
        return
    table = Table(title="User Requirements", show_lines=True)
    table.add_column("ID", style="cyan", width=4)
    table.add_column("Summary", style="green")
    table.add_column("Content", style="white", max_width=60)
    for r in reqs:
        table.add_row(str(r.id), r.summary, r.content[:120] + ("..." if len(r.content) > 120 else ""))
    console.print(table)


def _show_tasks(db: Database):
    tasks = db.list_tasks_sorted()
    if not tasks:
        console.print("[dim]No tasks stored yet.[/dim]")
        return
    table = Table(title="Tasks (Topologically Sorted)", show_lines=True)
    table.add_column("ID", style="cyan", width=4)
    table.add_column("Tags", style="magenta", width=20)
    table.add_column("Summary", style="green")
    table.add_column("Deps", style="yellow", width=10)
    for t in tasks:
        tags = ", ".join(tag.value for tag in t.tags)
        deps = ", ".join(str(d) for d in t.dependencies) if t.dependencies else "-"
        table.add_row(str(t.id), tags, t.summary, deps)
    console.print(table)


def _show_plan(agent: Agent):
    result = agent._generate_plan()
    console.print(Panel(Markdown(result["plan"]), title="Implementation Plan", border_style="blue"))


def _is_url(s: str) -> bool:
    return s.startswith("http://") or s.startswith("https://")


def _index_content(rag: RAGStore, arg: str):
    """Index a URL, file path, or inline text into the RAG store."""
    arg = arg.strip()
    if not arg:
        console.print("[red]Usage: /index <url, filepath, or text>[/red]")
        return

    if _is_url(arg):
        console.print(f"[dim]Fetching URL: {arg}[/dim]")
        try:
            count = rag.index_url(arg)
            console.print(f"[green]Indexed URL as {count} chunk(s).[/green]")
        except Exception as e:
            console.print(f"[red]Failed to fetch URL: {e}[/red]")
        return

    path = Path(arg)
    if path.exists() and path.is_file():
        image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
        if path.suffix.lower() in image_extensions:
            console.print(f"[dim]Describing image with Gemini vision: {path}[/dim]")
            description = _describe_image(path)
            if description:
                count = rag.index_image_description(description, str(path))
                console.print(f"[green]Indexed image description as {count} chunk(s).[/green]")
            else:
                console.print("[red]Failed to get image description.[/red]")
        else:
            count = rag.index_file(arg)
            console.print(f"[green]Indexed file '{arg}' as {count} chunk(s).[/green]")
    else:
        # Treat as inline text (strip surrounding quotes if present)
        text = arg.strip("\"'")
        count = rag.index_text(text, metadata={"type": "inline"})
        console.print(f"[green]Indexed text as {count} chunk(s).[/green]")


def _describe_image(image_path: Path) -> str | None:
    """Use Gemini vision to generate a text description of an image."""
    image_bytes = image_path.read_bytes()
    suffix = image_path.suffix.lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }
    mime_type = media_type_map.get(suffix, "image/png")

    client = genai.Client()
    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Content(role="user", parts=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                types.Part(text=(
                    "Describe this image in detail for a software engineering context. "
                    "Focus on any UI elements, architecture diagrams, data flows, "
                    "or technical content visible. Be thorough and specific."
                )),
            ]),
        ],
    )
    if response.text:
        return response.text
    return None


@click.command()
@click.option("--db-path", default="behaviourlock.db", help="Path to SQLite database file.")
@click.option("--chroma-dir", default="./chroma_data", help="Path to ChromaDB persistence directory.")
def cli(db_path: str, chroma_dir: str):
    """BehaviourLock — CLI chat agent for legacy code migration."""
    db = Database(Path(db_path))
    rag = RAGStore(persist_dir=chroma_dir)
    agent = Agent(db=db, rag=rag)

    console.print(Panel(
        "[bold]BehaviourLock[/bold] — Legacy Code Migration Analyst\n\n"
        "Describe your legacy system and I'll help extract requirements and plan the migration.\n\n"
        "[dim]Commands: /requirements  /tasks  /plan  /index <url|file|text>  /quit[/dim]",
        border_style="bright_blue",
    ))

    while True:
        try:
            user_input = console.input("[bold cyan]You>[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break

        if not user_input:
            continue

        # Slash commands
        if user_input.lower() == "/quit":
            console.print("[dim]Goodbye![/dim]")
            break
        elif user_input.lower() == "/requirements":
            _show_requirements(db)
            continue
        elif user_input.lower() == "/tasks":
            _show_tasks(db)
            continue
        elif user_input.lower() == "/plan":
            _show_plan(agent)
            continue
        elif user_input.lower().startswith("/index"):
            arg = user_input[len("/index"):].strip()
            _index_content(rag, arg)
            continue

        # Send to agent
        with console.status("[bold green]Thinking...[/bold green]"):
            try:
                response = agent.chat(user_input)
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                continue

        console.print()
        console.print(Panel(Markdown(response), title="BehaviourLock", border_style="green"))
        console.print()


if __name__ == "__main__":
    cli()
