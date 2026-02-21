"""Rich console helpers — panels, tables, event logs."""

from __future__ import annotations

from pathlib import Path

from prompt_toolkit import PromptSession
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.models import MemoryNode
from behaviour_lock.services.indexing import IndexResult
from behaviour_lock.services.memory import format_tree_text

console = Console()

# Simple prompt session for setup prompts (no history file yet)
_setup_session = PromptSession()


def on_memory_event(event: str, node: MemoryNode, parent: MemoryNode | None = None) -> None:
    """Rich-formatted log for memory node operations."""
    short_summary = (node.summary or node.label)[:60]
    if len(node.summary or node.label) > 60:
        short_summary += "..."
    if event == "created":
        console.print(f"  [dim cyan]+ created memory node id_{node.id} ({node.node_type}) '{short_summary}'[/dim cyan]")
    elif event == "updated":
        console.print(f"  [dim yellow]~ updated memory node id_{node.id} '{short_summary}'[/dim yellow]")
    elif event == "removed":
        console.print(f"  [dim red]- removed memory node id_{node.id} '{short_summary}'[/dim red]")
    elif event == "linked" and parent is not None:
        parent_short = (parent.summary or parent.label)[:40]
        if len(parent.summary or parent.label) > 40:
            parent_short += "..."
        console.print(
            f"  [dim green]→ linked memory node id_{node.id} '{short_summary}' "
            f"to memory node id_{parent.id} '{parent_short}'[/dim green]"
        )


def confirm_action(kind: str, summary: str, content: str, context: str) -> tuple[str, str]:
    """Show a confirmation panel for a proposed object and prompt y/n/r.
    Returns ("yes", ""), ("no", ""), or ("refine", feedback)."""
    lines = [f"[bold yellow]New {kind.upper()}[/bold yellow]", ""]
    lines.append(f"[cyan]Summary:[/cyan] {summary}")
    if content:
        truncated = content[:500]
        if len(content) > 500:
            truncated += "..."
        lines.append(f"\n[white]{truncated}[/white]")
    if context:
        lines.append(f"\n[dim]Grounded in memory nodes:[/dim]\n{context}")

    console.print(Panel("\n".join(lines), title=f"Confirm {kind}", border_style="yellow"))
    console.print("[dim](y)es  (n)o  (r)efine[/dim]")

    while True:
        try:
            choice = _setup_session.prompt("Confirm> ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            return ("no", "")

        if choice in ("y", "yes"):
            return ("yes", "")
        elif choice in ("n", "no"):
            return ("no", "")
        elif choice in ("r", "refine"):
            try:
                feedback = _setup_session.prompt("Feedback> ").strip()
            except (EOFError, KeyboardInterrupt):
                return ("no", "")
            if not feedback:
                console.print("[red]Empty feedback, treating as no.[/red]")
                return ("no", "")
            return ("refine", feedback)
        else:
            console.print("[red]Please enter y, n, or r.[/red]")


def show_requirements(db: Database) -> None:
    reqs = db.list_requirements()
    if not reqs:
        console.print("[dim]No requirements stored yet.[/dim]")
        return
    table = Table(title="User Requirements", show_lines=True)
    table.add_column("ID", style="cyan", width=4)
    table.add_column("Summary", style="green")
    table.add_column("Refs", style="yellow", width=4)
    table.add_column("Tasks", style="magenta", width=5)
    table.add_column("Content", style="white", max_width=50)
    for r in reqs:
        child_tasks = db.list_tasks_for_requirement(r.id)
        table.add_row(
            str(r.id),
            r.summary,
            str(len(r.references)),
            str(len(child_tasks)),
            r.content[:100] + ("..." if len(r.content) > 100 else ""),
        )
    console.print(table)


def show_plan(db: Database, agent) -> None:
    result = agent._generate_plan()
    console.print(Panel(Markdown(result["plan"]), title="Implementation Plan", border_style="blue"))
    tasks = db.list_tasks_sorted()
    if tasks:
        ids = ", ".join(f"T{t.id}" for t in tasks)
        console.print(f"\n[dim]Task IDs (for /build): {ids}[/dim]")


def show_tree(db: Database) -> None:
    """Display the memory tree."""
    tree = db.get_memory_tree()
    if tree is None:
        console.print("[dim]No memory tree built yet. Index some content first.[/dim]")
        return
    text = format_tree_text(tree)
    console.print(Panel(text, title="Memory Tree", border_style="bright_cyan"))


def show_build_context(markdown: str, task_id: int) -> None:
    """Display build context and write to file."""
    out_path = Path(f"build_T{task_id}.md")
    out_path.write_text(markdown)
    console.print(Panel(Markdown(markdown), title=f"Build Context: T{task_id}", border_style="bold red"))
    console.print(f"\n[bold green]Written to {out_path}[/bold green]")


def show_index_result(result: IndexResult) -> None:
    """Display the result of an indexing operation."""
    console.print(f"[green]{result.detail}[/green]")


def show_project_index_progress(rel_path: str, index: int, total: int, chunks: int) -> None:
    """Per-file progress during project indexing."""
    if chunks > 0:
        console.print(f"  [{index}/{total}] [cyan]{rel_path}[/cyan] — [green]{chunks} chunks[/green]")
    else:
        console.print(f"  [{index}/{total}] [cyan]{rel_path}[/cyan] — [red]0 chunks[/red]")
