"""
pdf_generator.py — Geração de PDF formatado com ReportLab

Gera o Termo de Referência no padrão documental de governo:
  - Cabeçalho institucional (Governo de Sergipe / FSPH)
  - Título e quadro-resumo de identificação
  - Corpo renderizado a partir de Markdown (títulos, negrito, itálico,
    listas e tabelas) com texto justificado
  - Referências legais por seção (Lei 14.133/2021)
  - Local/data, bloco de assinaturas e rodapé com paginação

O conteúdo gerado pela IA vem em Markdown; este módulo converte esse
Markdown em elementos ReportLab (em vez de despejar o texto cru), o que
produz um documento com aparência de TR oficial.
"""

import io
import re
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.utils.logging import get_logger

logger = get_logger(__name__)

# ------------------------------------------------------------------ #
# Cores institucionais
# ------------------------------------------------------------------ #
FSPH_BLUE = colors.HexColor("#003366")        # azul escuro institucional
FSPH_LIGHT_BLUE = colors.HexColor("#0066CC")  # azul claro para destaques
FSPH_GRAY = colors.HexColor("#555555")        # cinza para textos secundários
FSPH_BORDER = colors.HexColor("#BBBBBB")      # cinza para bordas
FSPH_ROW = colors.HexColor("#EEF2F7")         # fundo alternado de tabela

_MONTHS_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

# Palavras-chave -> referência legal (para anotar cada seção do TR)
_SECTION_ARTICLES = [
    (("objeto",), 'Art. 6º, XXIII, “a” — Lei nº 14.133/2021'),
    (("justificativa", "necessidade"), 'Art. 6º, XXIII, “b” — Lei nº 14.133/2021'),
    (("pesquisa de preço", "valor estimado", "estimativa"), 'Art. 6º, XXIII, “c” — Lei nº 14.133/2021'),
    (("julgamento",), 'Art. 6º, XXIII, “d” — Lei nº 14.133/2021'),
    (("prazo",), 'Art. 6º, XXIII, “e” — Lei nº 14.133/2021'),
    (("local",), 'Art. 6º, XXIII, “f” — Lei nº 14.133/2021'),
    (("modalidade", "licitação", "dispensa"), 'Art. 6º, XXIII, “g” — Lei nº 14.133/2021'),
    (("sustentab",), "Art. 6º, XXX — Lei nº 14.133/2021"),
    (("garantia",), "Arts. 96 a 102 — Lei nº 14.133/2021"),
    (("obrigaç",), "Art. 92 — Lei nº 14.133/2021"),
]


def _article_for(heading: str) -> str | None:
    low = heading.lower()
    for keys, ref in _SECTION_ARTICLES:
        if any(k in low for k in keys):
            return ref
    return None


# Frases de abertura conversacional que a IA coloca antes do TR
_INTRO_RE = re.compile(
    r"\b(com base|aqui est[áa]|segue\b|abaixo\b|a seguir|exemplo de (um )?termo"
    r"|vou (gerar|elaborar|estruturar|criar|montar)|elaborei|preparei|montei"
    r"|claro[,!]|perfeito[,!]|conforme solicitad|com prazer|certo[,!])\b",
    re.I,
)
# Frases de fechamento conversacional que a IA coloca depois do TR
_CLOSER_RE = re.compile(
    r"\b(este[\sé]+o termo|espero que|caso (precise|tenha|queira)"
    r"|fico [àa] disposi|qualquer d[úu]vida|se precisar|posso (detalhar|ajustar|ajudar|revisar)"
    r"|observa[çc][ãa]o final|precisa de (mais )?ajust|deseja (que eu )?)",
    re.I,
)


def _is_tr_anchor(s: str) -> bool:
    """Identifica a linha onde o TR de fato começa (título/seção)."""
    return bool(
        re.match(r"^#{1,6}\s+\S", s)
        or re.match(r"^\d{1,2}[.)]\s+\S", s)
        or re.match(r"^[a-gA-G][.)]\s+\S", s)
        or re.match(r"^\*\*[^*]+\*\*", s)
        or re.match(r"^termo de refer[êe]ncia.{0,40}$", s, re.I)
    )


