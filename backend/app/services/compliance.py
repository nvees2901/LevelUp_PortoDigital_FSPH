"""
compliance.py — Motor de Análise de Conformidade com a Lei 14.133/2021

Este é o coração do sistema: avalia um Termo de Referência contra
os 10 critérios obrigatórios da Lei 14.133/2021 e produz um score
ponderado com sugestões de melhoria.

Regras de negócio (CONTEXT.md seção 9):
  - Score < 50  → status "reprovado"
  - Score 50-79 → status "alerta"
  - Score >= 80 → status "aprovado"

Por que pesos diferentes por critério?
  Nem todos os critérios têm o mesmo impacto jurídico.
  Objeto e justificativa são os mais críticos (Art. 6º, XXIII, a e b)
  e recebem peso maior. Artigos complementares têm peso menor.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class CriterionConfig:
    """Configuração de um critério de avaliação."""
    name: str           # nome interno (snake_case)
    artigo: str         # artigo da Lei 14.133
    descricao: str      # descrição do que é avaliado
    peso: int           # peso no score final (soma = 100)
    keywords: list[str] # palavras-chave que indicam conformidade


# ------------------------------------------------------------------ #
# Definição dos 10 critérios da Lei 14.133/2021
# ------------------------------------------------------------------ #

CRITERIA: list[CriterionConfig] = [
    CriterionConfig(
        name="objeto_descricao",
        artigo="Art. 6º, XXIII, a",
        descricao="Descrição clara e precisa do objeto da contratação",
        peso=15,
        keywords=[
            "objeto", "contratação de", "aquisição de", "serviço de",
            "fornecimento de", "especificação", "descrição", "objeto da licitação",
        ],
    ),
    CriterionConfig(
        name="justificativa",
        artigo="Art. 6º, XXIII, b",
        descricao="Justificativa da necessidade da contratação",
        peso=15,
        keywords=[
            "justificativa", "necessidade", "motivação", "justificação",
            "razão", "fundamentação", "demanda", "motivar",
        ],
    ),
    CriterionConfig(
        name="valor_estimado",
        artigo="Art. 6º, XXIII, c",
        descricao="Valor estimado da contratação com pesquisa de preços",
        peso=10,
        keywords=[
            "valor estimado", "valor total", "preço", "r$", "orçamento",
            "pesquisa de preços", "pesquisa de mercado",
        ],
    ),
    CriterionConfig(
        name="criterio_julgamento",
        artigo="Art. 6º, XXIII, d",
        descricao="Critério de julgamento das propostas",
        peso=10,
        keywords=[
            "critério de julgamento", "menor preço", "melhor técnica",
            "técnica e preço", "maior desconto", "menor lance",
        ],
    ),
    CriterionConfig(
        name="prazo_execucao",
        artigo="Art. 6º, XXIII, e",
        descricao="Prazo de execução ou entrega do objeto",
        peso=10,
        keywords=[
            "prazo", "prazo de execução", "prazo de entrega", "vigência",
            "dias úteis", "dias corridos", "meses", "cronograma",
        ],
    ),
    CriterionConfig(
        name="local_entrega",
        artigo="Art. 6º, XXIII, f",
        descricao="Local de entrega ou execução do objeto",
        peso=10,
        keywords=[
            "local", "endereço", "sede", "local de entrega",
            "local de execução", "instalações", "unidade",
        ],
    ),
    CriterionConfig(
        name="modalidade_licitacao",
        artigo="Art. 6º, XXIII, g",
        descricao="Modalidade de licitação ou justificativa de dispensa/inexigibilidade",
        peso=10,
        keywords=[
            "modalidade", "pregão", "concorrência", "dispensa", "inexigibilidade",
            "licitação", "pregão eletrônico", "concorrência pública",
        ],
    ),
    CriterionConfig(
        name="sustentabilidade",
        artigo="Art. 6º, XXX",
        descricao="Critérios de sustentabilidade ambiental",
        peso=10,
        keywords=[
            "sustentabilidade", "ambiental", "sustentável", "meio ambiente",
            "critério ambiental", "eco", "verde", "baixo impacto",
        ],
    ),
    CriterionConfig(
        name="garantia",
        artigo="Art. 97",
        descricao="Garantia contratual exigida do contratado",
        peso=5,
        keywords=[
            "garantia", "garantia contratual", "caução", "seguro garantia",
            "fiança bancária", "percentual de garantia",
        ],
    ),
    CriterionConfig(
        name="obrigacoes_partes",
        artigo="Art. 6º, XXIII, h",
        descricao="Obrigações da contratante e da contratada",
        peso=5,
        keywords=[
            "obrigações", "responsabilidades", "deveres", "encargos",
            "obrigações da contratante", "obrigações da contratada",
        ],
    ),
]


class ComplianceService:

    @classmethod
    def analyze(cls, text: str, sections: dict) -> dict:
        """
        Executa a análise completa de conformidade.

        Args:
            text:     Texto completo do documento
            sections: Seções detectadas pelo NLPService

        Returns:
            Dict com:
              - compliance_score: float (0-100)
              - status: str (aprovado|alerta|reprovado)
              - criteria_results: list de resultados por critério
              - suggestions: list de sugestões priorizadas
              - legal_references: list de artigos referenciados
        """
        import unicodedata
        normalized_text = cls._normalize(text)

        criteria_results = []
        total_weighted_score = 0.0
        suggestions = []
        legal_references = set()

        for criterion in CRITERIA:
            # Avalia o critério
            score, found_keywords = cls._evaluate_criterion(
                normalized_text, sections, criterion
            )

            # Determina status do critério
            if score >= 8:
                status = "aprovado"
            elif score >= 5:
                status = "alerta"
            else:
                status = "reprovado"

            # Gera sugestão se necessário
            sugestao = None
            if status in ("alerta", "reprovado"):
                sugestao = cls._generate_suggestion(criterion, score, found_keywords)
                suggestions.append({
                    "prioridade": len(suggestions) + 1,
                    "criterio": criterion.name,
                    "artigo": criterion.artigo,
                    "descricao": sugestao,
                })

            # Acumula score ponderado
            total_weighted_score += (score / 10) * criterion.peso
            legal_references.add(criterion.artigo)

            criteria_results.append({
                "criterio": criterion.name,
                "artigo": criterion.artigo,
                "descricao": criterion.descricao,
                "status": status,
                "score": score,
                "sugestao": sugestao,
                "keywords_encontradas": found_keywords,
            })

        # Score final (0-100)
        compliance_score = round(total_weighted_score, 2)

        # Status geral
        from app.models.analysis import Analysis
        overall_status = Analysis.calculate_status(compliance_score)

        logger.info(
            "Análise concluída: score=%.2f status=%s critérios_aprovados=%d/%d",
            compliance_score,
            overall_status,
            sum(1 for r in criteria_results if r["status"] == "aprovado"),
            len(CRITERIA),
        )

        # Ordena sugestões por impacto (critérios mais pesados primeiro)
        suggestions.sort(
            key=lambda s: next(
                (c.peso for c in CRITERIA if c.name == s["criterio"]), 0
            ),
            reverse=True,
        )
        for i, s in enumerate(suggestions, start=1):
            s["prioridade"] = i

        return {
            "compliance_score": Decimal(str(compliance_score)),
            "status": overall_status,
            "criteria_results": criteria_results,
            "suggestions": suggestions,
            "legal_references": sorted(legal_references),
        }

    # ------------------------------------------------------------------ #
    # Avaliação por critério
    # ------------------------------------------------------------------ #

    @classmethod
    def _evaluate_criterion(
        cls,
        normalized_text: str,
        sections: dict,
        criterion: CriterionConfig,
    ) -> tuple[int, list[str]]:
        """
        Avalia um único critério e retorna (score 0-10, keywords encontradas).

        Lógica de pontuação:
          - Cada keyword encontrada no texto vale pontos
          - Se a seção correspondente foi detectada pelo NLP → bônus
          - Score máximo é 10
        """
        found_keywords = []
        normalized_keywords = [cls._normalize(kw) for kw in criterion.keywords]

        for kw, orig_kw in zip(normalized_keywords, criterion.keywords):
            if kw in normalized_text:
                found_keywords.append(orig_kw)

        # Score base: proporção de keywords encontradas
        keyword_ratio = len(found_keywords) / max(len(criterion.keywords), 1)
        base_score = keyword_ratio * 8  # máximo de 8 via keywords

        # Bônus se a seção foi detectada explicitamente pelo NLP
        section_bonus = 2 if criterion.name in sections else 0

        score = min(10, round(base_score + section_bonus))
        return score, found_keywords

    @staticmethod
    def _generate_suggestion(
        criterion: CriterionConfig,
        score: int,
        found_keywords: list[str],
    ) -> str:
        """Gera uma sugestão específica baseada no critério e score."""
        severity = "reprovado" if score < 5 else "alerta"

        suggestions_map = {
            "objeto_descricao": (
                "Inclua uma descrição detalhada e precisa do objeto da contratação, "
                "especificando características técnicas, quantidades e unidades de medida. "
                f"Referência: {criterion.artigo}."
            ),
            "justificativa": (
                "Adicione uma justificativa clara que demonstre a necessidade da contratação, "
                "incluindo dados que comprovem a demanda e os benefícios esperados. "
                f"Referência: {criterion.artigo}."
            ),
            "valor_estimado": (
                "Inclua o valor estimado da contratação com base em pesquisa de mercado "
                "documentada (mínimo 3 fornecedores ou fonte oficial de preços). "
                f"Referência: {criterion.artigo}."
            ),
            "criterio_julgamento": (
                "Especifique o critério de julgamento das propostas (menor preço, "
                "melhor técnica, técnica e preço ou maior desconto). "
                f"Referência: {criterion.artigo}."
            ),
            "prazo_execucao": (
                "Defina o prazo de execução/entrega claramente (em dias úteis ou corridos), "
                "incluindo cronograma de entregáveis se aplicável. "
                f"Referência: {criterion.artigo}."
            ),
            "local_entrega": (
                "Especifique o endereço ou local exato de entrega/execução do objeto, "
                "incluindo CEP, referências e responsável pelo recebimento. "
                f"Referência: {criterion.artigo}."
            ),
            "modalidade_licitacao": (
                "Indique a modalidade de licitação ou, em caso de dispensa/inexigibilidade, "
                "inclua a justificativa legal conforme Lei 14.133/2021. "
                f"Referência: {criterion.artigo}."
            ),
            "sustentabilidade": (
                "Inclua critérios de sustentabilidade ambiental aplicáveis ao objeto, "
                "como certificações, descarte adequado ou consumo de energia. "
                f"Referência: {criterion.artigo}."
            ),
            "garantia": (
                "Defina se haverá exigência de garantia contratual e qual a modalidade "
                "(caução, seguro-garantia ou fiança bancária) e o percentual aplicável. "
                f"Referência: {criterion.artigo}."
            ),
            "obrigacoes_partes": (
                "Inclua seção específica com as obrigações da contratante e da contratada, "
                "detalhando responsabilidades, prazos e penalidades aplicáveis. "
                f"Referência: {criterion.artigo}."
            ),
        }

        return suggestions_map.get(
            criterion.name,
            f"Revisar o critério '{criterion.descricao}' conforme {criterion.artigo}."
        )

    @staticmethod
    def _normalize(text: str) -> str:
        nfkd = unicodedata.normalize("NFKD", text)
        return "".join(c for c in nfkd if not unicodedata.combining(c)).casefold()


import unicodedata  # noqa: E402 — necessário para o método estático
