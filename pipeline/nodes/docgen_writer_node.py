from models.docgen_state import DocGenState, WriterDraft

def writer_node(state: DocGenState) -> DocGenState:
    print(f"[docgen:writer] Writing draft for {state.repo_path}")
    # TODO: Implement actual writing logic
    state.writer_draft = WriterDraft(
        overview="Generated overview",
        sections=[],
        usage_examples=[],
        raw_markdown="# Documentation Draft\nReady for review."
    )
    state.current_stage = "drafted"
    return state