def clean_tr_content(md: str) -> str:
    """
    Limpa o conteúdo do TR vindo da IA:
      1. remove cercas de código (``` / ```markdown);
      2. remove o preâmbulo conversacional antes do TR
         ("Com base no contexto..., aqui está um exemplo de TR...");
      3. remove o fecho conversacional depois do TR
         ("Este é o Termo de Referência completo...", "Espero que ajude...").
    """
    if not md or not md.strip():
        return md or ""

    # 1. remove cercas de código
    lines = [ln for ln in md.split("\n") if not re.match(r"^\s*```", ln)]

    # 2. remove preâmbulo: corta tudo antes do 1º "âncora" do TR,
    #    mas apenas se o que vem antes parecer texto de conversa.
    anchor = None
    for idx, ln in enumerate(lines):
        if ln.strip() and _is_tr_anchor(ln.strip()):
            anchor = idx
            break
    if anchor and anchor > 0:
        preceding = [ln for ln in lines[:anchor] if ln.strip()]
        preceding_text = " ".join(preceding)
        has_heading_before = any(re.match(r"^\s*#", ln) for ln in lines[:anchor])
        if preceding and not has_heading_before and _INTRO_RE.search(preceding_text):
            lines = lines[anchor:]

    # 3. remove fecho conversacional (último bloco, se for de conversa)
    text = "\n".join(lines).strip()
    blocks = re.split(r"\n\s*\n", text)
    while len(blocks) > 1 and _CLOSER_RE.search(blocks[-1]) and "|" not in blocks[-1]:
        blocks.pop()
    return "\n\n".join(blocks).strip()


def format_brl(value) -> str:
    """Formata um valor como moeda brasileira (R$ 1.234,56)."""
    from decimal import Decimal, InvalidOperation
    try:
        v = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return ""
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def sync_estimated_value(content: str, value) -> str:
    """Sincroniza o valor estimado do metadado no texto do TR: substitui a
    primeira ocorrência de 'R$ ...' pelo valor informado. Se o metadado não
    tiver valor, o texto é mantido como está."""
    if value is None or not content:
        return content
    formatted = format_brl(value)
    if not formatted:
        return content
    new, n = re.subn(r"R\$\s*[\d][\d.,]*", formatted, content, count=1)
    return new if n else content


