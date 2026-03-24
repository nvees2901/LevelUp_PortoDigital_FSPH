"""
pdf_generator.py — Geração de PDF formatado com ReportLab

Gera PDFs profissionais dos Termos de Referência com:
  - Cabeçalho institucional FSPH
  - Seções formatadas com referências legais
  - Rodapé com data, número de páginas e versão
  - Fontes e cores padronizadas

Por que ReportLab e não WeasyPrint ou fpdf2?
  - Controle pixel-perfect do layout (margens, fontes, cores exatas)
  - Sem dependência de HTML/CSS (mais estável em ambientes headless)
  - Suporte nativo a cabeçalhos/rodapés automáticos por página
  - Amplamente usado em sistemas governamentais brasileiros
"""

import io
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.utils.logging import get_logger

logger = get_logger(__name__)

# ------------------------------------------------------------------ #
# Cores institucionais FSPH
# ------------------------------------------------------------------ #
FSPH_BLUE = colors.HexColor("#003366")       # azul escuro institucional
FSPH_LIGHT_BLUE = colors.HexColor("#0066CC") # azul claro para destaques
FSPH_GRAY = colors.HexColor("#666666")       # cinza para textos secundários
FSPH_BORDER = colors.HexColor("#CCCCCC")     # cinza claro para bordas


