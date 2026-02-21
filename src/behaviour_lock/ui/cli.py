"""Click entry point, chat loop, slash commands."""

from __future__ import annotations

from pathlib import Path

import click
from dotenv import load_dotenv
from prompt_toolkit import PromptSession
from prompt_toolkit.completion import WordCompleter
from prompt_toolkit.history import FileHistory
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

from behaviour_lock.infrastructure.db import Database
from behaviour_lock.infrastructure.rag import RAGStore
from behaviour_lock.models import Project
from behaviour_lock.services.agent import Agent
from behaviour_lock.services.build import generate_build_context
from behaviour_lock.services.indexing import index_content, index_project
from behaviour_lock.services.memory import (
    attach_knowledge_node,
    classify_user_input,
)
from behaviour_lock.services.projects import (
    create_project,
    list_projects,
    project_chroma_dir,
    project_db_path,
    project_dir,
)
from behaviour_lock.ui.rendering import (
    _setup_session,
    confirm_action,
    console,
    on_memory_event,
    show_build_context,
    show_index_result,
    show_plan,
    show_project_index_progress,
    show_tree,
)

load_dotenv()

SLASH_COMMANDS = ["/build", "/plan", "/index", "/tree", "/quit"]
_command_completer = WordCompleter(SLASH_COMMANDS, sentence=True)


# --- Project selection ---


def _select_or_create_project() -> Project:
    """Interactive project selection or creation at startup."""
    projects = list_projects()

    console.print(Panel("[bold]BehaviourLock[/bold] — Project Selection", border_style="bright_blue"))

    if projects:
        table = Table(title="Existing Projects", show_lines=True)
        table.add_column("#", style="cyan", width=3)
        table.add_column("Name", style="green")
        table.add_column("Source Path", style="white")
        table.add_column("Slug", style="dim")
        for i, p in enumerate(projects, 1):
            table.add_row(str(i), p.name, p.source_path, p.slug)
        console.print(table)
        console.print("\n[dim]Enter a number to open a project, or 'n' to create a new one.[/dim]")

        while True:
            try:
                choice = _setup_session.prompt("Choice> ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                raise SystemExit(0) from None

            if choice == "n":
                return _create_project_flow()

            try:
                idx = int(choice) - 1
                if 0 <= idx < len(projects):
                    return projects[idx]
            except ValueError:
                pass
            console.print("[red]Invalid choice. Enter a number or 'n'.[/red]")
    else:
        console.print("[dim]No projects yet. Let's create one.[/dim]\n")
        return _create_project_flow()


def _create_project_flow() -> Project:
    """Prompt user for project name and source folder, create project, index source."""
    try:
        name = _setup_session.prompt("Project name> ").strip()
    except (EOFError, KeyboardInterrupt):
        raise SystemExit(0) from None

    if not name:
        console.print("[red]Name cannot be empty.[/red]")
        raise SystemExit(1)

    while True:
        try:
            source = _setup_session.prompt("Legacy source folder> ").strip()
        except (EOFError, KeyboardInterrupt):
            raise SystemExit(0) from None

        folder = Path(source).expanduser().resolve()
        if folder.exists() and folder.is_dir():
            break
        console.print(f"[red]Not a valid directory: {source}[/red]")

    project = create_project(name, str(folder))
    console.print(f"\n[bold green]Created project '{project.name}' ({project.slug})[/bold green]")

    # Index the source code with memory tree
    db = Database(project_db_path(project))
    db.on_memory_event = on_memory_event
    rag = RAGStore(persist_dir=project_chroma_dir(project))
    console.print(f"\n[dim]Indexing legacy source from {folder}...[/dim]")

    result = index_project(db, rag, str(folder), on_file_indexed=show_project_index_progress)

    console.print(
        f"\n[bold green]Project indexed: {result.files_indexed} files, {result.total_chunks} total chunks.[/bold green]"
    )
    if result.subsystems:
        for sub in result.subsystems:
            console.print(f"  📦 {sub}")
        console.print(
            f"\n[bold green]Memory tree built: {len(result.subsystems)} subsystem(s), root summary ready.[/bold green]"
        )

    db.close()
    return project


# --- Main CLI ---


@click.command()
def cli():
    """BehaviourLock — CLI chat agent for legacy code migration."""
    project = _select_or_create_project()

    db = Database(project_db_path(project))
    db.on_memory_event = on_memory_event
    rag = RAGStore(persist_dir=project_chroma_dir(project))
    agent = Agent(db=db, rag=rag)

    # Status spinner that can be paused for user prompts
    _status = console.status("[bold green]Thinking...[/bold green]")

    def _agent_confirm(kind: str, summary: str, content: str, context: str) -> tuple[str, str]:
        """Confirmation callback for agent tool calls — pauses the spinner."""
        _status.stop()
        result = confirm_action(kind, summary, content, context)
        _status.start()
        return result

    agent.confirm_fn = _agent_confirm

    # Chat session with persistent history per project
    history_file = project_dir(project) / ".chat_history"
    session: PromptSession = PromptSession(
        history=FileHistory(str(history_file)),
        completer=_command_completer,
    )

    console.print(
        Panel(
            f"[bold]BehaviourLock[/bold] — [cyan]{project.name}[/cyan]\n"
            f"Source: {project.source_path}\n\n"
            "[dim]Commands: /build <task_id>  /plan  /index <url|file|text>  /tree  /quit[/dim]",
            border_style="bright_blue",
        )
    )

    while True:
        try:
            user_input = session.prompt("You> ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/dim]")
            break

        if not user_input:
            continue

        if user_input.lower() == "/quit":
            console.print("[dim]Goodbye![/dim]")
            break
        elif user_input.lower() == "/plan":
            show_plan(db, agent)
            continue
        elif user_input.lower() == "/tree":
            show_tree(db)
            continue
        elif user_input.lower().startswith("/build"):
            arg = user_input[len("/build") :].strip()
            try:
                task_id = int(arg.lstrip("Tt"))
                md = generate_build_context(db, rag, task_id)
                show_build_context(md, task_id)
            except ValueError as e:
                console.print(
                    f"[red]{e}[/red]" if "not found" in str(e).lower() else "[red]Usage: /build <task_id>[/red]"
                )
            continue
        elif user_input.lower().startswith("/index"):
            arg = user_input[len("/index") :].strip()
            if not arg:
                console.print("[red]Usage: /index <url, filepath, or text>[/red]")
                continue
            try:
                result = index_content(db, rag, arg)
                show_index_result(result)
            except Exception as e:
                console.print(f"[red]Indexing error: {e}[/red]")
            continue

        # Auto-detect if user input contains project knowledge worth memorizing
        knowledge = classify_user_input(user_input)
        if knowledge:
            action, feedback = confirm_action("memory", knowledge["label"], knowledge["summary"], "")
            while action == "refine":
                knowledge = classify_user_input(user_input + "\n\nAdditional context: " + feedback)
                if not knowledge:
                    action = "no"
                    break
                action, feedback = confirm_action("memory", knowledge["label"], knowledge["summary"], "")
            if action == "yes":
                chunk_ids = rag.index_text_return_ids(
                    user_input,
                    metadata={"source": "user chat", "type": "user_chat"},
                )
                attach_knowledge_node(db, rag, knowledge["label"], chunk_ids, knowledge["summary"])

        _status.start()
        try:
            response = agent.chat(user_input)
        except Exception as e:
            console.print(f"[red]Error: {e}[/red]")
            _status.stop()
            continue
        _status.stop()

        console.print()
        console.print(Panel(Markdown(response), title="BehaviourLock", border_style="green"))
        console.print()
