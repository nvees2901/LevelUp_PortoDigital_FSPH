"""
term.py (repository) — Camada de acesso ao banco para Termos de Referência

Por que uma camada Repository?
  Separa "como acessar os dados" de "o que fazer com eles" (services).
  Vantagens:
  - Services ficam testáveis com mocks do repository
  - Troca de banco de dados não afeta a lógica de negócio (só o repository)
  - Queries complexas ficam num único lugar, não espalhadas pelo código

Padrão usado: repository estático (métodos de classe).
Alternativa seria injetar a sessão no construtor, mas métodos de classe
são mais simples e diretos per esta escala de projeto.
"""

import unicodedata
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.term import Term
from app.utils.logging import get_logger

logger = get_logger(__name__)


class TermRepository:

    # ------------------------------------------------------------------ #
    # Criação
    # ------------------------------------------------------------------ #

    @staticmethod
    async def create(session: AsyncSession, data: dict) -> Term:
        """
        Cria um novo Termo de Referência no banco.

        Uso:
            term = await TermRepository.create(db, {
                "title": "Contratação de TI",
                "category": "servico_tecnico",
                "content": "...",
            })
        """
        term = Term(**data)
        session.add(term)
        await session.flush()  # flush envia ao banco sem commitar
        # O commit acontece no get_db() após o endpoint retornar com sucesso
        logger.info("Novo TR criado: id=%s title=%r", term.id, term.title)
        return term

    # ------------------------------------------------------------------ #
    # Leitura
    # ------------------------------------------------------------------ #

    @staticmethod
    async def get_by_id(session: AsyncSession, term_id: str) -> Term | None:
        """Busca um TR pelo UUID. Retorna None se não existir."""
        result = await session.execute(
            select(Term).where(Term.id == term_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list(
        session: AsyncSession,
        *,
        category: str | None = None,
        status: str | None = None,
        search: str | None = None,
        page: int = 1,
        limit: int = 10,
    ) -> tuple[list[Term], int]:
        """
        Lista TRs com filtros opcionais e paginação.

        Retorna: (lista de termos, total de registros com esses filtros)

        Por que retornar o total junto?
          O frontend precisa do total para calcular o número de páginas.
          Fazer duas queries separadas (list + count) seria ineficiente.

        Busca sem acentos:
          Normalizamos o texto de busca e comparamos com o title em minúsculas.
          Ex: busca "aquisicao" encontra "Aquisição de TI".
        """
        query = select(Term)
        count_query = select(func.count(Term.id))

        # --- Filtros ---
        if category:
            query = query.where(Term.category == category)
            count_query = count_query.where(Term.category == category)

        if status:
            query = query.where(Term.status == status)
            count_query = count_query.where(Term.status == status)

        if search:
            # Normaliza o texto de busca (remove acentos, minúsculas)
            normalized = TermRepository._normalize(search)
            # Busca no título (case-insensitive)
            pattern = f"%{normalized}%"
            query = query.where(
                or_(
                    func.lower(Term.title).contains(normalized),
                    Term.title.ilike(f"%{search}%"),  # busca original também
                )
            )
            count_query = count_query.where(
                or_(
                    func.lower(Term.title).contains(normalized),
                    Term.title.ilike(f"%{search}%"),
                )
            )

        # --- Total (para paginação) ---
        total_result = await session.execute(count_query)
        total = total_result.scalar_one()

        # --- Paginação e ordenação ---
        offset = (page - 1) * limit
        query = (
            query
            .order_by(Term.created_at.desc())  # mais recentes primeiro
            .offset(offset)
            .limit(limit)
        )

        result = await session.execute(query)
        terms = list(result.scalars().all())

        return terms, total

    # ------------------------------------------------------------------ #
    # Atualização
    # ------------------------------------------------------------------ #

    @staticmethod
    async def update(
        session: AsyncSession, term_id: str, data: dict
    ) -> Term | None:
        """
        Atualiza apenas os campos enviados em `data` (PATCH semântico).
        Retorna o TR atualizado, ou None se não existir.
        """
        term = await TermRepository.get_by_id(session, term_id)
        if term is None:
            return None

        for field, value in data.items():
            if value is not None:  # não sobrescreve campos com None
                setattr(term, field, value)

        await session.flush()
        await session.refresh(term)
        logger.info("TR atualizado: id=%s campos=%s", term_id, list(data.keys()))
        return term

    # ------------------------------------------------------------------ #
    # Exclusão
    # ------------------------------------------------------------------ #

    @staticmethod
    async def delete(session: AsyncSession, term_id: str) -> bool:
        """
        Remove um TR. Retorna True se removeu, False se não existia.
        O CASCADE do banco remove as análises associadas automaticamente.
        """
        term = await TermRepository.get_by_id(session, term_id)
        if term is None:
            return False

        await session.delete(term)
        await session.flush()
        logger.info("TR removido: id=%s", term_id)
        return True

    # ------------------------------------------------------------------ #
    # Dashboard
    # ------------------------------------------------------------------ #

    @staticmethod
    async def list_pendentes_para(session: AsyncSession, setor: str) -> list[Term]:
        """
        Lista todos os TRs que estão aguardando ação do setor informado.

        Filtra por `setor_atual == setor`, ordered by created_at desc.

        Uso:
            pendentes = await TermRepository.list_pendentes_para(db, "dirop")
        """
        result = await session.execute(
            select(Term)
            .where(Term.setor_atual == setor)
            .order_by(Term.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_dashboard_stats(session: AsyncSession) -> dict:
        """
        Retorna estatísticas agregadas para o painel gerencial (HU-04):
        - Total de TRs
        - Contagem por status (8 estados do fluxo de tramitação)
        - 5 TRs mais recentes
        """
        # Contagem por status
        count_result = await session.execute(
            select(Term.status, func.count(Term.id))
            .group_by(Term.status)
        )
        counts = {row[0]: row[1] for row in count_result.all()}

        # 5 mais recentes
        recent_result = await session.execute(
            select(Term)
            .order_by(Term.created_at.desc())
            .limit(5)
        )
        recent = list(recent_result.scalars().all())

        # Monta o dict por_status com todos os 8 estados (zero se não houver)
        all_statuses = [
            "Rascunho",
            "Aguardando DIROP",
            "Aguardando DIRAF",
            "Aguardando DIGER",
            "Instrução COLIC",
            "Aguardando Jurídico",
            "Aprovação DIRAF/DIGER",
            "Homologado",
        ]
        por_status = {s: counts.get(s, 0) for s in all_statuses}

        return {
            "total": sum(counts.values()),
            "por_status": por_status,
            "recent_terms": recent,
        }

    # ------------------------------------------------------------------ #
    # Utilitários internos
    # ------------------------------------------------------------------ #

    @staticmethod
    def _normalize(text: str) -> str:
        """Remove acentos e converte para minúsculas para busca textual."""
        nfkd = unicodedata.normalize("NFKD", text)
        return "".join(c for c in nfkd if not unicodedata.combining(c)).casefold()
