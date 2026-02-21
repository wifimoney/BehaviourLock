# BehaviorLock (B.LOC)

> AI modernization copilot that **proves behavior is preserved** while migrating legacy systems.

---

## Quickstart

```bash
# 1. Install
pip install -r requirements.txt

# 2. Set API key
cp .env.example .env
# Edit .env → add your ANTHROPIC_API_KEY

# 3. Run server
python main.py
# → http://localhost:8000
# → Swagger UI: http://localhost:8000/docs
```

---

## Project Structure

```text
BehaviourLock/
├── main.py                          ← Uvicorn entry point
├── requirements.txt                 ← Dependencies
├── .env                             ← Context-specific configs
├── api/
│   └── app.py                       ← FastAPI endpoints
├── models/
│   └── state.py                     ← Pydantic state models
├── pipeline/
│   ├── graph.py                     ← LangGraph orchestrator
│   └── nodes/                       ← Individual pipeline steps
└── sample_legacy/
    └── payment_processor.py         ← Golden demo candidate
```

---

## Pipeline Architecture

```
POST /ingest/path  →  session_id
POST /run/{session_id}
        │
        ▼
[1] ingest_node          (pure Python)  — normalize repo
[2] workflow_miner_node  (pure Python)  — AST + networkx call graph
[3] testgen_node         (Claude API)   — generate characterization tests
[3b] baseline_runner_node (pure Python) — run tests, store snapshot
[4] migrator_node        (LangChain)    — Py2→3 patch + flake8 gate
[5] validator_node       (pure Python)  — re-run tests, diff snapshots
[6] reporter_node        (Claude API)   — confidence card + verdict
```

**LLM usage:**
- `testgen_node` → Direct `anthropic` SDK (tight prompt control)
- `migrator_node` → LangChain `ChatAnthropic` + `JsonOutputParser`
- `reporter_node` → Direct `anthropic` SDK (structured JSON output)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/path` | Point at local repo path |
| `POST` | `/ingest/upload` | Upload zip file |
| `POST` | `/run/{session_id}` | Run full pipeline |
| `GET`  | `/graph/{session_id}` | Cytoscape-format workflow graph |
| `GET`  | `/tests/{session_id}` | Generated test suite |
| `GET`  | `/baseline/{session_id}` | Baseline run results |
| `GET`  | `/patch/{session_id}` | Migration patch (unified diff) |
| `GET`  | `/validation/{session_id}` | Drift report |
| `GET`  | `/report/{session_id}` | Final confidence card |
| `GET`  | `/status/{session_id}` | Pipeline stage status |
| `POST` | `/demo/seed` | Pre-seed golden demo session |

---

## Demo (90 seconds)

```bash
# 1. Seed the demo with the sample legacy repo
curl -X POST "http://localhost:8000/demo/seed" \
  -F "repo_path=$(pwd)/sample_legacy"

# 2. Get the confidence report
curl http://localhost:8000/report/demo
```

---

## Sample Legacy Repo

`sample_legacy/payment_processor.py` — a Python 2 payment processor with:
- `print` statements
- `unicode` literals (`u"..."`)
- `dict.iteritems()`
- `xrange()`
- Old `except E, e:` syntax
- Dead code blocks
- `os.environ` reads (side effect)

Perfect for demo: clear Py2 patterns, real business logic, detectable drifts.

---

## Verdict Logic

| Verdict | Condition |
|---------|-----------|
| `SAFE` | ≥98% behavior preserved AND 0 critical drifts |
| `RISKY` | ≥85% preserved OR ≤2 critical drifts |
| `BLOCKED` | <85% preserved OR >2 critical drifts |

---

*"Modernization speed without trust is useless. We deliver both."*
