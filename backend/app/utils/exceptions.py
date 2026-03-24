"""
exceptions.py — Exceções customizadas e handlers globais do FastAPI

Por que criar exceções customizadas?
  O FastAPI por padrão retorna erros genéricos (500 Internal Server Error)
  quando algo dá errado. Com exceções customizadas:
  - O cliente recebe código HTTP correto (400, 404, 413, 422...)
  - A mensagem de erro é clara e em português
  - O logging captura o contexto certo
  - Não vaza informações internas do servidor

Padrão de erro da API:
  {
    "error": "DOCUMENT_TOO_LARGE",
    "message": "O arquivo enviado excede o limite de 10 MB.",
    "detail": "Tamanho recebido: 15.3 MB"
  }
"""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


# ------------------------------------------------------------------ #
# Exceções de domínio — erros previsíveis do negócio
# ------------------------------------------------------------------ #

class FSPHBaseException(Exception):
    """
    Exceção base do sistema FSPH.
    Todas as exceções customizadas herdam desta.
    Isso permite capturar qualquer erro do sistema em um único handler.
    """

    def __init__(
        self,
        message: str,
        error_code: str,
        http_status: int = status.HTTP_400_BAD_REQUEST,
        detail: str | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.http_status = http_status
        self.detail = detail
        super().__init__(message)


class DocumentNotFoundError(FSPHBaseException):
    """Levantado quando um Termo de Referência não existe no banco."""

    def __init__(self, term_id: str):
        super().__init__(
            message=f"Termo de Referência com ID '{term_id}' não encontrado.",
            error_code="TERM_NOT_FOUND",
            http_status=status.HTTP_404_NOT_FOUND,
        )


class AnalysisNotFoundError(FSPHBaseException):
    """Levantado quando uma análise específica não existe."""

    def __init__(self, analysis_id: str):
        super().__init__(
            message=f"Análise com ID '{analysis_id}' não encontrada.",
            error_code="ANALYSIS_NOT_FOUND",
            http_status=status.HTTP_404_NOT_FOUND,
        )


class FileTooLargeError(FSPHBaseException):
    """Levantado quando o arquivo supera o limite de tamanho (HU-01: 10 MB)."""

    def __init__(self, received_mb: float, max_mb: int):
        super().__init__(
            message=f"O arquivo enviado excede o limite de {max_mb} MB.",
            error_code="FILE_TOO_LARGE",
            http_status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Tamanho recebido: {received_mb:.1f} MB",
        )


class UnsupportedFormatError(FSPHBaseException):
    """Levantado quando o formato do arquivo não é suportado."""

    def __init__(self, filename: str):
        super().__init__(
            message=f"Formato do arquivo '{filename}' não suportado. Use PDF, DOCX ou DOC.",
            error_code="UNSUPPORTED_FORMAT",
            http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class DocumentProcessingError(FSPHBaseException):
    """Levantado quando a extração de texto falha por corrupção ou formato inválido."""

    def __init__(self, filename: str, reason: str = ""):
        super().__init__(
            message=f"Não foi possível processar o arquivo '{filename}'.",
            error_code="DOCUMENT_PROCESSING_FAILED",
            http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=reason,
        )


class ChatSessionNotFoundError(FSPHBaseException):
    """Levantado quando uma sessão de chat não existe."""

    def __init__(self, session_id: str):
        super().__init__(
            message=f"Sessão de chat '{session_id}' não encontrada.",
            error_code="SESSION_NOT_FOUND",
            http_status=status.HTTP_404_NOT_FOUND,
        )


# ------------------------------------------------------------------ #
# Handlers globais — registrados no FastAPI em main.py
# ------------------------------------------------------------------ #

def _build_error_response(exc: FSPHBaseException) -> JSONResponse:
    """Constrói o corpo padronizado de resposta de erro."""
    content: dict = {
        "error": exc.error_code,
        "message": exc.message,
    }
    if exc.detail:
        content["detail"] = exc.detail
    return JSONResponse(status_code=exc.http_status, content=content)


async def fsph_exception_handler(request: Request, exc: FSPHBaseException) -> JSONResponse:
    """Handler para todas as exceções customizadas do FSPH."""
    return _build_error_response(exc)


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handler de último recurso para erros não previstos.
    Nunca expõe detalhes internos em produção.
    """
    from app.utils.logging import get_logger

    logger = get_logger(__name__)
    logger.error(
        "Erro não tratado na requisição %s %s",
        request.method,
        request.url,
        exc_info=True,
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "Ocorreu um erro interno. Por favor, tente novamente.",
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """
    Registra todos os handlers de exceção no app FastAPI.
    Chamado em main.py durante a criação do app.

    Uso:
        app = FastAPI()
        register_exception_handlers(app)
    """
    app.add_exception_handler(FSPHBaseException, fsph_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
