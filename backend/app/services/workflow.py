"""
workflow.py (service) — Máquina de estados para tramitação de TRs

Implementa as transições do fluxo de aprovação de Termos de Referência
conforme definido no frontend (src/constants.ts:28-37).

Estados e responsáveis:
  Rascunho             → demandante → (avanço) → Aguardando DIROP
  Aguardando DIROP     → dirop      → (avanço) → Aguardando DIRAF
  Aguardando DIRAF     → diraf      → (avanço) → Aguardando DIGER
  Aguardando DIGER     → diger      → (avanço) → Instrução COLIC
  Instrução COLIC      → colic      → (avanço) → Aguardando Jurídico
  Aguardando Jurídico  → juridico   → (avanço) → Aprovação DIRAF/DIGER
  Aprovação DIRAF/DIGER→ diraf      → (avanço) → Homologado (terminal)

Qualquer setor que "detém" o TR pode devolvê-lo a Rascunho (setor demandante).
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.term import Term
from app.models.user import User
from app.models.workflow_event import WorkflowEvent
from app.repositories.checklist import ChecklistRepository
from app.repositories.term import TermRepository
from app.repositories.workflow_event import WorkflowEventRepository
from app.utils.exceptions import (
    ChecklistIncompleteError,
    DocumentNotFoundError,
    TerminalStateError,
    WorkflowForbiddenError,
)
from app.utils.logging import get_logger

logger = get_logger(__name__)

# ------------------------------------------------------------------ #
# Mapa de transições do fluxo de tramitação
# ------------------------------------------------------------------ #
# Chave: status atual do TR
# Valor: (próximo status, setor que pode avançar, próximo setor_atual)
#   - próximo setor_atual pode ser None para "Homologado" (estado terminal)
#     → nesse caso, setor_atual permanece como "diraf" (quem homologa)

TRANSICOES: dict[str, tuple[str, str, str | None]] = {
    "Rascunho":               ("Aguardando DIROP",       "demandante", "dirop"),
    "Aguardando DIROP":       ("Aguardando DIRAF",       "dirop",      "diraf"),
    "Aguardando DIRAF":       ("Aguardando DIGER",       "diraf",      "diger"),
    "Aguardando DIGER":       ("Instrução COLIC",        "diger",      "colic"),
    "Instrução COLIC":        ("Aguardando Jurídico",    "colic",      "juridico"),
    "Aguardando Jurídico":    ("Aprovação DIRAF/DIGER",  "juridico",   "diraf"),
    "Aprovação DIRAF/DIGER":  ("Homologado",             "diraf",      None),
    # "Homologado" é estado terminal — não há entrada aqui
}


async def avancar(
    db: AsyncSession,
    term_id: str,
    current_user: User,
    observacao: str | None = None,
) -> Term:
    """
    Avança o TR para o próximo passo do fluxo de tramitação.

    Raises:
        DocumentNotFoundError    — TR não encontrado
        TerminalStateError       — TR já está Homologado ou em estado inválido
        WorkflowForbiddenError   — usuário não pertence ao setor responsável
        ChecklistIncompleteError — checklist incompleto ao avançar de Rascunho
    """
    # 1. Carrega o TR
    term = await TermRepository.get_by_id(db, term_id)
    if term is None:
        raise DocumentNotFoundError(term_id)

    # 2. Verifica estado terminal
    if term.status == "Homologado":
        raise TerminalStateError()

    # 3. Verifica se status está no mapa de transições (defensivo)
    if term.status not in TRANSICOES:
        raise TerminalStateError()

    # 4. Obtém metadados da transição
    proximo_status, ator_esperado, proximo_setor = TRANSICOES[term.status]

    # 5. Verifica se o usuário pertence ao setor responsável
    if current_user.setor_id != ator_esperado:
        raise WorkflowForbiddenError(ator_esperado)

    # 6. Valida checklist ao avançar de Rascunho
    if term.status == "Rascunho":
        is_complete = await ChecklistRepository.is_complete(db, str(term.id))
        if not is_complete:
            raise ChecklistIncompleteError()

    # 7. Captura setor atual ANTES da mutação (para registrar no evento)
    de_setor_old = term.setor_atual

    # Atualiza status e setor_atual
    # Nota: proximo_setor pode ser None para "Homologado" →
    # mantemos "diraf" (quem homologa), pois setor_atual é NOT NULL
    term.status = proximo_status
    term.setor_atual = proximo_setor if proximo_setor is not None else "diraf"

    # 8. Registra evento no histórico
    await WorkflowEventRepository.create(
        db,
        term_id=str(term.id),
        ator_id=str(current_user.id),
        de_setor=de_setor_old,
        para_setor=term.setor_atual,
        acao="avancar",
        observacao=observacao,
    )

    # 9. Persiste sem commitar (commit acontece no get_db após resposta)
    await db.flush()

    logger.info(
        "TR avançado: term_id=%s de=%r para=%r ator=%s",
        term_id, de_setor_old, term.status, current_user.matricula,
    )

    return term


async def devolver(
    db: AsyncSession,
    term_id: str,
    current_user: User,
    observacao: str,
) -> Term:
    """
    Devolve o TR para o setor demandante (status = Rascunho).

    Raises:
        DocumentNotFoundError  — TR não encontrado
        WorkflowForbiddenError — TR está Homologado (não pode ser devolvido)
                                 ou usuário não pertence ao setor responsável
    """
    # 1. Carrega o TR
    term = await TermRepository.get_by_id(db, term_id)
    if term is None:
        raise DocumentNotFoundError(term_id)

    # 2. Estado terminal — devolução não permitida
    # Verificação ANTES de checar TRANSICOES (Homologado não está no mapa)
    if term.status == "Homologado":
        raise WorkflowForbiddenError("N/A")

    # 3. Status inválido (não está no mapa e não é Homologado)
    if term.status not in TRANSICOES:
        raise DocumentNotFoundError(term_id)

    # 4. Verifica setor responsável
    _, ator_esperado, _ = TRANSICOES[term.status]
    if current_user.setor_id != ator_esperado:
        raise WorkflowForbiddenError(ator_esperado)

    # 5. Captura setor atual antes da mutação
    de_setor = term.setor_atual

    # 6. Reverte para Rascunho no setor demandante
    term.status = "Rascunho"
    term.setor_atual = "demandante"

    # 7. Registra evento
    await WorkflowEventRepository.create(
        db,
        term_id=str(term.id),
        ator_id=str(current_user.id),
        de_setor=de_setor,
        para_setor="demandante",
        acao="devolver",
        observacao=observacao,
    )

    await db.flush()

    logger.info(
        "TR devolvido: term_id=%s de=%r para=demandante ator=%s",
        term_id, de_setor, current_user.matricula,
    )

    return term


async def get_historico(
    db: AsyncSession,
    term_id: str,
) -> list[WorkflowEvent]:
    """
    Retorna o histórico de eventos de tramitação de um TR, em ordem cronológica.

    Os eventos têm o relacionamento `ator` carregado via selectinload,
    permitindo acesso a `event.ator.nome` sem N+1 queries.
    """
    return await WorkflowEventRepository.list_by_term(db, term_id)
