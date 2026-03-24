"""
cli.py — Entrypoints de linha de comando do projeto

Scripts registrados em [project.scripts] do pyproject.toml precisam
apontar para uma função Python — não para um comando shell completo.
"""

import uvicorn


def dev() -> None:
    """Inicia o servidor em modo desenvolvimento com hot-reload."""
    uvicorn.run(
        "app.main:app",
        reload=True,
        reload_dirs=["app"],  # monitora apenas o código — ignora chroma_db, uploads, etc.
        port=8000,
        host="0.0.0.0",
    )


def start() -> None:
    """Inicia o servidor em modo produção (sem reload)."""
    uvicorn.run("app.main:app", port=8000, host="0.0.0.0")
