"""
ai_chat.py — Integração com OpenRouter (Llama 3.3 70B) + RAG + Modo Mock

Fluxo:
  1. RAG: busca trechos relevantes da Lei 14133 e TRs aprovados
  2. Injeta contexto RAG no system prompt
  3. Chama OpenRouter com Llama 3.3 70B (gratuito)
  4. Fallback para mock se sem API key

Compatibilidade: OpenRouter usa exatamente a mesma API do OpenAI —
apenas mudamos base_url e adicionamos os headers exigidos.
"""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

from app.core.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Timeout para chamadas à API (em segundos)
_API_TIMEOUT = 60.0

# Gemini client singleton
_gemini_client = None

def _get_gemini_client():
    """Retorna o cliente Gemini singleton."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client


# ------------------------------------------------------------------ #
# System Prompts por modo de chat
# ------------------------------------------------------------------ #

SYSTEM_PROMPTS: dict[str, str] = {
    "gerar": """Você é um especialista em licitações e contratações públicas da FSPH (Fundação de Saúde Pública de Pernambuco), com profundo conhecimento da Lei nº 14.133/2021.

Seu papel é auxiliar gestores a criar Termos de Referência (TR) completos, em conformidade legal, usando como base os documentos abaixo.

**Estrutura obrigatória do TR (Art. 6º, XXIII):**
a) Descrição clara e precisa do objeto
b) Justificativa da necessidade
c) Valor estimado com pesquisa de preços
d) Critério de julgamento das propostas
e) Prazo de execução ou entrega
f) Local de entrega ou execução
g) Modalidade de licitação ou justificativa de dispensa

**Condução da conversa:**
1. Pergunte: "Qual é o objeto da contratação?"
2. Colete: valor estimado, prazo, local, tipo de licitação
3. Pergunte sobre sustentabilidade e garantia contratual
4. Gere o TR estruturado com referências à Lei 14.133/2021

Cite sempre o artigo correspondente. Seja técnico, claro e objetivo.

{rag_context}""",

    "analisar": """Você é um auditor jurídico especialista em conformidade com a Lei nº 14.133/2021, atuando na FSPH.

Analise o Termo de Referência fornecido e identifique:
- Inconsistências com os requisitos legais
- Seções faltantes ou incompletas
- Riscos jurídicos

**Checklist dos 10 critérios (Art. 6º, XXIII):**
1. Descrição do objeto
2. Justificativa da necessidade
3. Valor estimado
4. Critério de julgamento
5. Prazo de execução
6. Local de entrega
7. Modalidade de licitação
8. Sustentabilidade ambiental
9. Garantia contratual
10. Obrigações das partes

Compare o TR analisado com os TRs aprovados da FSPH abaixo como referência de qualidade.

{rag_context}""",

    "consultar": """Você é um assistente especializado em Termos de Referência e licitações públicas da FSPH.

Responda perguntas sobre:
- Requisitos da Lei 14.133/2021
- Boas práticas em TRs
- Modalidades de licitação
- Como estruturar seções específicas

Use os documentos abaixo como base para suas respostas.

