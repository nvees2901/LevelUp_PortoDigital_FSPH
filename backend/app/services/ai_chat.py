"""
ai_chat.py — Integração com provedores de IA (Gemini, Ollama, OpenRouter, OpenAI) + RAG

Fluxo:
  1. RAG: busca trechos relevantes da Lei 14133 e TRs aprovados
  2. Injeta contexto RAG no system prompt
  3. Chama o provedor de IA configurado
  4. Retorna erro se nenhum provedor configurado
"""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

from app.core.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Gemini client singleton
_gemini_client = None

def _get_gemini_client():
    """Retorna o cliente Gemini singleton."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_client


# Anthropic (Claude) client singleton
_anthropic_client = None

def _get_anthropic_client():
    """Retorna o cliente Anthropic singleton."""
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _anthropic_client


# ------------------------------------------------------------------ #
# System Prompts por modo de chat
# ------------------------------------------------------------------ #

SYSTEM_PROMPTS: dict[str, str] = {
    "gerar": """Você é um assistente da FSPH (Fundação de Saúde Parreiras Horta), prestativo e flexível. Sua especialidade principal são licitações e Termos de Referência sob a Lei nº 14.133/2021, mas você se adapta totalmente ao que o usuário pedir: assuma o papel, o tom, o formato, o estilo (inclusive personagens) e o assunto solicitados, mesmo fora de licitações. NUNCA recuse um pedido apenas por estar "fora da sua área" — atenda ao que foi pedido.

Quando o usuário quiser um Termo de Referência, estruture-o de forma clara cobrindo, quando fizer sentido, os elementos do Art. 6º, XXIII da Lei 14.133/2021 (objeto, justificativa, valor estimado, critério de julgamento, prazo, local, modalidade) e cite os dispositivos legais pertinentes. Use os documentos de contexto abaixo como apoio.

{rag_context}""",

    "analisar": """Você é um assistente da FSPH, prestativo e flexível. Sua especialidade é a conformidade de Termos de Referência com a Lei nº 14.133/2021, mas você se adapta ao que for pedido — outros formatos, tons, estilos ou assuntos. NUNCA recuse um pedido só por estar fora da sua área.

Por padrão, ao analisar um TR, aponte inconsistências legais, seções faltantes ou incompletas e riscos jurídicos, usando como referência os elementos do Art. 6º, XXIII e os documentos de contexto abaixo (inclusive TRs aprovados).

{rag_context}""",

    "consultar": """Você é um assistente da FSPH, prestativo e flexível. Sua especialidade são Termos de Referência e licitações (Lei nº 14.133/2021), mas adapte seu papel, tom, estilo e assunto ao que o usuário pedir — inclusive temas fora de licitações ou personagens/estilos diferentes. NUNCA recuse um pedido apenas por estar fora da sua área de especialidade; atenda ao que foi pedido.

Quando não houver pedido específico de estilo ou papel, responda de forma técnica e objetiva, usando os documentos de contexto abaixo.

{rag_context}""",
}


# Keywords that indicate a complete Termo de Referência has been generated
_TR_COMPLETE_KEYWORDS: tuple[str, ...] = (
    "TERMO DE REFERÊNCIA",
    "Art. 6",
    "justificativa:",
    "Objeto:",
    "1. OBJETO",
    "1. Objeto",
)

# Prompt usado para SINTETIZAR o TR final a partir do histórico do chat.
_SYNTH_SYSTEM = """Você é um redator técnico da FSPH (Fundação de Saúde Parreiras Horta) especializado em Termos de Referência sob a Lei nº 14.133/2021.

A partir das informações da conversa, redija um Termo de Referência claro e bem estruturado, em Markdown. Adapte a estrutura e o nível de detalhe ao tipo de contratação e ao que foi pedido.