class PDFGeneratorService:

    @classmethod
    def generate_term_pdf(cls, term_data: dict) -> bytes:
        """
        Gera o PDF de um Termo de Referência.

        Args:
            term_data: Dicionário com os dados do TR (compatível com TermResponse)

        Returns:
            bytes do PDF gerado (pronto para StreamingResponse)
        """
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2 * cm,
            leftMargin=2 * cm,
            topMargin=2.5 * cm,
            bottomMargin=2.5 * cm,
            title=f"TR - {term_data.get('title', 'Termo de Referência')}",
            author="FSPH - Sistema de Análise de TRs",
        )

        styles = cls._build_styles()
        story = []

        # --- Cabeçalho institucional ---
        story.extend(cls._build_header(styles))
        story.append(Spacer(1, 0.5 * cm))

        # --- Título do documento ---
        story.append(Paragraph("TERMO DE REFERÊNCIA", styles["title"]))
        story.append(Spacer(1, 0.3 * cm))

        # --- Subtítulo com objeto ---
        title = term_data.get("title", "")
        if title:
            story.append(Paragraph(title, styles["subtitle"]))
            story.append(Spacer(1, 0.5 * cm))

        # --- Linha separadora ---
        story.append(HRFlowable(width="100%", thickness=2, color=FSPH_BLUE))
        story.append(Spacer(1, 0.5 * cm))

        # --- Metadados do TR (tabela) ---
        story.extend(cls._build_metadata_table(term_data, styles))
        story.append(Spacer(1, 0.8 * cm))

        # --- Seções detectadas ---
        sections = term_data.get("sections") or {}
        if sections:
            story.extend(cls._build_sections(sections, styles))
        elif term_data.get("content"):
            # Se não há seções estruturadas, usa o conteúdo completo
            story.append(Paragraph("1. CONTEÚDO DO TERMO", styles["section_title"]))
            story.append(Paragraph(term_data["content"][:3000], styles["body"]))
        else:
            story.append(Paragraph(
                "Conteúdo do termo não disponível.", styles["body"]
            ))

        # --- Rodapé de assinaturas ---
        story.append(Spacer(1, 1.5 * cm))
        story.extend(cls._build_signature_section(styles))

        # Gera o PDF
        doc.build(story, onFirstPage=cls._add_page_footer, onLaterPages=cls._add_page_footer)

        pdf_bytes = buffer.getvalue()
        buffer.close()

        logger.info(
            "PDF gerado: term_id=%s size=%d bytes",
            term_data.get("id"),
            len(pdf_bytes),
        )
        return pdf_bytes

    # ------------------------------------------------------------------ #
    # Construtores de seções
    # ------------------------------------------------------------------ #

    @staticmethod
    def _build_styles() -> dict:
        """Define os estilos de parágrafo para o documento."""
        base = getSampleStyleSheet()

        return {
            "institution": ParagraphStyle(
                "institution",
                parent=base["Normal"],
                fontSize=9,
                textColor=FSPH_GRAY,
                alignment=1,  # centro
                spaceAfter=2,
            ),
            "institution_name": ParagraphStyle(
                "institution_name",
                parent=base["Normal"],
                fontSize=13,
                textColor=FSPH_BLUE,
                fontName="Helvetica-Bold",
                alignment=1,
                spaceBefore=4,
                spaceAfter=2,
            ),
            "title": ParagraphStyle(
                "title",
                parent=base["Heading1"],
                fontSize=16,
                textColor=FSPH_BLUE,
                fontName="Helvetica-Bold",
                alignment=1,
                spaceBefore=8,
                spaceAfter=4,
            ),
            "subtitle": ParagraphStyle(
                "subtitle",
                parent=base["Normal"],
                fontSize=11,
                textColor=FSPH_GRAY,
                alignment=1,
                spaceAfter=4,
            ),
            "section_title": ParagraphStyle(
                "section_title",
                parent=base["Heading2"],
                fontSize=11,
                textColor=FSPH_BLUE,
                fontName="Helvetica-Bold",
                spaceBefore=12,
                spaceAfter=4,
                borderPad=4,
            ),
            "body": ParagraphStyle(
                "body",
                parent=base["Normal"],
                fontSize=10,
                leading=16,  # espaçamento entre linhas
                spaceAfter=6,
            ),
            "small": ParagraphStyle(
                "small",
                parent=base["Normal"],
                fontSize=8,
                textColor=FSPH_GRAY,
            ),
        }

    @staticmethod
    def _build_header(styles: dict) -> list:
        """Cria o cabeçalho institucional da FSPH."""
        return [
            Paragraph("GOVERNO DO ESTADO DE PERNAMBUCO", styles["institution"]),
            Paragraph(
                "FUNDAÇÃO DE SAÚDE PÚBLICA DE PERNAMBUCO — FSPH",
                styles["institution_name"],
            ),
            Paragraph(
                "Sistema de Gestão de Termos de Referência | Lei 14.133/2021",
                styles["institution"],
            ),
        ]

    @staticmethod
    def _build_metadata_table(term_data: dict, styles: dict) -> list:
        """Cria tabela com metadados do TR (categoria, status, valor, etc.)."""
        category_labels = {
            "capacitacao": "Capacitação",
            "aquisicao": "Aquisição",
            "servico_tecnico": "Serviço Técnico",
            "outro": "Outro",
        }
        status_labels = {
            "rascunho": "Rascunho",
            "em_analise": "Em Análise",
            "validado": "Validado",
            "reprovado": "Reprovado",
        }

        value = term_data.get("estimated_value")
        value_str = f"R$ {Decimal(str(value)):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if value else "Não informado"

        data = [
            ["Campo", "Valor"],
            ["Categoria", category_labels.get(term_data.get("category", ""), "—")],
            ["Status", status_labels.get(term_data.get("status", ""), "—")],
            ["Valor Estimado", value_str],
            ["Data de Criação", term_data.get("created_at", "—")[:10]],
            ["Arquivo Original", term_data.get("original_filename") or "—"],
        ]

        table = Table(data, colWidths=[5 * cm, 12 * cm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), FSPH_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, FSPH_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))

        return [table]

    @classmethod
    def _build_sections(cls, sections: dict, styles: dict) -> list:
        """Gera as seções do TR com títulos e referências legais."""
        section_labels = {
            "objeto": ("1. OBJETO DA CONTRATAÇÃO", "Art. 6º, XXIII, a — Lei 14.133/2021"),
            "justificativa": ("2. JUSTIFICATIVA", "Art. 6º, XXIII, b — Lei 14.133/2021"),
            "valor_estimado": ("3. VALOR ESTIMADO", "Art. 6º, XXIII, c — Lei 14.133/2021"),
            "criterio_julgamento": ("4. CRITÉRIO DE JULGAMENTO", "Art. 6º, XXIII, d — Lei 14.133/2021"),
            "prazo_execucao": ("5. PRAZO DE EXECUÇÃO", "Art. 6º, XXIII, e — Lei 14.133/2021"),
            "local_entrega": ("6. LOCAL DE ENTREGA", "Art. 6º, XXIII, f — Lei 14.133/2021"),
            "modalidade_licitacao": ("7. MODALIDADE DE LICITAÇÃO", "Art. 6º, XXIII, g — Lei 14.133/2021"),
            "sustentabilidade": ("8. CRITÉRIOS DE SUSTENTABILIDADE", "Art. 6º, XXX — Lei 14.133/2021"),
            "garantia": ("9. GARANTIA CONTRATUAL", "Art. 97 — Lei 14.133/2021"),
            "obrigacoes": ("10. OBRIGAÇÕES DAS PARTES", "Art. 6º, XXIII, h — Lei 14.133/2021"),
        }

        elements = []
        for key, content in sections.items():
            if not content:
                continue
            label, artigo = section_labels.get(key, (key.upper(), "Lei 14.133/2021"))
            elements.append(Paragraph(label, styles["section_title"]))
            elements.append(Paragraph(
                f'<font color="#666666" size="8"><i>{artigo}</i></font>',
                styles["small"],
            ))
            elements.append(Spacer(1, 0.2 * cm))
            # Troca quebras de linha por <br/> para Paragraph
            content_html = str(content).replace("\n", "<br/>")
            elements.append(Paragraph(content_html, styles["body"]))
            elements.append(Spacer(1, 0.3 * cm))

        return elements

    @staticmethod
    def _build_signature_section(styles: dict) -> list:
        """Cria área de assinaturas ao final do documento."""
        elements = [
            HRFlowable(width="100%", thickness=1, color=FSPH_BORDER),
            Spacer(1, 0.5 * cm),
        ]

        sig_data = [
            ["_" * 40, "_" * 40],
            ["Responsável pela elaboração", "Autoridade competente"],
            ["Cargo / Matrícula", "Cargo / Matrícula"],
            [f"Data: ___/___/______", f"Data: ___/___/______"],
        ]

        sig_table = Table(sig_data, colWidths=[9 * cm, 9 * cm])
        sig_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (1, 1), (-1, -1), FSPH_GRAY),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))

        elements.append(sig_table)
        return elements

    @staticmethod
    def _add_page_footer(canvas, doc):
        """Adiciona rodapé com número de página em todas as páginas."""
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(FSPH_GRAY)

        # Rodapé com data e número de página
        date_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        canvas.drawString(
            2 * cm,
            1.2 * cm,
            f"FSPH — Sistema de Análise de Termos de Referência | Gerado em {date_str}",
        )
        canvas.drawRightString(
            A4[0] - 2 * cm,
            1.2 * cm,
            f"Página {doc.page}",
        )
        canvas.restoreState()