{rag_context}""",
}


# ------------------------------------------------------------------ #
# Respostas Mock
# ------------------------------------------------------------------ #

MOCK_RESPONSES: dict[str, list[str]] = {
    "gerar": [
        "Olá! Sou o assistente de criação de TRs da FSPH. "
        "Para criarmos um Termo de Referência conforme a Lei 14.133/2021, "
        "preciso saber: **qual é o objeto da contratação?** "
        "(Ex: 'serviço de capacitação em gestão', 'aquisição de computadores')\n\n"
        "*(Modo demonstração — configure OPENROUTER_API_KEY para IA real)*",
    ],
    "analisar": [
        "Analisarei o documento conforme a Lei 14.133/2021.\n\n"
        "**[MODO DEMONSTRAÇÃO]**\n"
        "Configure `OPENROUTER_API_KEY` no `.env` para análise completa via IA.",
    ],
    "consultar": [
        "Posso ajudar com dúvidas sobre TRs e a Lei 14.133/2021.\n\n"
        "*(Modo demonstração — configure OPENROUTER_API_KEY para IA real)*",
    ],
}


class AIChatService:

    _client: Any = None  # AsyncOpenAI singleton
    _client_key: str = ""  # Chave usada para criar o client (detecta mudanças)

    @classmethod
    def _get_client(cls) -> Any:
        """Retorna o cliente AsyncOpenAI singleton (reutilizado entre requests)."""
        current_key = f"{settings.active_api_key}|{settings.active_base_url}"
        if cls._client is None or cls._client_key != current_key:
            from openai import AsyncOpenAI

            client_kwargs: dict[str, Any] = {
                "api_key": settings.active_api_key,
                "timeout": _API_TIMEOUT,
            }
            if settings.active_base_url:
                client_kwargs["base_url"] = settings.active_base_url

            cls._client = AsyncOpenAI(**client_kwargs)
            cls._client_key = current_key
        return cls._client

    @classmethod
    async def process_message(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
    ) -> dict[str, Any]:
        """
        Processa uma mensagem e retorna a resposta da IA com contexto RAG.

        Returns:
            {
              "content": str,
              "is_mock": bool,
              "term_complete": bool
            }
        """
        if settings.is_mock_mode:
            return cls._mock_response(mode, history)

        # Busca contexto RAG em thread separada (CPU-bound, não bloqueia event loop)
        rag_context = await asyncio.to_thread(cls._get_rag_context, message, mode)

        if settings.is_gemini_mode:
            return await cls._gemini_response(message, mode, history, rag_context)

        return await cls._openrouter_response(message, mode, history, rag_context)

    # ------------------------------------------------------------------ #
    # Streaming
    # ------------------------------------------------------------------ #

    @classmethod
    async def stream_message(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
    ) -> AsyncGenerator[str, None]:
        """
        Gera tokens de forma incremental via SSE.

        Yields:
            Chunks de texto conforme chegam da API.
            O último yield é um JSON com metadados: {"done": true, "term_complete": bool}
        """
        import json

        if settings.is_mock_mode:
            result = cls._mock_response(mode, history)
            # Simula streaming do mock em pedaços
            content = result["content"]
            for i in range(0, len(content), 8):
                yield content[i : i + 8]
            yield json.dumps({"done": True, "term_complete": False, "is_mock": True})
            return

        rag_context = await asyncio.to_thread(cls._get_rag_context, message, mode)

        if settings.is_gemini_mode:
            async for chunk in cls._gemini_stream(message, mode, history, rag_context):
                yield chunk
            return

        async for chunk in cls._openrouter_stream(message, mode, history, rag_context):
            yield chunk

    @classmethod
    async def _openrouter_stream(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
    ) -> AsyncGenerator[str, None]:
        """Streaming via OpenRouter com SSE."""
        import json

        system_content = SYSTEM_PROMPTS[mode].format(
            rag_context=rag_context if rag_context else "(sem contexto adicional disponível)"
        )

        messages = [
            {"role": "system", "content": system_content},
            *history,
            {"role": "user", "content": message},
        ]

        client = cls._get_client()

        extra_headers = {}
        if settings.OPENROUTER_API_KEY:
            extra_headers = {
                "HTTP-Referer": "https://fsph.pe.gov.br",
                "X-Title": "FSPH - Sistema de Analise de TRs",
            }

        logger.info(
            "OpenRouter stream request: model=%s mode=%s msgs=%d",
            settings.active_model, mode, len(messages),
        )

        full_content = ""
        try:
            stream = await client.chat.completions.create(
                model=settings.active_model,
                messages=messages,
                max_tokens=2500,
                temperature=0.4,
                extra_headers=extra_headers,
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_content += delta.content
                    yield delta.content

            # Detecta se TR foi gerado
            term_complete = (
                mode == "gerar"
                and any(kw in full_content for kw in [
                    "TERMO DE REFERÊNCIA", "Art. 6", "justificativa:",
                    "Objeto:", "1. OBJETO", "1. Objeto",
                ])
            )

            yield json.dumps({"done": True, "term_complete": term_complete, "is_mock": False})

        except Exception as e:
            logger.error("Erro OpenRouter stream: %s", str(e), exc_info=True)
            # Fallback: retorna mock completo
            result = cls._mock_response(mode, history)
            yield result["content"]
            yield json.dumps({"done": True, "term_complete": False, "is_mock": True})

    # ------------------------------------------------------------------ #
    # Gemini
    # ------------------------------------------------------------------ #

    @classmethod
    async def _gemini_response(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
    ) -> dict[str, Any]:
        """Chama Gemini via google-genai SDK."""
        system_content = SYSTEM_PROMPTS[mode].format(
            rag_context=rag_context if rag_context else "(sem contexto adicional disponível)"
        )

        # Gemini usa formato de contents diferente do OpenAI
        contents = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        contents.append({"role": "user", "parts": [{"text": message}]})

        client = _get_gemini_client()

        logger.info(
            "Gemini request: model=%s mode=%s msgs=%d",
            settings.GEMINI_MODEL, mode, len(contents),
        )

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=contents,
                config={
                    "system_instruction": system_content,
                    "max_output_tokens": 2500,
                    "temperature": 0.4,
                },
            )

            content = response.text or ""

            term_complete = (
                mode == "gerar"
                and any(kw in content for kw in [
                    "TERMO DE REFERÊNCIA", "Art. 6", "justificativa:",
                    "Objeto:", "1. OBJETO", "1. Objeto",
                ])
            )

            logger.info("Gemini response: chars=%d term_complete=%s", len(content), term_complete)

            return {"content": content, "is_mock": False, "term_complete": term_complete}

        except Exception as e:
            logger.error("Erro Gemini: %s", str(e), exc_info=True)
            logger.warning("Fallback para mock após erro Gemini")
            return cls._mock_response(mode, history)

    @classmethod
    async def _gemini_stream(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
    ) -> AsyncGenerator[str, None]:
        """Streaming via Gemini SDK."""
        import json

        system_content = SYSTEM_PROMPTS[mode].format(
            rag_context=rag_context if rag_context else "(sem contexto adicional disponível)"
        )

        contents = []
        for msg in history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        contents.append({"role": "user", "parts": [{"text": message}]})

        client = _get_gemini_client()

        logger.info(
            "Gemini stream request: model=%s mode=%s msgs=%d",
            settings.GEMINI_MODEL, mode, len(contents),
        )

        full_content = ""
        try:
            response_stream = await asyncio.to_thread(
                client.models.generate_content_stream,
                model=settings.GEMINI_MODEL,
                contents=contents,
                config={
                    "system_instruction": system_content,
                    "max_output_tokens": 2500,
                    "temperature": 0.4,
                },
            )

            for chunk in response_stream:
                if chunk.text:
                    full_content += chunk.text
                    yield chunk.text

            term_complete = (
                mode == "gerar"
                and any(kw in full_content for kw in [
                    "TERMO DE REFERÊNCIA", "Art. 6", "justificativa:",
                    "Objeto:", "1. OBJETO", "1. Objeto",
                ])
            )

            yield json.dumps({"done": True, "term_complete": term_complete, "is_mock": False})

        except Exception as e:
            logger.error("Erro Gemini stream: %s", str(e), exc_info=True)
            result = cls._mock_response(mode, history)
            yield result["content"]
            yield json.dumps({"done": True, "term_complete": False, "is_mock": True})

    # ------------------------------------------------------------------ #
    # Modo Mock
    # ------------------------------------------------------------------ #

    @classmethod
    def _mock_response(
        cls, mode: str, history: list[dict[str, str]]
    ) -> dict[str, Any]:
        responses = MOCK_RESPONSES.get(mode, MOCK_RESPONSES["consultar"])
        user_turns = sum(1 for m in history if m.get("role") == "user")
        idx = min(user_turns, len(responses) - 1)
        return {"content": responses[idx], "is_mock": True, "term_complete": False}

    # ------------------------------------------------------------------ #
    # OpenRouter
    # ------------------------------------------------------------------ #

    @classmethod
    async def _openrouter_response(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
    ) -> dict[str, Any]:
        """Chama o Llama 3.3 70B via OpenRouter com contexto RAG."""
        system_content = SYSTEM_PROMPTS[mode].format(
            rag_context=rag_context if rag_context else "(sem contexto adicional disponível)"
        )

        messages = [
            {"role": "system", "content": system_content},
            *history,
            {"role": "user", "content": message},
        ]

        client = cls._get_client()

        extra_headers = {}
        if settings.OPENROUTER_API_KEY:
            extra_headers = {
                "HTTP-Referer": "https://fsph.pe.gov.br",
                "X-Title": "FSPH - Sistema de Analise de TRs",
            }

        logger.info(
            "OpenRouter request: model=%s mode=%s rag_chunks=%d msgs=%d",
            settings.active_model, mode,
            len(rag_context.split("\n")) if rag_context else 0,
            len(messages),
        )

        try:
            response = await client.chat.completions.create(
                model=settings.active_model,
                messages=messages,
                max_tokens=2500,
                temperature=0.4,  # mais determinístico para análise jurídica
                extra_headers=extra_headers,
            )

            content = response.choices[0].message.content or ""

            # Detecta se TR foi gerado (modo 'gerar')
            term_complete = (
                mode == "gerar"
                and any(kw in content for kw in [
                    "TERMO DE REFERÊNCIA", "Art. 6", "justificativa:",
                    "Objeto:", "1. OBJETO", "1. Objeto",
                ])
            )

            logger.info(
                "OpenRouter response: tokens=%s term_complete=%s",
                getattr(response.usage, "total_tokens", "?"),
                term_complete,
            )

            return {"content": content, "is_mock": False, "term_complete": term_complete}

        except Exception as e:
            logger.error("Erro OpenRouter: %s", str(e), exc_info=True)
            logger.warning("Fallback para mock após erro de API")
            return cls._mock_response(mode, history)

    # ------------------------------------------------------------------ #
    # RAG
    # ------------------------------------------------------------------ #

    @classmethod
    def _get_rag_context(cls, query: str, mode: str) -> str:
        """Busca contexto RAG baseado na query e modo."""
        try:
            from app.services.rag_service import RagService

            if not RagService._indexed:
                return ""

            return RagService.get_full_context(query)

        except Exception as e:
            logger.warning("RAG context não disponível: %s", e)
            return ""

    @classmethod
    def get_initial_system_prompt(cls, mode: str) -> dict[str, str]:
        """Retorna a mensagem de system para inicializar uma sessão."""
        content = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["consultar"])
        # Remove o placeholder RAG no system prompt inicial
        return {"role": "system", "content": content.format(rag_context="")}
