# 🛠️ BehaviorLock Technical Deep Dive

This document outlines the architectural decisions, agentic flow, and verification logic of the BehaviorLock (B.LOC) project.

---

## 1. Orchestration: LangGraph State Machine

We use **LangGraph** to manage the complexity of the modernization pipeline. By treating the migration as a cyclic directed graph, we gain several advantages:
- **State Management**: The `PipelineState` (Pydantic) is passed between nodes, ensuring type-safe transitions.
- **Short-Circuiting**: If a node (e.g., `migrator`) fails a critical gate (e.g., Flake8 linting), the graph routes directly to the `END` node.
- **Background Execution**: Long-running LLM tasks are handled asynchronously, with progress streamed to the frontend via **SSE (Server-Sent Events)**.

### The Graph Topology:
```
(START) -> [Ingest] -> [Workflow Miner] -> [Dead Code] -> [TestGen] -> [Baseline] -> [Migrator] -> [Validator] -> [Reporter] -> (END)
```

---

## 2. The Verification Engine: Characterization Testing

B.LOC does not rely on unit tests provided by the user (which are often missing or broken in legacy systems). Instead, it uses **Characterization Tests** (also known as Golden Master tests).

### Logic:
1. **Targeting**: The `Workflow Miner` identifies "entrypoints" and "side-effect" functions using AST traversal.
2. **Generation**: `TestGen` (Gemini 2.0 Pro) generates `pytest` code that mocks side effects (file I/O, network) and snapshots the return value.
3. **Immutability**: Once snapshots are captured in the **Baseline** stage, they are fixed.
4. **Validation**: The **Validator** node re-runs the same tests against the *migrated* code. Any difference in the returned data structures is flagged as a "Behavioral Drift."

---

## 3. Trust Coverage Metric

We introduced **Trust Coverage** to distinguish between "successful migration" and "safe migration."
- **Code Coverage**: Traditionally measures execution lines.
- **Trust Coverage**: Specifically measures the percentage of high-value business logic (entrypoints + functions with side effects) that have active characterization tests guarding them.
- *Appeal*: Surfaces exactly which parts of the modernized system are "blind spots."

---

## 4. Multi-Agent Documentation (Linkup)

The `Linkup` module is a dedicated sub-pipeline for technical documentation. It utilizes a 4-agent consensus model:
1. **Scanner Agent**: Uses AST to extract signatures and structural intent.
2. **Writer Agent**: Transforms the technical structure into human-readable Markdown.
3. **QA Agent**: Cross-references the docs with common business logic patterns (e.g., verifying that a `fee_calc` function's documentation mentions its range constraints).
4. **Proofreader Agent**: Ensures technical terms are consistent and the tone is professional.

---

## 5. Security & Isolation

- **Temporary Workspaces**: Every migration run happens in a unique, isolated temp directory (`/tmp/bloc_migrated_...`). This prevents the system from accidentally polluting the source repository.
- **Subprocess Guarding**: All test executions (`pytest`) and linting (`flake8`) are run in subprocesses with strict timeouts to prevent hanging or malicious code execution.

---

## 6. LLM Routing: OpenRouter + Gemini 2.0 Pro

B.LOC is optimized for **Google Gemini 2.0 Pro** via OpenRouter. We use specific capabilities:
- **Context Length**: Gemini handles large file contexts (e.g., 2000+ line legacy modules) without truncation.
- **Structured JSON**: All agents are prompted for strict JSON output, which we parse using LangChain's `JsonOutputParser` or direct Pydantic validation.
- **Fallback Logic**: Our `_call_gemini` helpers include "salvage" logic that can repair minor JSON formatting errors returned by the LLM.

---

## 7. API Design

B.LOC follows a **Stateless Core / Managed Session** pattern:
- The backend stores `PipelineState` objects in an in-memory `_sessions` map.
- The UI polls `/status/{session_id}` or listens to `/stream/{session_id}` to keep the dashboard reactive.
- Every intermediate stage (Graph, Tests, Patch, Validation) has its own `GET` endpoint for deep investigation.

---

*"We build the bridge while proving the old one still stands."*
