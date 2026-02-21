from models.docgen_state import DocGenState

def scanner_node(state: DocGenState) -> DocGenState:
    print(f"[docgen:scanner] Scanning {state.repo_path}")
    # TODO: Implement actual scanning logic
    state.current_stage = "scanned"
    return state
