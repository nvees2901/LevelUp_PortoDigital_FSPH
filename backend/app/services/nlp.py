"""
nlp.py — Service de Processamento de Linguagem Natural (NLP)

Responsável por detectar automaticamente, a partir do texto extraído:
  - Seções do TR (objeto, justificativa, valor estimado, etc.)
  - Campos variáveis ({{EMPRESA}}, {{VALOR}}, etc.)
  - Valor estimado em reais
  - Categoria do TR (capacitacao, aquisicao, servico_tecnico)

Abordagem: Regex + keyword matching
  Por que não um modelo NLP pesado como spaCy ou BERT?
  - Documentos jurídicos têm estrutura previsível e padronizada
  - Keywords da Lei 14.133 são específicas e bem definidas
  - Regex é determinístico e auditável (sabe-se exatamente por que detectou)
  - 100x mais rápido e sem dependências de ~500MB de modelos
  - Para um MVP educacional, transparência > precisão marginal de um modelo
"""

import re
import unicodedata
from decimal import Decimal, InvalidOperation

from app.utils.logging import get_logger

logger = get_logger(__name__)


class NLPService:

    # ------------------------------------------------------------------ #
    # Mapeamento de seções — keywords por seção obrigatória da Lei 14.133
    # ------------------------------------------------------------------ #
    # Cada seção tem uma lista de palavras-chave que indicam sua presença.
    # O detector busca essas keywords no texto normalizado.
    # Referência: Art. 6º, XXIII, a-h da Lei 14.133/2021

    SECTION_KEYWORDS: dict[str, list[str]] = {
        "objeto": [
            "objeto", "objeto da contratação", "objeto do contrato",
            "descrição do objeto", "especificação do objeto",
            "contratação de", "aquisição de", "serviço de",
        ],
        "justificativa": [
            "justificativa", "justificação", "motivação", "fundamentação",
            "necessidade", "razão da contratação", "motivo da contratação",
        ],
        "valor_estimado": [
            "valor estimado", "valor total", "valor máximo", "preço estimado",
            "custo estimado", "orçamento", "previsão orçamentária",
            "r$", "reais",
        ],
        "criterio_julgamento": [
            "critério de julgamento", "menor preço", "melhor técnica",
            "técnica e preço", "maior desconto", "critério de seleção",
        ],
        "prazo_execucao": [
            "prazo", "prazo de execução", "prazo de entrega", "vigência",
            "período de execução", "cronograma", "dias", "meses",
        ],
        "local_entrega": [
            "local de entrega", "local de execução", "endereço", "sede",
            "unidade", "instalações", "onde será executado",
        ],
        "modalidade_licitacao": [
            "modalidade", "pregão", "concorrência", "dispensa",
            "inexigibilidade", "licitação", "processo licitatório",
        ],
        "sustentabilidade": [
            "sustentabilidade", "ambiental", "sustentável",
            "meio ambiente", "critério ambiental", "green", "ecológico",
        ],
        "garantia": [
            "garantia", "garantia contratual", "caução", "seguro",
            "garantia de execução", "garantia de proposta",
        ],
        "obrigacoes": [
            "obrigações", "obrigações da contratante", "obrigações da contratada",
            "responsabilidades", "deveres", "encargos",
        ],
    }

    # Keywords por categoria de TR
    CATEGORY_KEYWORDS: dict[str, list[str]] = {
        "capacitacao": [
            "capacitação", "treinamento", "curso", "formação", "qualificação",
            "workshop", "seminário", "palestra", "educação", "aprendizagem",
        ],
        "aquisicao": [
            "aquisição", "compra", "fornecimento", "material", "equipamento",
            "bem", "produto", "insumo", "suprimento",
        ],
        "servico_tecnico": [
            "serviço técnico", "consultoria", "assessoria", "desenvolvimento",
            "software", "sistema", "tecnologia", "TI", "tecnologia da informação",
            "manutenção", "suporte técnico",
        ],
    }

    # Padrões para detectar variáveis entre colchetes ou chaves
    VARIABLE_PATTERNS = [
        r"\{\{([A-Z_]+)\}\}",          # {{EMPRESA}}
        r"\[([A-Z_\s]+)\]",            # [NOME DA EMPRESA]
        r"___+",                        # espaço em branco para preenchimento
        r"<([A-Z_\s]+)>",              # <CAMPO>
    ]

    # Padrões para detectar valores monetários
    VALUE_PATTERNS = [
        r"R\$\s*([\d.,]+)",                      # R$ 50.000,00
        r"reais?\s+([\d.,]+)",                   # reais 50000
        r"valor.*?R\$\s*([\d.,]+)",              # valor de R$ 50.000,00
        r"([\d]{1,3}(?:\.\d{3})*,\d{2})\s*reais",  # 50.000,00 reais
    ]

    # ------------------------------------------------------------------ #
    # Interface pública
    # ------------------------------------------------------------------ #

    @classmethod
    def detect_sections(cls, text: str) -> dict[str, str]:
        """
        Detecta e extrai seções do TR a partir do texto completo.

        Retorna um dicionário com as seções encontradas:
        {
          "objeto": "Contratação de serviço de capacitação...",
          "justificativa": "A necessidade decorre de...",
          ...
        }
        """
        normalized = cls._normalize(text)
        sections: dict[str, str] = {}

        for section_name, keywords in cls.SECTION_KEYWORDS.items():
            excerpt = cls._extract_section(text, normalized, keywords)
            if excerpt:
                sections[section_name] = excerpt

        logger.info("Seções detectadas: %s", list(sections.keys()))
        return sections

    @classmethod
    def detect_variable_fields(cls, text: str) -> list[str]:
        """
        Detecta campos variáveis (placeholders) no documento.
        
        Retorna lista de campos únicos encontrados:
        ["{{EMPRESA}}", "[NOME DO RESPONSÁVEL]", "___"]
        """
        fields: set[str] = set()

        for pattern in cls.VARIABLE_PATTERNS:
            matches = re.finditer(pattern, text)
            for match in matches:
                fields.add(match.group(0))

        result = sorted(fields)
        if result:
            logger.info("Campos variáveis detectados: %d", len(result))
        return result

    @classmethod
    def extract_estimated_value(cls, text: str) -> Decimal | None:
        """
        Extrai o primeiro valor monetário encontrado no texto.

        Retorna Decimal ou None se nenhum valor for encontrado.

        Exemplos detectados:
          "R$ 50.000,00"    → Decimal("50000.00")
          "R$ 1.500.000,00" → Decimal("1500000.00")
        """
        for pattern in cls.VALUE_PATTERNS:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                cleaned = cls._clean_value(match)
                if cleaned:
                    logger.info("Valor estimado extraído: R$ %s", cleaned)
                    return cleaned

        return None

    @classmethod
    def detect_category(cls, text: str) -> str:
        """
        Detecta a categoria do TR baseado em keywords.

        Retorna: 'capacitacao' | 'aquisicao' | 'servico_tecnico' | 'outro'
        """
        normalized = cls._normalize(text)
        scores: dict[str, int] = {}

        for category, keywords in cls.CATEGORY_KEYWORDS.items():
            score = sum(
                normalized.count(cls._normalize(kw))
                for kw in keywords
            )
            scores[category] = score

        best = max(scores, key=lambda k: scores[k])
        if scores[best] == 0:
            return "outro"

        logger.info("Categoria detectada: %s (score=%d)", best, scores[best])
        return best

    # ------------------------------------------------------------------ #
    # Utilitários internos
    # ------------------------------------------------------------------ #

    @classmethod
    def _extract_section(
        cls,
        original_text: str,
        normalized_text: str,
        keywords: list[str],
    ) -> str | None:
        """
        Extrai um trecho de texto em torno de uma keyword detectada.
        Retorna até 500 caracteres do contexto ao redor da keyword.
        """
        for keyword in keywords:
            normalized_keyword = cls._normalize(keyword)
            pos = normalized_text.find(normalized_keyword)

            if pos != -1:
                # Pega contexto: 50 chars antes e 450 depois da keyword
                start = max(0, pos - 50)
                end = min(len(original_text), pos + 450)
                excerpt = original_text[start:end].strip()

                # Limpa o trecho: remove quebras de linha excessivas
                excerpt = re.sub(r"\n{3,}", "\n\n", excerpt)
                return excerpt

        return None

    @staticmethod
    def _normalize(text: str) -> str:
        """Remove acentos e converte para minúsculas."""
        nfkd = unicodedata.normalize("NFKD", text)
        return "".join(c for c in nfkd if not unicodedata.combining(c)).casefold()

    @staticmethod
    def _clean_value(value_str: str) -> Decimal | None:
        """
        Converte string monetária para Decimal.
        "50.000,00" → Decimal("50000.00")
        """
        try:
            # Remove separadores de milhar e converte vírgula decimal para ponto
            cleaned = value_str.replace(".", "").replace(",", ".")
            return Decimal(cleaned)
        except (InvalidOperation, ValueError):
            return None
