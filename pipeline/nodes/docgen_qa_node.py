from models.docgen_state import DocGenState, QAOutput

def qa_node(state: DocGenState) -> DocGenState:
    print(f"[docgen:qa] Reviewing draft")
    # TODO: Implement actual QA logic
    state.qa_output = QAOutput(
        issues_found=[],
        biz_logic_added=[],
        revised_markdown=state.writer_draft.raw_markdown if state.writer_draft else "",
        qa_score=0.95
    )
    state.current_stage = "qa_complete"
    return state
