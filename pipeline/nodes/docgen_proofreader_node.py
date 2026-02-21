from models.docgen_state import DocGenState, ProofreadOutput

def proofreader_node(state: DocGenState) -> DocGenState:
    print(f"[docgen:proofreader] Polishing documentation")
    # TODO: Implement actual proofreading logic
    final_md = state.qa_output.revised_markdown if state.qa_output else ""
    state.proofread_output = ProofreadOutput(
        changes_made=["Polished tone"],
        final_markdown=final_md,
        word_count=len(final_md.split()),
        ready_for_review=True
    )
    state.current_stage = "awaiting_review"
    return state
