"""
logging.py — Configuração centralizada de logging

Por que logging estruturado?
  Em produção, logs precisam ser:
  - Pesquisáveis (por nível, módulo, timestamp)
  - Integráveis com ferramentas como Datadog, Grafana, Loki
  - Consistentes (sempre o mesmo formato)

  Logging estruturado emite logs como dicionários/JSON, não strings livres.
  Isso facilita filtros como: "mostrar apenas erros do serviço de upload"
"""

import logging
import sys

from app.core.config import settings


def setup_logging() -> None:
    """
    Configura o sistema de logging global da aplicação.
    Deve ser chamado UMA vez na inicialização do app (em main.py).
    """
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        datefmt=date_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )

    # Silencia bibliotecas externas verbosas
    _noisy_loggers = [
        "sqlalchemy.engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "httpx",
        "httpcore",
        "openai",
        "chromadb",
        "chromadb.db",
        "chromadb.segment",
        "chromadb.telemetry",
        "sentence_transformers",
        "transformers",
        "torch",
        "huggingface_hub",
        "filelock",
        "urllib3",
        "asyncio",
        "multipart",
        "uvicorn.access",
    ]
    for name in _noisy_loggers:
        logging.getLogger(name).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Retorna um logger nomeado para o módulo.

    Uso:
        logger = get_logger(__name__)
        logger.info("Arquivo processado com sucesso", extra={"filename": "tr.pdf"})
        logger.error("Falha na extração", exc_info=True)

    Por que __name__?
      __name__ é o caminho do módulo (ex: "app.services.document").
      Isso permite filtrar logs por módulo sem configuração extra.
    """
    return logging.getLogger(name)
