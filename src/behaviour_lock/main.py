"""CLI and API entrypoints."""

from behaviour_lock.ui.cli import cli


def run_api():
    """Start the FastAPI server via uvicorn."""
    import uvicorn

    uvicorn.run("behaviour_lock.api.app:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    cli()