Orientações:
- Use seções com títulos numerados sequencialmente ("## 1. TÍTULO", "## 2. TÍTULO", ...). Quando fizer sentido, cubra os elementos do Art. 6º, XXIII (objeto, justificativa, valor estimado, critério de julgamento, prazo, local, modalidade, obrigações) e cite os dispositivos da Lei 14.133/2021.
- Priorize as informações fornecidas pelo gestor e complemente de forma coerente quando necessário.
- Empregue a terminologia técnica/legal de cada seção: "objeto" e "especificação"; "justificativa da necessidade"; "valor estimado" com "pesquisa de preços"; "critério de julgamento" (ex.: "menor preço"); "prazo de execução" e "vigência"/"cronograma"; "local de execução/entrega"; "modalidade" (ex.: "pregão eletrônico"); "sustentabilidade ambiental"; "garantia contratual"; e "obrigações da contratante e da contratada".
- Foque no conteúdo do termo (sem saudações nem perguntas) e use linguagem formal de documento de governo."""

_MODELO_CACHE: str | None = None
_MODELO_FILE = "Termo de Referência HEMO 2024.docx"


def _load_reference_model() -> str:
    """Lê um TR aprovado da FSPH (documents/) para servir de modelo de estrutura."""
    global _MODELO_CACHE
    if _MODELO_CACHE is not None:
        return _MODELO_CACHE
    text = ""
    try:
        from pathlib import Path

        from docx import Document

        path = Path(settings.DOCS_PATH) / _MODELO_FILE
        if path.exists():
            doc = Document(str(path))
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:  # noqa: BLE001
        logger.warning("Modelo de TR indisponível: %s", e)
    _MODELO_CACHE = text[:3000]
    return _MODELO_CACHE


class AINotConfiguredError(Exception):
    """Raised when no AI provider is configured."""
    pass


class AIProviderError(Exception):
    """Raised when an AI provider returns an error (rate limit, auth, etc)."""
    pass


class AIChatService:

    _client: Any = None  # AsyncOpenAI singleton
    _client_key: str = ""  # Chave usada para criar o client (detecta mudanças)

    @classmethod
    def _ensure_configured(cls) -> None:
        """Raises AINotConfiguredError if no AI provider is available."""
        if settings.is_mock_mode:
            raise AINotConfiguredError(
                "Nenhum provedor de IA configurado. "
                "Configure GEMINI_API_KEY, OPENROUTER_API_KEY, OLLAMA_BASE_URL ou OPENAI_API_KEY no .env"
            )

    @classmethod
    def _get_client(cls) -> Any:
        """Retorna o cliente AsyncOpenAI singleton (reutilizado entre requests)."""
        current_key = f"{settings.active_api_key}|{settings.active_base_url}"
        if cls._client is None or cls._client_key != current_key:
            from openai import AsyncOpenAI

            client_kwargs: dict[str, Any] = {
                "api_key": settings.active_api_key,
                "timeout": settings.AI_TIMEOUT_SECONDS,
            }
            if settings.active_base_url:
                client_kwargs["base_url"] = settings.active_base_url

            cls._client = AsyncOpenAI(**client_kwargs)
            cls._client_key = current_key
        return cls._client

    # ------------------------------------------------------------------ #
    # Cadeia de provedores com fallback automático
    # ------------------------------------------------------------------ #
    _clients: dict[str, Any] = {}

    @staticmethod
    def _provider_chain() -> list[dict[str, Any]]:
        """Provedores OpenAI-compatible em ordem de tentativa: OpenRouter ->
        Ollama -> OpenAI. Em caso de rate-limit/indisponibilidade, cai para o
        próximo automaticamente. (Gemini usa SDK próprio, fora desta cadeia.)"""
        chain: list[dict[str, Any]] = []
        if settings.OPENROUTER_API_KEY.strip():
            chain.append({"name": "OpenRouter", "api_key": settings.OPENROUTER_API_KEY.strip(),
                          "base_url": settings.OPENROUTER_BASE_URL, "model": settings.OPENROUTER_MODEL,
                          "openrouter": True})
        if settings.OLLAMA_BASE_URL.strip():
            chain.append({"name": "Ollama", "api_key": "ollama",
                          "base_url": settings.OLLAMA_BASE_URL.strip(), "model": settings.OLLAMA_MODEL,
                          "openrouter": False})
        if settings.OPENAI_API_KEY.strip():
            chain.append({"name": "OpenAI", "api_key": settings.OPENAI_API_KEY.strip(),
                          "base_url": None, "model": settings.OPENAI_MODEL, "openrouter": False})
        return chain

    @classmethod
    def _client_for(cls, prov: dict[str, Any]) -> Any:
        cache_key = f"{prov['api_key']}|{prov['base_url']}"
        cli = cls._clients.get(cache_key)
        if cli is None:
            from openai import AsyncOpenAI

            kwargs: dict[str, Any] = {"api_key": prov["api_key"], "timeout": settings.AI_TIMEOUT_SECONDS}
            if prov["base_url"]:
                kwargs["base_url"] = prov["base_url"]
            cli = AsyncOpenAI(**kwargs)
            cls._clients[cache_key] = cli
        return cli

    @classmethod
    async def _create_completion(cls, messages: list[dict], *, max_tokens: int, temperature: float):
        """Cria uma completion tentando os provedores em ordem, com fallback
        automático em rate-limit (429), indisponibilidade (5xx) ou timeout.
        Retorna (response, provider_name)."""
        from openai import APIConnectionError, APIStatusError, APITimeoutError, RateLimitError

        chain = cls._provider_chain()
        if not chain:
            raise AINotConfiguredError("Nenhum provedor de IA configurado.")

        last_err: Exception | None = None
        for i, prov in enumerate(chain):
            extra_headers = (
                {"HTTP-Referer": "https://fsph.pe.gov.br", "X-Title": "FSPH - Sistema de Analise de TRs"}
                if prov.get("openrouter") else {}
            )
            try:
                client = cls._client_for(prov)
                resp = await client.chat.completions.create(
                    model=prov["model"], messages=messages,
                    max_tokens=max_tokens, temperature=temperature,
                    extra_headers=extra_headers,
                )
                if i > 0:
                    logger.info("IA: fallback para %s bem-sucedido", prov["name"])
                return resp, prov["name"]
            except APIStatusError as e:
                last_err = e
                if getattr(e, "status_code", None) in (429, 500, 502, 503, 504):
                    logger.warning("Provedor %s indisponível (HTTP %s); tentando próximo...",
                                   prov["name"], e.status_code)
                    continue
                logger.warning("Provedor %s erro %s; tentando próximo...", prov["name"], e.status_code)
                continue
            except (RateLimitError, APITimeoutError, APIConnectionError) as e:
                last_err = e
                logger.warning("Provedor %s indisponível (%s); tentando próximo...",
                               prov["name"], type(e).__name__)
                continue
            except Exception as e:  # noqa: BLE001
                last_err = e
                logger.warning("Provedor %s falhou (%s); tentando próximo...", prov["name"], e)
                continue

        raise AIProviderError(f"Todos os provedores de IA falharam. Último erro: {last_err}")

    @classmethod
    async def process_message(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        term_content: str | None = None,
        extra_context: str = "",
    ) -> dict[str, Any]:
        """
        Processa uma mensagem e retorna a resposta da IA com contexto RAG.

        term_content: conteúdo do TR a analisar (apenas modo 'analisar').
        extra_context: contexto adicional (base de conhecimento do admin),
        injetado no system prompt mesmo com RAG desligado.

        Returns:
            {
              "content": str,
              "term_complete": bool
            }
        """
        cls._ensure_configured()

        # Busca contexto RAG em thread separada (CPU-bound, não bloqueia event loop)
        rag_context = await asyncio.to_thread(cls._get_rag_context, message, mode)
        if extra_context:
            rag_context = f"{rag_context}\n\n{extra_context}".strip() if rag_context else extra_context

        if settings.is_gemini_mode:
            return await cls._gemini_response(message, mode, history, rag_context, term_content)

        if settings.is_claude_mode:
            return await cls._anthropic_response(message, mode, history, rag_context, term_content)

        return await cls._openai_compat_response(message, mode, history, rag_context, term_content)

    # ------------------------------------------------------------------ #
    # Síntese do TR final (a partir de todo o histórico do chat)
    # ------------------------------------------------------------------ #
    @classmethod
    async def synthesize_tr(cls, history: list[dict[str, str]], extra_context: str = "") -> str:
        """Gera o Termo de Referência FINAL a partir de toda a conversa.

        Usa um TR aprovado da FSPH como modelo de estrutura e instrui o modelo
        a produzir SOMENTE o TR (sem perguntas/conversa), extraindo os dados
        ditos pelo gestor ao longo do chat. extra_context = base de
        conhecimento do admin (categoria Prompt), injetada como apoio.
        """
        cls._ensure_configured()

        modelo = _load_reference_model()
        modelo_block = (
            "\n\nMODELO DE REFERÊNCIA (TR aprovado da FSPH — use como referência de "
            f"estrutura e linguagem, NÃO copie os dados):\n{modelo}\n"
            if modelo else ""
        )
        if extra_context:
            modelo_block += f"\n\n{extra_context}\n"

        transcript_parts = []
        for m in history:
            if m.get("role") not in ("user", "assistant"):
                continue
            quem = "Gestor" if m["role"] == "user" else "Assistente"
            transcript_parts.append(f"{quem}: {m.get('content', '')}")
        transcript = "\n".join(transcript_parts)[-5000:]

        system_content = _SYNTH_SYSTEM + modelo_block
        user_content = (
            "INFORMAÇÕES FORNECIDAS NA CONVERSA (extraia o que for relevante e "
            "ignore perguntas, saudações e comentários):\n\n"
            f"{transcript}\n\n"
            "Gere agora o Termo de Referência final, completo e estruturado."
        )

        if settings.is_claude_mode:
            content = await cls._anthropic_synthesize(system_content, user_content)
        else:
            response, _ = await cls._create_completion(
                [
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": user_content},
                ],
                max_tokens=3000,
                temperature=0.3,
            )
            content = response.choices[0].message.content or ""
        from app.services.pdf_generator import clean_tr_content
        return clean_tr_content(content)

    # ------------------------------------------------------------------ #
    # Streaming
    # ------------------------------------------------------------------ #

    @classmethod
    async def stream_message(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        term_content: str | None = None,
        extra_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Gera tokens de forma incremental via SSE.

        Yields:
            Chunks de texto conforme chegam da API.
            O último yield é um JSON com metadados: {"done": true, "term_complete": bool}
        """
        cls._ensure_configured()

        rag_context = await asyncio.to_thread(cls._get_rag_context, message, mode)
        if extra_context:
            rag_context = f"{rag_context}\n\n{extra_context}".strip() if rag_context else extra_context

        if settings.is_gemini_mode:
            async for chunk in cls._gemini_stream(message, mode, history, rag_context, term_content):
                yield chunk
            return

        if settings.is_claude_mode:
            async for chunk in cls._anthropic_stream(message, mode, history, rag_context, term_content):
                yield chunk
            return

        async for chunk in cls._openai_compat_stream(message, mode, history, rag_context, term_content):
            yield chunk

    @classmethod
    async def _openai_compat_stream(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming via provedor OpenAI-compatible (Ollama/OpenRouter/OpenAI)."""
        import json

        system_content = cls._build_system_content(mode, rag_context, term_content)

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
            "%s stream request: model=%s mode=%s msgs=%d",
            settings.active_provider_name,
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
        except Exception as e:
            logger.error("Erro %s stream: %s", settings.active_provider_name, str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar provedor de IA: {e}") from e

        # Detecta se TR foi gerado
        term_complete = cls._detect_term_complete(mode, full_content)

        yield json.dumps({"done": True, "term_complete": term_complete, })

    # ------------------------------------------------------------------ #
    # Gemini
    # ------------------------------------------------------------------ #

    @classmethod
    def _build_system_content(
        cls,
        mode: str,
        rag_context: str,
        term_content: str | None = None,
    ) -> str:
        """Constrói o system prompt resolvendo RAG e, opcionalmente, conteúdo do TR.

        term_content é concatenado sem passar por .format() para evitar
        KeyError com chaves literais em documentos reais ({Município}, etc.).
        """
        rag_text = rag_context if rag_context else "(sem contexto adicional disponível)"
        template = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["consultar"])

        if mode == "analisar" and term_content:
            tr_section = (
                "\n\n**TERMO DE REFERÊNCIA A ANALISAR:**\n"
                + term_content[:6000]
                + "\n\n"
            )
            # Resolve {rag_context} inserindo TR + rag_text; term_content nunca
            # passa por .format(), portanto chaves literais não causam erros.
            resolved = template.replace("{rag_context}", tr_section + rag_text)
        else:
            resolved = template.replace("{rag_context}", rag_text)

        return resolved

    @staticmethod
    def _detect_term_complete(mode: str, content: str) -> bool:
        """Retorna True se o conteúdo indica que um TR completo foi gerado.

        Centraliza a detecção usada em todos os caminhos de resposta
        (Gemini/OpenAI, streaming/não-streaming).
        """
        return mode == "gerar" and any(kw in content for kw in _TR_COMPLETE_KEYWORDS)

    @classmethod
    async def _gemini_response(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> dict[str, Any]:
        """Chama Gemini via google-genai SDK."""
        system_content = cls._build_system_content(mode, rag_context, term_content)

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
        except Exception as e:
            logger.error("Erro Gemini: %s", str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar Gemini: {e}") from e

        content = response.text or ""

        term_complete = cls._detect_term_complete(mode, content)

        logger.info("Gemini response: chars=%d term_complete=%s", len(content), term_complete)

        return {"content": content, "term_complete": term_complete}

    @classmethod
    async def _gemini_stream(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming via Gemini SDK."""
        import json

        system_content = cls._build_system_content(mode, rag_context, term_content)

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
        except Exception as e:
            logger.error("Erro Gemini stream: %s", str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar Gemini: {e}") from e

        term_complete = cls._detect_term_complete(mode, full_content)

        yield json.dumps({"done": True, "term_complete": term_complete})

    # ------------------------------------------------------------------ #
    # OpenAI-compatible (Ollama / OpenRouter / OpenAI)
    # ------------------------------------------------------------------ #

    @classmethod
    async def _openai_compat_response(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> dict[str, Any]:
        """Chama o modelo ativo via provedor OpenAI-compatible (Ollama/OpenRouter/OpenAI)."""
        system_content = cls._build_system_content(mode, rag_context, term_content)

        messages = [
            {"role": "system", "content": system_content},
            *history,
            {"role": "user", "content": message},
        ]

        logger.info("IA request: mode=%s rag_chunks=%d msgs=%d", mode,
                    len(rag_context.split("\n")) if rag_context else 0, len(messages))

        response, provider = await cls._create_completion(
            messages, max_tokens=2500, temperature=0.4,
        )

        content = response.choices[0].message.content or ""

        # Detecta se TR foi gerado (modo 'gerar')
        term_complete = cls._detect_term_complete(mode, content)

        logger.info(
            "%s response: tokens=%s term_complete=%s",
            provider,
            getattr(response.usage, "total_tokens", "?"),
            term_complete,
        )

        return {"content": content, "term_complete": term_complete}

    # ------------------------------------------------------------------ #
    # Anthropic Claude
    # ------------------------------------------------------------------ #

    @classmethod
    async def _anthropic_response(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> dict[str, Any]:
        """Chama Claude via Anthropic SDK (não-streaming)."""
        system_content = cls._build_system_content(mode, rag_context, term_content)
        messages = [
            {"role": m["role"], "content": m["content"]}
            for m in history if m.get("role") in ("user", "assistant")
        ]
        messages.append({"role": "user", "content": message})

        client = _get_anthropic_client()
        logger.info("Claude request: model=%s mode=%s msgs=%d", settings.ANTHROPIC_MODEL, mode, len(messages))

        try:
            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2500,
                temperature=0.4,
                system=system_content,
                messages=messages,
            )
        except Exception as e:
            logger.error("Erro Claude: %s", str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar Claude: {e}") from e

        content = response.content[0].text if response.content else ""
        term_complete = cls._detect_term_complete(mode, content)
        logger.info("Claude response: chars=%d term_complete=%s", len(content), term_complete)
        return {"content": content, "term_complete": term_complete}

    @classmethod
    async def _anthropic_stream(
        cls,
        message: str,
        mode: str,
        history: list[dict[str, str]],
        rag_context: str,
        term_content: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming via Anthropic SDK."""
        import json

        system_content = cls._build_system_content(mode, rag_context, term_content)
        messages = [
            {"role": m["role"], "content": m["content"]}
            for m in history if m.get("role") in ("user", "assistant")
        ]
        messages.append({"role": "user", "content": message})

        client = _get_anthropic_client()
        logger.info("Claude stream: model=%s mode=%s msgs=%d", settings.ANTHROPIC_MODEL, mode, len(messages))

        full_content = ""
        try:
            async with client.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=2500,
                temperature=0.4,
                system=system_content,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    full_content += text
                    yield text
        except Exception as e:
            logger.error("Erro Claude stream: %s", str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar Claude: {e}") from e

        term_complete = cls._detect_term_complete(mode, full_content)
        yield json.dumps({"done": True, "term_complete": term_complete})

    @classmethod
    async def _anthropic_synthesize(cls, system_content: str, user_content: str) -> str:
        """Gera TR final via Claude (usado em synthesize_tr)."""
        client = _get_anthropic_client()
        try:
            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=3000,
                temperature=0.3,
                system=system_content,
                messages=[{"role": "user", "content": user_content}],
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            logger.error("Erro Claude synthesize: %s", str(e), exc_info=True)
            raise AIProviderError(f"Erro ao chamar Claude: {e}") from e

    # ------------------------------------------------------------------ #
    # RAG
    # ------------------------------------------------------------------ #

    @classmethod
    def _get_rag_context(cls, query: str, mode: str) -> str:
        """Busca contexto RAG baseado na query e modo."""
        try:
            from app.services.rag_service import RagService

            if RagService._client is None:
                return ""

            return RagService.get_full_context(query)

        except Exception as e:
            logger.warning("RAG context não disponível: %s", e)
            return ""

    @classmethod
    def get_initial_system_prompt(
        cls, mode: str, term_content: str | None = None
    ) -> dict[str, str]:
        """Retorna a mensagem de system para inicializar uma sessão.

        Delega a construção do conteúdo para _build_system_content com
        rag_context vazio, evitando duplicação da lógica de injeção de TR.
        """
        content = cls._build_system_content(mode, rag_context="", term_content=term_content)
        return {"role": "system", "content": content}
