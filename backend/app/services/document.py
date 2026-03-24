"""
document.py — Service de extração de texto de documentos

Responsável por receber um arquivo (bytes) e retornar o texto extraído.
Suporta: PDF (.pdf), Word moderno (.docx), Word legado (.doc via antiword).

Por que este service existe separado?
  A lógica de extração é independente de framework.
  Pode ser testada com arquivos reais sem subir o servidor FastAPI.
  Os routes só chamam DocumentService.extract() — não conhecem pdfplumber.

Hierarquia de qualidade de extração:
  1. .docx → python-docx  (perfeito: XML estruturado)
  2. .pdf  → pdfplumber   (bom: preserva layout e tabelas)
  3. .doc  → antiword     (básico: texto puro, sem formatação)
"""

import io
import subprocess
import tempfile

import pdfplumber
from docx import Document as DocxDocument

from app.utils.exceptions import DocumentProcessingError, UnsupportedFormatError
from app.utils.logging import get_logger

logger = get_logger(__name__)


class DocumentService:

    # Extensões suportadas — usadas na validação do route
    SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc"}
    SUPPORTED_MIME_TYPES = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    }

    @classmethod
    def extract_text_sync(cls, file_bytes: bytes, filename: str) -> str:
        """
        Versão síncrona de extract_text — para uso em threads (ex: RagService).
        Os extratores internos (_extract_pdf, _extract_docx, _extract_doc) são
        todos síncronos, portanto não há necessidade de event loop.
        """
        extension = cls._get_extension(filename)

        logger.info("Extraindo texto: filename=%r ext=%s size=%d bytes",
                    filename, extension, len(file_bytes))

        if extension == ".pdf":
            return cls._extract_pdf(file_bytes, filename)
        elif extension == ".docx":
            return cls._extract_docx(file_bytes, filename)
        elif extension == ".doc":
            return cls._extract_doc(file_bytes, filename)
        else:
            raise UnsupportedFormatError(filename)

    @classmethod
    async def extract_text(cls, file_bytes: bytes, filename: str) -> str:
        """
        Extrai texto de um documento baseado na extensão do arquivo.

        Args:
            file_bytes: Conteúdo binário do arquivo (recebido via upload)
            filename:   Nome original do arquivo (usado para detectar extensão)

        Returns:
            Texto extraído como string (pode conter quebras de linha)

        Raises:
            UnsupportedFormatError: se a extensão não for suportada
            DocumentProcessingError: se a extração falhar (arquivo corrompido)
        """
        extension = cls._get_extension(filename)

        logger.info("Extraindo texto: filename=%r ext=%s size=%d bytes",
                    filename, extension, len(file_bytes))

        if extension == ".pdf":
            return cls._extract_pdf(file_bytes, filename)
        elif extension == ".docx":
            return cls._extract_docx(file_bytes, filename)
        elif extension == ".doc":
            return cls._extract_doc(file_bytes, filename)
        else:
            raise UnsupportedFormatError(filename)

    # ------------------------------------------------------------------ #
    # Extratores por formato
    # ------------------------------------------------------------------ #

    @staticmethod
    def _extract_pdf(file_bytes: bytes, filename: str) -> str:
        """
        Extrai texto de PDF usando pdfplumber.

        Por que pdfplumber?
          - Extrai tabelas como listas estruturadas (melhor que PyPDF2)
          - Preserva posicionamento do texto
          - Handles PDFs digitalizados com OCR quando combinado com pytesseract

        Tabelas são convertidas em texto formatado com separadores | para
        preservar a estrutura ao realizar análise posterior.
        """
        try:
            text_parts = []

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    # Extrai texto da página
                    page_text = page.extract_text() or ""

                    # Extrai tabelas e as converte para texto
                    tables = page.extract_tables()
                    table_texts = []
                    for table in tables:
                        for row in table:
                            # Filtra células None e une com |
                            row_text = " | ".join(
                                str(cell).strip() if cell else ""
                                for cell in row
                            )
                            if row_text.strip():
                                table_texts.append(row_text)

                    page_content = page_text
                    if table_texts:
                        page_content += "\n" + "\n".join(table_texts)

                    if page_content.strip():
                        text_parts.append(f"[Página {page_num}]\n{page_content}")

            full_text = "\n\n".join(text_parts)

            if not full_text.strip():
                raise DocumentProcessingError(
                    filename,
                    "PDF parece estar vazio ou ser uma imagem sem OCR. "
                    "Verifique se o PDF contém texto selecionável."
                )

            logger.info("PDF extraído: filename=%r páginas=%d chars=%d",
                        filename, len(text_parts), len(full_text))
            return full_text

        except DocumentProcessingError:
            raise
        except Exception as e:
            raise DocumentProcessingError(filename, str(e)) from e

    @staticmethod
    def _extract_docx(file_bytes: bytes, filename: str) -> str:
        """
        Extrai texto de arquivos .docx usando python-docx.

        O formato .docx é XML estruturado — python-docx parseia os elementos
        nativamente: paragraphs, tables, headers, footers.
        """
        try:
            doc = DocxDocument(io.BytesIO(file_bytes))
            text_parts = []

            # Parágrafos normais
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_parts.append(paragraph.text)

            # Tabelas — converte células para texto
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(
                        cell.text.strip() for cell in row.cells
                        if cell.text.strip()
                    )
                    if row_text:
                        text_parts.append(row_text)

            full_text = "\n".join(text_parts)

            if not full_text.strip():
                raise DocumentProcessingError(filename, "Documento DOCX está vazio.")

            logger.info("DOCX extraído: filename=%r parágrafos=%d chars=%d",
                        filename, len(text_parts), len(full_text))
            return full_text

        except DocumentProcessingError:
            raise
        except Exception as e:
            raise DocumentProcessingError(filename, str(e)) from e

    @staticmethod
    def _extract_doc(file_bytes: bytes, filename: str) -> str:
        """
        Extrai texto de arquivos .doc (Word legado) via antiword.

        antiword é um utilitário de linha de comando que converte .doc para
        texto puro. Requer instalação no sistema:
          Ubuntu/Debian: apt-get install antiword
          Windows: não disponível nativamente (alternativa: LibreOffice headless)

        Para MVP em ambiente Linux (Docker), antiword é simples e eficaz.
        """
        try:
            # Salva bytes em arquivo temporário (antiword precisa de arquivo real)
            with tempfile.NamedTemporaryFile(suffix=".doc", delete=False) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name

            result = subprocess.run(
                ["antiword", tmp_path],
                capture_output=True,
                text=True,
                timeout=30,  # timeout de 30s para arquivos grandes
            )

            if result.returncode != 0:
                # antiword não está instalado ou falhou
                raise DocumentProcessingError(
                    filename,
                    f"Falha ao processar .doc: {result.stderr}. "
                    "Converta para .docx e tente novamente."
                )

            full_text = result.stdout
            if not full_text.strip():
                raise DocumentProcessingError(filename, "Documento .doc está vazio.")

            logger.info("DOC extraído via antiword: filename=%r chars=%d",
                        filename, len(full_text))
            return full_text

        except DocumentProcessingError:
            raise
        except subprocess.TimeoutExpired:
            raise DocumentProcessingError(filename, "Timeout na extração do arquivo .doc.")
        except FileNotFoundError:
            raise DocumentProcessingError(
                filename,
                "antiword não está instalado. Converta o arquivo para .docx."
            )
        except Exception as e:
            raise DocumentProcessingError(filename, str(e)) from e

    # ------------------------------------------------------------------ #
    # Utilitários
    # ------------------------------------------------------------------ #

    @staticmethod
    def _get_extension(filename: str) -> str:
        """Extrai a extensão em minúsculas do nome do arquivo."""
        parts = filename.rsplit(".", 1)
        if len(parts) < 2:
            return ""
        return f".{parts[1].lower()}"

    @classmethod
    def is_supported(cls, filename: str) -> bool:
        """Verifica se a extensão do arquivo é suportada."""
        return cls._get_extension(filename) in cls.SUPPORTED_EXTENSIONS
