"""
ingestion.py — Service de ingestão de documentos

Orquestra o pipeline completo de upload e análise automática de um TR:
  arquivo (bytes) → validação → extração de texto → NLP → arquivo físico
  → persistência (Term + Checklist + WorkflowEvent + Analysis) → resposta

Por que este service existe?
  A rota POST /api/v1/upload precisava orquestrar 3 services externos, 4
  repositórios e salvar arquivos — tudo num único handler de 140 linhas.
  Extrair para IngestionService:
    - Torna a rota um delegador de ~10 linhas
    - Permite testar o pipeline sem FastAPI/HTTP
    - Separa responsabilidades: routing ≠ lógica de negócio
"""

import os
import uuid

import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.analysis import AnalysisRepository
from app.repositories.checklist import ChecklistRepository
from app.repositories.term import TermRepository
from app.repositories.workflow_event import WorkflowEventRepository
from app.schemas.analysis import AnalysisResponse
from app.schemas.term import TermResponse
from app.services.compliance import ComplianceService
from app.services.document import DocumentService
from app.services.nlp import NLPService
from app.utils.exceptions import FileTooLargeError, UnsupportedFormatError
from app.utils.logging import get_logger

logger = get_logger(__name__)


class IngestionService:
    """
    Pipeline completo de ingestão de documentos.

    Todos os métodos são estáticos ou de classe — sem estado de instância,
    seguindo o padrão dos demais services do projeto.
    """

    @classmethod
    async def ingest(
        cls,
        db: AsyncSession,
        file_bytes: bytes,
        filename: str,
        current_user: object,
    ) -> tuple[TermResponse, AnalysisResponse]:
        """
        Executa o pipeline de ingestão de ponta a ponta.

        Args:
            db:           Sessão async do SQLAlchemy
            file_bytes:   Conteúdo bruto do arquivo já lido
            filename:     Nome original do arquivo (ex: "edital.pdf")
            current_user: Objeto do usuário autenticado (precisa de .id)

        Returns:
            Tupla (TermResponse, AnalysisResponse) pronta para serialização.

        Raises:
            UnsupportedFormatError: se a extensão não for PDF/DOCX/DOC
            FileTooLargeError:      se o arquivo exceder MAX_FILE_SIZE_BYTES
        """
        # --- 1. Valida formato ---
        if not DocumentService.is_supported(filename):
            raise UnsupportedFormatError(filename)

        # --- 2. Valida tamanho ---
        size_mb = len(file_bytes) / (1024 * 1024)
        if len(file_bytes) > settings.MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(size_mb, settings.MAX_FILE_SIZE_MB)

        logger.info("Upload recebido: filename=%r size=%.2fMB", filename, size_mb)

        # --- 3. Extrai texto ---
        text = await DocumentService.extract_text(file_bytes, filename)

        # --- 4. NLP: detecta seções, campos e valor ---
        sections = NLPService.detect_sections(text)
        variable_fields = NLPService.detect_variable_fields(text)
        estimated_value = NLPService.extract_estimated_value(text)
        category = NLPService.detect_category(text)

        # --- 5. Salva o arquivo fisicamente ---
        file_path = await cls._save_file(file_bytes, filename)

        # --- 6. Persiste o Term no banco ---
        title = cls._extract_title(text, filename)
        term = await TermRepository.create(db, {
            "title": title,
            "category": category,
            "status": "Rascunho",
            "content": text[:50_000],  # limita a 50k chars no banco
            "sections": sections,
            "variable_fields": variable_fields,
            "estimated_value": estimated_value,
            "original_filename": filename,
            "file_path": file_path,
            "created_by_id": current_user.id,
        })

        # --- 7. Cria checklist e registra evento de criação ---
        await ChecklistRepository.create_for_term(db, str(term.id))
        await WorkflowEventRepository.create(
            db,
            term_id=str(term.id),
            ator_id=str(current_user.id),
            acao="criar",
            para_setor="demandante",
        )

        # --- 8. Analisa conformidade ---
        compliance = ComplianceService.analyze(text, sections)

        # --- 9. Persiste a Analysis ---
        # Nota: compliance["status"] é informativo — não altera Term.status.
        # O status do TR é controlado exclusivamente pelo fluxo de tramitação.
        analysis = await AnalysisRepository.create(db, {
            "term_id": term.id,
            "compliance_score": compliance["compliance_score"],
            "status": compliance["status"],
            "criteria_results": compliance["criteria_results"],
            "suggestions": compliance["suggestions"],
            "legal_references": compliance["legal_references"],
        })

        logger.info(
            "Upload concluído: term_id=%s score=%.2f status=%s",
            term.id, compliance["compliance_score"], compliance["status"],
        )

        # --- 10. Monta resposta ---
        term_response = TermResponse.model_validate(term)
        analysis_response = AnalysisResponse.from_orm_analysis(analysis)

        return term_response, analysis_response

    # ------------------------------------------------------------------ #
    # Utilitários internos
    # ------------------------------------------------------------------ #

    @staticmethod
    async def _save_file(file_bytes: bytes, filename: str) -> str:
        """Salva o arquivo no disco e retorna o caminho."""
        upload_dir = settings.UPLOAD_DIR
        os.makedirs(upload_dir, exist_ok=True)

        # Nome único para evitar colisões
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
        unique_name = f"{uuid.uuid4().hex}.{ext}"
        file_path = os.path.join(upload_dir, unique_name)

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_bytes)

        return file_path

    @staticmethod
    def _extract_title(text: str, filename: str) -> str:
        """
        Retorna o título do TR.
        Preferência: nome do arquivo (sempre legível).
        Fallback: primeira linha do texto que não pareça lixo binário.
        """
        # Primary: nome do arquivo sem extensão — previsível e sempre legível
        name_without_ext = filename.rsplit(".", 1)[0] if "." in filename else filename
        clean = name_without_ext.replace("_", " ").replace("-", " ").strip()
        if clean:
            return clean[:300]

        # Fallback: primeira linha do texto com ≥10 chars e maioria de chars
        # Latin/ASCII (ord<256) — rejeita texto garbled (CJK, Korean etc.)
        for line in (l.strip() for l in text.split("\n") if l.strip()):
            if 10 <= len(line) <= 300:
                latin_ratio = sum(ord(c) < 256 for c in line) / len(line)
                if latin_ratio > 0.5:
                    return line[:300]

        return clean or "Documento"
