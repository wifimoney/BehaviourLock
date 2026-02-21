# 🛡️ BehaviorLock (B.LOC)
### The AI Modernization Copilot that *Proves* Behavior Preservation.

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.ok/badge/LangGraph-232F3E?style=for-the-badge)](https://langchain-ai.github.io/langgraph/)
[![OpenRouter](https://img.shields.io/badge/Model-Gemini_2.0_Pro-blue?style=for-the-badge)](https://openrouter.ai)

**BehaviorLock** is an agentic modernization platform designed for high-stakes legacy migrations (e.g., Python 2 to 3, COBOL to Java). Unlike generic code translators, B.LOC is a **trust engine**: it generates characterization tests, runs them on the baseline, migrates the code, and then *proves* behavioral parity before you ever hit merge.

---

## 🔥 Features

- **🧠 Multi-Agent Orchestration**: Powered by LangGraph and Gemini 2.0 Pro (via OpenRouter).
- **📉 Trust Coverage**: A proprietary metric that surfaces the "safety gap" between generated tests and the entire codebase.
- **⚡ Live Telemetry**: Real-time pipeline progress via Server-Sent Events (SSE).
- **📝 Linkup (DocGen)**: A 4-agent documentation pipeline that writes technical docs, performs business logic QA, and proofreads automatically.
- **🛡️ Behavior Parity Verification**: Automatic snapshot diffing between legacy and modernized outputs.
- **🚧 Flake8 Gate**: Automated linting enforcement on every generated patch.

---

## 🚀 Quickstart

```bash
# 1. Pipeline Setup
pip install -r requirements.txt

# 2. Configure Environment
# Copy .env.example -> .env and add your OPENROUTER_API_KEY
# The project is optimized for google/gemini-2.0-pro-exp-02-05:free

# 3. Ignite the Engine
python main.py
```

- **Dashboard**: `http://localhost:8000`
- **Interactive API**: `http://localhost:8000/docs`

---

## 🏗️ The Pipeline

B.LOC runs a high-fidelity 6-stage modernize-and-verify loop:

1.  **Ingest**: Normalizes the legacy repository into a clean workspace.
2.  **Workflow Miner**: Uses AST analysis and `networkx` to map the call graph and identify high-risk side effects.
3.  **TestGen**: Gemini generates `pytest` characterization tests for entry points and critical logic.
4.  **Baseline Runner**: Executes tests on the legacy code to capture "golden snapshots."
5.  **Migrator**: LangChain-powered transformation (e.g., Py2→Py3) with an integrated Flake8 linting gate.
6.  **Validator**: Re-runs the test suite on migrated code and performs a semantic snapshot diff.
7.  **Reporter**: Generates a final **Confidence Card** with a verdict: `SAFE`, `RISKY`, or `BLOCKED`.

---

## 📝 Linkup: Documentation Intelligence
The Linkup module adds a secondary documentation pipeline:
- **Scanner Agent**: Parses signatures and side effects.
- **Writer Agent**: Drafts comprehensive technical documentation.
- **QA Agent**: Checks for business logic consistency.
- **Proofreader Agent**: Polishes tone and ensures readiness.

Approved documentation can be automatically synced to Discord or Cody workflows.

---

## 📊 Verdict Logic

We don't guess. We verify.

| Verdict | Logic Criteria |
| :--- | :--- |
| **✅ SAFE** | ≥98% Behavior Preservation AND 0 Critical Drifts |
| **⚠️ RISKY** | ≥85% Behavior Preservation OR ≤2 Critical Drifts |
| **🚫 BLOCKED** | <85% Behavior Preservation OR >2 Critical Drifts |

---

## 🛠️ Tech Stack
- **Orchestration**: LangGraph (StateGraph)
- **Intelligence**: Gemini 2.0 Pro (OpenRouter)
- **API**: FastAPI + Uvicorn
- **Analysis**: AST, NetworkX, Flake8
- **Testing**: Pytest + JSON Reporting
- **Streaming**: SSE (Server-Sent Events)

---

> *"Modernization speed without trust is just technical debt in a new language. We provide the proof."*

[Read the Technical Deep Dive →](TECHNICAL_README.md)
