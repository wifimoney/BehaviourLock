# BehaviourLock

**CLI chat agent for legacy code migration — requirements gathering & task planning.**

BehaviourLock helps teams migrate legacy systems by extracting requirements and building a grounded task plan before writing a single line of code. It's the "Part 1" of a two-stage pipeline: BehaviourLock produces context-rich build specs, a downstream coding agent consumes them.

## Philosophy

Migration starts from zero. Every requirement and task must be **grounded in evidence** from the knowledge base — no hallucinated specs. The goal is to give the coding agent (Part 2) maximal context so it can implement without asking further questions.

## Core Workflow

```
1. /project_input <folder>   → Index the legacy codebase into the knowledge base
2. /index <url|file|text>    → Add supplementary docs, meeting notes, URLs
3. Chat with the agent       → Discuss the system, refine requirements, build tasks
4. /plan                     → Review the full implementation plan with task IDs
5. /build <task_id>          → Export a context-rich markdown spec for the coding agent
```

## Commands

| Command | Description |
|---------|-------------|
| `/project_input <folder>` | Index an entire legacy project. Walks the directory, reads each source file, generates an LLM description of what it does, and stores both raw content + description in the knowledge base. |
| `/index <url\|file\|text>` | Index supplementary context — a URL (fetched & parsed), a file, or inline text. Each is chunked and also processed by the LLM to extract fine-grained facts (entities, business rules, data flows). |
| `/requirements` | Show all stored user requirements with reference counts and child task counts. |
| `/plan` | Show the full implementation plan (requirements + topologically sorted tasks) with task IDs listed at the bottom for use with `/build`. |
| `/build <task_id>` | Generate a build context markdown file (`build_T<id>.md`) containing the task details, parent requirement, all referenced knowledge base chunks, and dependency task summaries. This is the handoff artifact to the coding agent. |
| `/quit` | Exit the application. |

## Data Model

### Knowledge Base (RAG)

ChromaDB vector store. All project knowledge lives here. Every indexed item produces:

- **Raw chunks** — overlapping text segments of the original content
- **Extracted facts** — LLM-generated one-line facts (entities, rules, specs) for precise retrieval
- **Source file descriptions** (for `/project_input`) — LLM-generated natural language summary of what each file does

Each chunk has a unique `chunk_id` used as a reference anchor.

### User Requirements

| Field | Description |
|-------|-------------|
| `id` | Auto-incrementing ID |
| `summary` | One-line description |
| `content` | Detailed markdown with implementation specifics |
| `references` | List of RAG chunk IDs that ground this requirement |

A requirement owns one or more tasks (1:N). Deleting a requirement cascades to its tasks.

### Tasks

| Field | Description |
|-------|-------------|
| `id` | Auto-incrementing ID |
| `requirement_id` | Parent requirement (FK) |
| `tags` | `infra`, `test`, `feature`, `docs`, `refactor` |
| `summary` | One-line description |
| `implementation_details` | Detailed markdown |
| `references` | List of RAG chunk IDs grounding this task |
| `dependencies` | List of task IDs that must be completed first |

Tasks are topologically sorted with **test tasks prioritized first** (test-driven migration).

## Agent Behavior

The chat agent (powered by an LLM via OpenRouter) has tools to:

- **Search the knowledge base** — semantic search returning chunk IDs + text
- **Index user knowledge** — when you share domain info in chat, the agent persists it to RAG before using it
- **CRUD requirements** — always with RAG chunk references as evidence
- **CRUD tasks** — linked to a parent requirement, always with RAG references
- **Generate plans** — produces the full implementation plan with inlined context

**Key rule:** The agent will not create requirements or tasks without grounding references. If the knowledge base is empty, it will ask you to index documents first.

## Build Output (`/build`)

The exported markdown contains everything the coding agent needs:

```
# Build Context: T{id}
## Task: {summary}
  Tags, dependencies, implementation details
## Parent Requirement: R{id} — {summary}
  Full requirement content
  ### Requirement Context (from knowledge base)
    Referenced RAG chunks
## Task Context (from knowledge base)
  Referenced RAG chunks
## Dependency Tasks
  Summary of prerequisite tasks
```

## Tech Stack

- **Python 3.11+** with **uv** for project management
- **OpenRouter** (OpenAI-compatible API) — LLM for chat agent, knowledge extraction, source file descriptions
- **ChromaDB** — persistent vector store for RAG
- **SQLite** — relational store for requirements and tasks
- **Rich** — terminal UI (tables, panels, markdown rendering)
- **Click** — CLI framework

## Setup

```bash
uv venv --python 3.11
uv pip install -e .
```

Configure `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=google/gemini-2.5-flash   # optional, this is the default
```

Run:
```bash
source .venv/bin/activate
python -m behaviour_lock
```