class PDFGeneratorService:

    # ------------------------------------------------------------------ #
    # Entrada principal
    # ------------------------------------------------------------------ #
    @classmethod
    def generate_term_pdf(cls, term_data: dict) -> bytes:
        """Gera o PDF de um Termo de Referência a partir de term_data."""
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2.5 * cm,
            leftMargin=3 * cm,       # margem esquerda maior (padrão ofício)
            topMargin=2.2 * cm,
            bottomMargin=2.2 * cm,
            title=f"Termo de Referência — {term_data.get('title', '')}".strip(" —"),
            author="FSPH — Fundação de Saúde Parreiras Horta",
        )

        styles = cls._build_styles()
        story: list = []

        # --- Cabeçalho institucional ---
        story.extend(cls._build_header(styles))
        story.append(Spacer(1, 0.25 * cm))
        story.append(HRFlowable(width="100%", thickness=1.2, color=colors.black))
        story.append(Spacer(1, 0.5 * cm))

        # --- Título do documento ---
        story.append(Paragraph("TERMO DE REFERÊNCIA", styles["doc_title"]))
        objeto = (term_data.get("title") or "").strip()
        if objeto:
            story.append(Spacer(1, 0.1 * cm))
            story.append(Paragraph(objeto, styles["doc_subtitle"]))
        story.append(Spacer(1, 0.55 * cm))

        # --- Corpo: seções estruturadas OU conteúdo em markdown ---
        sections = term_data.get("sections") or {}
        if sections:
            story.extend(cls._build_sections(sections, styles))
        else:
            content = (term_data.get("content") or "").strip()
            content = sync_estimated_value(content, term_data.get("estimated_value"))
            if content:
                story.extend(cls._render_markdown(content, styles))
            else:
                story.append(Paragraph(
                    "Conteúdo do termo não disponível.", styles["body"]
                ))

        # --- Local e data ---
        story.append(Spacer(1, 1.0 * cm))
        story.append(Paragraph(cls._local_e_data(), styles["place_date"]))

        # --- Assinaturas ---
        story.append(Spacer(1, 1.2 * cm))
        story.append(cls._build_signature_section(styles, term_data))

        doc.build(
            story,
            onFirstPage=cls._add_page_footer,
            onLaterPages=cls._add_page_footer,
        )

        pdf_bytes = buffer.getvalue()
        buffer.close()
        logger.info(
            "PDF gerado: term_id=%s size=%d bytes",
            term_data.get("id"), len(pdf_bytes),
        )
        return pdf_bytes

    # ------------------------------------------------------------------ #
    # Estilos
    # ------------------------------------------------------------------ #
    @staticmethod
    def _build_styles() -> dict:
        base = getSampleStyleSheet()
        # Fonte única em todo o documento (família Helvetica).
        body_font = "Helvetica"
        bold_font = "Helvetica-Bold"
        return {
            "institution": ParagraphStyle(
                "institution", parent=base["Normal"], fontName="Helvetica",
                fontSize=9, textColor=colors.black, alignment=TA_CENTER, spaceAfter=1,
            ),
            "institution_name": ParagraphStyle(
                "institution_name", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=12.5, textColor=colors.black, alignment=TA_CENTER,
                spaceBefore=3, spaceAfter=1,
            ),
            "doc_title": ParagraphStyle(
                "doc_title", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=15, textColor=colors.black, alignment=TA_CENTER,
                spaceBefore=2, spaceAfter=2, leading=18,
            ),
            "doc_subtitle": ParagraphStyle(
                "doc_subtitle", parent=base["Normal"], fontName=body_font,
                fontSize=11, textColor=colors.black, alignment=TA_CENTER,
                leading=15, spaceBefore=2,
            ),
            # Corpo justificado (padrão documental)
            "body": ParagraphStyle(
                "body", parent=base["Normal"], fontName=body_font,
                fontSize=11, leading=16, alignment=TA_JUSTIFY, spaceAfter=6,
            ),
            "h1": ParagraphStyle(
                "h1", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=12.5, textColor=colors.black, spaceBefore=14, spaceAfter=3,
                leading=15,
            ),
            "h2": ParagraphStyle(
                "h2", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=11.5, textColor=colors.black, spaceBefore=12, spaceAfter=3,
                leading=14,
            ),
            "h3": ParagraphStyle(
                "h3", parent=base["Normal"], fontName=bold_font,
                fontSize=11, textColor=colors.black, spaceBefore=8, spaceAfter=2,
                leading=14,
            ),
            "legal": ParagraphStyle(
                "legal", parent=base["Normal"], fontName="Helvetica-Oblique",
                fontSize=8, textColor=colors.black, spaceAfter=4,
            ),
            "bullet": ParagraphStyle(
                "bullet", parent=base["Normal"], fontName=body_font,
                fontSize=11, leading=15, alignment=TA_JUSTIFY,
                leftIndent=0.8 * cm, bulletIndent=0.3 * cm, spaceAfter=3,
            ),
            "listitem": ParagraphStyle(
                "listitem", parent=base["Normal"], fontName=body_font,
                fontSize=11, leading=15, alignment=TA_JUSTIFY,
                leftIndent=0.8 * cm, spaceAfter=3,
            ),
            "cell": ParagraphStyle(
                "cell", parent=base["Normal"], fontName=body_font,
                fontSize=9.5, leading=12,
            ),
            "cell_head": ParagraphStyle(
                "cell_head", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=9.5, leading=12, textColor=colors.black,
            ),
            "id_key": ParagraphStyle(
                "id_key", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=9.5, leading=12, textColor=FSPH_BLUE,
            ),
            "id_val": ParagraphStyle(
                "id_val", parent=base["Normal"], fontName=body_font,
                fontSize=9.5, leading=12,
            ),
            "place_date": ParagraphStyle(
                "place_date", parent=base["Normal"], fontName=body_font,
                fontSize=11, alignment=TA_RIGHT,
            ),
            "sign": ParagraphStyle(
                "sign", parent=base["Normal"], fontName=body_font,
                fontSize=10, alignment=TA_CENTER, leading=13,
            ),
            "sign_hdr": ParagraphStyle(
                "sign_hdr", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=9, alignment=TA_CENTER, leading=12, textColor=FSPH_BLUE,
                spaceAfter=2,
            ),
            "sign_name": ParagraphStyle(
                "sign_name", parent=base["Normal"], fontName="Helvetica-Bold",
                fontSize=10, alignment=TA_CENTER, leading=13, spaceBefore=4, spaceAfter=1,
            ),
            "sign_role": ParagraphStyle(
                "sign_role", parent=base["Normal"], fontName=body_font,
                fontSize=9, alignment=TA_CENTER, leading=12, spaceAfter=2,
            ),
            "sign_sei": ParagraphStyle(
                "sign_sei", parent=base["Normal"], fontName="Helvetica-Oblique",
                fontSize=8.5, alignment=TA_CENTER, leading=11, textColor=FSPH_GRAY,
            ),
            "sign_note": ParagraphStyle(
                "sign_note", parent=base["Normal"], fontName="Helvetica-Oblique",
                fontSize=8.5, alignment=TA_CENTER, leading=11, textColor=FSPH_GRAY,
                spaceAfter=8,
            ),
        }

    # ------------------------------------------------------------------ #
    # Cabeçalho institucional
    # ------------------------------------------------------------------ #
    @staticmethod
    def _build_header(styles: dict) -> list:
        return [
            Paragraph("GOVERNO DO ESTADO DE SERGIPE", styles["institution"]),
            Paragraph("FUNDAÇÃO DE SAÚDE PARREIRAS HORTA — FSPH", styles["institution_name"]),
            Paragraph("Comissão de Licitação | Lei nº 14.133/2021", styles["institution"]),
        ]

    # ------------------------------------------------------------------ #
    # Seções estruturadas (TRs com `sections` extraídas)
    # ------------------------------------------------------------------ #
    @classmethod
    def _build_sections(cls, sections: dict, styles: dict) -> list:
        section_labels = {
            "objeto": ("1. OBJETO DA CONTRATAÇÃO", 'Art. 6º, XXIII, “a” — Lei nº 14.133/2021'),
            "justificativa": ("2. JUSTIFICATIVA", 'Art. 6º, XXIII, “b” — Lei nº 14.133/2021'),
            "valor_estimado": ("3. VALOR ESTIMADO", 'Art. 6º, XXIII, “c” — Lei nº 14.133/2021'),
            "criterio_julgamento": ("4. CRITÉRIO DE JULGAMENTO", 'Art. 6º, XXIII, “d” — Lei nº 14.133/2021'),
            "prazo_execucao": ("5. PRAZO DE EXECUÇÃO", 'Art. 6º, XXIII, “e” — Lei nº 14.133/2021'),
            "local_entrega": ("6. LOCAL DE ENTREGA", 'Art. 6º, XXIII, “f” — Lei nº 14.133/2021'),
            "modalidade_licitacao": ("7. MODALIDADE DE LICITAÇÃO", 'Art. 6º, XXIII, “g” — Lei nº 14.133/2021'),
            "sustentabilidade": ("8. CRITÉRIOS DE SUSTENTABILIDADE", "Art. 6º, XXX — Lei nº 14.133/2021"),
            "garantia": ("9. GARANTIA CONTRATUAL", "Arts. 96 a 102 — Lei nº 14.133/2021"),
            "obrigacoes": ("10. OBRIGAÇÕES DAS PARTES", "Art. 92 — Lei nº 14.133/2021"),
        }
        elements: list = []
        for key, content in sections.items():
            if not content:
                continue
            label, artigo = section_labels.get(key, (key.upper(), "Lei nº 14.133/2021"))
            elements.append(Paragraph(label, styles["h1"]))
            elements.append(Paragraph(artigo, styles["legal"]))
            elements.extend(cls._render_markdown(str(content), styles))
            elements.append(Spacer(1, 0.2 * cm))
        return elements

    # ------------------------------------------------------------------ #
    # Renderizador de Markdown -> flowables ReportLab
    # ------------------------------------------------------------------ #
    @classmethod
    def _render_markdown(cls, md: str, styles: dict) -> list:
        lines = clean_tr_content(md).split("\n")
        elements: list = []
        para_buf: list[str] = []
        i = 0

        def flush_para():
            if para_buf:
                text = " ".join(s.strip() for s in para_buf).strip()
                if text:
                    elements.append(Paragraph(cls._inline(text), styles["body"]))
                para_buf.clear()

        while i < len(lines):
            raw = lines[i]
            line = raw.rstrip()
            stripped = line.strip()

            # Linha em branco -> fecha parágrafo
            if not stripped:
                flush_para()
                i += 1
                continue

            # Regra horizontal
            if re.fullmatch(r"(\*\s*){3,}|(-\s*){3,}|(_\s*){3,}", stripped):
                flush_para()
                elements.append(Spacer(1, 0.15 * cm))
                elements.append(HRFlowable(width="100%", thickness=0.6, color=FSPH_BORDER))
                elements.append(Spacer(1, 0.15 * cm))
                i += 1
                continue

            # Título (#, ##, ###, ...)
            m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
            if m:
                flush_para()
                level = len(m.group(1))
                htext = m.group(2).strip().strip("*").strip()
                # Pula um H1 redundante que apenas repete "Termo de Referência"
                if level == 1 and re.search(r"termo de refer", htext, re.I) and len(htext) < 40:
                    i += 1
                    continue
                style = styles["h1"] if level <= 1 else styles["h2"] if level == 2 else styles["h3"]
                if level <= 2:
                    htext_disp = htext.upper()
                else:
                    htext_disp = htext
                elements.append(Paragraph(cls._inline(htext_disp), style))
                ref = _article_for(htext)
                if ref and level <= 3:
                    elements.append(Paragraph(ref, styles["legal"]))
                i += 1
                continue

            # Tabela markdown (bloco de linhas com '|')
            if "|" in stripped and stripped.count("|") >= 1:
                block = []
                while i < len(lines) and "|" in lines[i] and lines[i].strip():
                    block.append(lines[i])
                    i += 1
                tbl = cls._build_md_table(block, styles)
                if tbl is not None:
                    flush_para()
                    elements.append(Spacer(1, 0.1 * cm))
                    elements.append(tbl)
                    elements.append(Spacer(1, 0.2 * cm))
                    continue
                # não era tabela válida -> trata como parágrafo
                para_buf.extend(block)
                continue

            # Lista com marcador (-, *, +)
            mb = re.match(r"^[-*+]\s+(.*)$", stripped)
            if mb:
                flush_para()
                elements.append(Paragraph(
                    cls._inline(mb.group(1)), styles["bullet"], bulletText="•"
                ))
                i += 1
                continue

            # Lista numerada (1. / 1) / a) / a.)
            mn = re.match(r"^(\d{1,2}[.)]|[a-zA-Z][.)])\s+(.*)$", stripped)
            if mn:
                flush_para()
                marker = mn.group(1).replace(")", ".")
                elements.append(Paragraph(
                    f"<b>{marker}</b> {cls._inline(mn.group(2))}", styles["listitem"]
                ))
                i += 1
                continue

            # Parágrafo comum (acumula)
            para_buf.append(stripped)
            i += 1

        flush_para()
        return elements

    # ------------------------------------------------------------------ #
    # Tabela markdown -> ReportLab Table
    # ------------------------------------------------------------------ #
    @classmethod
    def _build_md_table(cls, block: list[str], styles: dict):
        def split_row(s: str) -> list[str]:
            s = s.strip()
            if s.startswith("|"):
                s = s[1:]
            if s.endswith("|"):
                s = s[:-1]
            return [c.strip() for c in s.split("|")]

        rows = [split_row(b) for b in block if b.strip()]
        # remove linha separadora (|---|---|)
        rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c or "-") for c in r)]
        if len(rows) < 1:
            return None
        ncols = max(len(r) for r in rows)
        rows = [r + [""] * (ncols - len(r)) for r in rows]

        header, *body = rows
        data = [[Paragraph(cls._inline(c), styles["cell_head"]) for c in header]]
        for r in body:
            data.append([Paragraph(cls._inline(c), styles["cell"]) for c in r])

        avail = 15.5 * cm
        col_w = [avail / ncols] * ncols
        table = Table(data, colWidths=col_w, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), FSPH_ROW),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FSPH_ROW]),
            ("GRID", (0, 0), (-1, -1), 0.5, FSPH_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return table

    # ------------------------------------------------------------------ #
    # Helpers de texto
    # ------------------------------------------------------------------ #
    @staticmethod
    def _strip_fences(md: str) -> str:
        """Remove cercas de código ``` / ```markdown que a IA às vezes adiciona."""
        out = []
        for ln in md.split("\n"):
            if re.match(r"^\s*```", ln):
                continue
            out.append(ln)
        return "\n".join(out)

    @staticmethod
    def _inline(text: str) -> str:
        """Converte marcação inline de markdown em mini-HTML do ReportLab."""
        s = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        # negrito **x** / __x__
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"__(.+?)__", r"<b>\1</b>", s)
        # itálico *x* / _x_
        s = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<i>\1</i>", s)
        s = re.sub(r"(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])", r"<i>\1</i>", s)
        # código `x` — mantém a fonte única do documento (sem trocar para mono)
        s = re.sub(r"`(.+?)`", r"\1", s)
        # links [t](u) -> t (u)
        s = re.sub(r"\[(.+?)\]\((.+?)\)", r"\1 (\2)", s)
        return s

    @staticmethod
    def _format_brl(value) -> str:
        try:
            v = Decimal(str(value))
        except Exception:
            return "—"
        s = f"R$ {v:,.2f}"
        return s.replace(",", "X").replace(".", ",").replace("X", ".")

    @classmethod
    def _local_e_data(cls) -> str:
        now = datetime.now()
        return f"Aracaju/SE, {now.day} de {_MONTHS_PT[now.month - 1]} de {now.year}."

    # ------------------------------------------------------------------ #
    # Assinaturas
    # ------------------------------------------------------------------ #
    @classmethod
    def _build_signature_section(cls, styles: dict, term_data: dict | None = None):
        term_data = term_data or {}

        elab_nome = (term_data.get("elaborador_nome") or "").strip() or "Responsável Técnico"
        elab_mat  = (term_data.get("elaborador_matricula") or "").strip()
        elab_setor = (term_data.get("elaborador_setor") or "").strip() or "Unidade Demandante"
        elab_sub = f"Mat. {elab_mat} — {elab_setor}" if elab_mat else elab_setor

        diger_nome = (term_data.get("autoridade_nome") or "").strip() or "Diretor(a) Geral"
        diger_cargo = (term_data.get("autoridade_cargo") or "").strip() or "Diretoria Geral"

        SEI = "(Assinatura Eletrônica via SEI)"
        half = 7.75 * cm

        def block(label: str, name: str, role: str) -> list:
            return [
                Paragraph(label, styles["sign_hdr"]),
                Paragraph(f"<b>{cls._inline(name)}</b>", styles["sign_name"]),
                Paragraph(cls._inline(role), styles["sign_role"]),
                Paragraph(SEI, styles["sign_sei"]),
            ]

        note = Paragraph(
            "Este documento será inserido no SEI para coleta das assinaturas digitais qualificadas.",
            styles["sign_note"],
        )

        sig_data = [
            [
                block("ELABORAÇÃO TÉCNICA:", elab_nome, elab_sub),
                block("VALIDAÇÃO TÉCNICA (DIROP):", "Diretor(a) Operacional", "Diretoria Operacional"),
            ],
            [
                block("VALIDAÇÃO DE VIABILIDADE (DIRAF):", "Diretor(a) Adm. e Financeiro", "Diretoria Administrativa e Financeira"),
                block("AUTORIZAÇÃO (DIGER):", diger_nome, diger_cargo),
            ],
        ]

        sig_table = Table(sig_data, colWidths=[half, half])
        sig_table.setStyle(TableStyle([
            ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",   (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 14),
            ("LEFTPADDING",  (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            # linha fina entre as duas linhas de assinaturas
            ("LINEBELOW",    (0, 0), (-1, 0), 0.4, FSPH_BORDER),
        ]))
        return KeepTogether([note, sig_table])

    # ------------------------------------------------------------------ #
    # Rodapé
    # ------------------------------------------------------------------ #
    @staticmethod
    def _add_page_footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(FSPH_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(3 * cm, 1.6 * cm, A4[0] - 2.5 * cm, 1.6 * cm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(FSPH_GRAY)
        date_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        canvas.drawString(
            3 * cm, 1.1 * cm,
            f"FSPH — Fundação de Saúde Parreiras Horta · Gerado em {date_str}",
        )
        canvas.drawRightString(A4[0] - 2.5 * cm, 1.1 * cm, f"Página {doc.page}")
        canvas.restoreState()
