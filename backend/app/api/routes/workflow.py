"""
workflow.py (route) — Endpoints de tramitação de Termos de Referência

Gerencia o fluxo de aprovação dos TRs entre os setores da FSPH.

Endpoints (todos sob /api/v1/terms):
  GET    /api/v1/terms/pendentes              → TRs aguardando ação do usuário logado
  POST   /api/v1/terms/{term_id}/avancar      → avança TR para próximo setor
  POST   /api/v1/terms/{term_id}/devolver     → devolve TR para o demandante
  GET    /api/v1/terms/{term_id}/historico    → histórico de tramitação
  GET    /api/v1/terms/{term_id}/checklist    → estado do checklist
  PUT    /api/v1/terms/{term_id}/checklist    → atualiza checklist (só demandante em Rascunho)

⚠️  ATENÇÃO: este router é registrado ANTES do terms.router em main.py.
    Isso garante que GET /terms/pendentes seja resolvido como rota estática
    antes de GET /terms/{term_id} (paramétrica) do terms router.
    Dentro deste router, GET /pendentes também está declarado PRIMEIRO.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser
from app.repositories.checklist import ChecklistRepository
from app.repositories.term import TermRepository
from app.schemas.checklist import TermChecklistOut, TermChecklistUpdate
from app.schemas.term import TermResponse
from app.schemas.workflow import AvancarRequest, DevolverRequest, WorkflowEventOut
from app.services import workflow as workflow_service
from app.utils.exceptions import DocumentNotFoundError, WorkflowForbiddenError
from app.utils.logging import get_logger
from app.core.database import get_db

from typing import Annotated
from fastapi import Depends

logger = get_logger(__name__)

router = APIRouter(prefix="/terms", tags=["Workflow Tramitação"])

DbDep = Annotated[AsyncSession, Depends(get_db)]


# ------------------------------------------------------------------ #
# IMPORTANTE: rota estática ANTES das rotas com {term_id}
# ------------------------------------------------------------------ #

@router.get("/pendentes", response_model=list[TermResponse])
async def get_pendentes(db: DbDep, current_user: CurrentUser):
    """
    Lista os TRs que estão aguardando ação do setor do usuário logado (HU-06).

    Filtra por `setor_atual == current_user.setor_id`.
    Retorna lista vazia se não houver TRs pendentes.
    """
    terms = await TermRepository.list_pendentes_para(db, current_user.setor_id)
    return [TermResponse.model_validate(t) for t in terms]


# ------------------------------------------------------------------ #
# Tramitação — avançar e devolver
# ------------------------------------------------------------------ #

@router.post("/{term_id}/avancar", response_model=TermResponse)
async def avancar_termo(
    term_id: str,
    payload: AvancarRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    """
    Avança o TR para o próximo setor do fluxo de tramitação (HU-06).

    O setor do usuário deve corresponder ao setor responsável no estado atual.
    Para o primeiro avanço (Rascunho → Aguardando DIROP), o checklist
    deve estar 100% completo.
    """
    term = await workflow_service.avancar(
        db, term_id, current_user, payload.observacao
    )
    return TermResponse.model_validate(term)


@router.post("/{term_id}/devolver", response_model=TermResponse)
async def devolver_termo(
    term_id: str,
    payload: DevolverRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    """
    Devolve o TR ao setor demandante (status = Rascunho) com observação obrigatória.

    Somente o setor que detém o TR atualmente pode devolvê-lo.
    TRs Homologados não podem ser devolvidos.
    """
    term = await workflow_service.devolver(
        db, term_id, current_user, payload.observacao
    )
    return TermResponse.model_validate(term)


# ------------------------------------------------------------------ #
# Histórico de tramitação
# ------------------------------------------------------------------ #

@router.get("/{term_id}/historico", response_model=list[WorkflowEventOut])
async def get_historico_termo(
    term_id: str,
    db: DbDep,
    current_user: CurrentUser,
):
    """
    Retorna o histórico completo de tramitação de um TR em ordem cronológica.

    Inclui: quem realizou cada ação, de qual setor para qual, e observações.
    """
    events = await workflow_service.get_historico(db, term_id)

    # Constrói a resposta manualmente para popular ator_nome
    # (WorkflowEvent.ator é carregado via selectinload no repository)
    return [
        WorkflowEventOut(
            id=str(event.id),
            term_id=str(event.term_id),
            ator_nome=event.ator.nome if event.ator else None,
            de_setor=event.de_setor,
            para_setor=event.para_setor,
            acao=event.acao,
            observacao=event.observacao,
            created_at=str(event.created_at),
        )
        for event in events
    ]


# ------------------------------------------------------------------ #
# Checklist de documentos obrigatórios
# ------------------------------------------------------------------ #

@router.get("/{term_id}/checklist", response_model=TermChecklistOut)
async def get_checklist_termo(
    term_id: str,
    db: DbDep,
    current_user: CurrentUser,
):
    """
    Retorna o estado atual do checklist de documentos obrigatórios do TR.

    O checklist possui 7 campos: DFD, ETP, TR, Dotação,
    Autorização DIROP, DIRAF e DIGER.
    """
    checklist = await ChecklistRepository.get_by_term(db, term_id)
    if checklist is None:
        raise DocumentNotFoundError(term_id)
    return TermChecklistOut.model_validate(checklist)


@router.put("/{term_id}/checklist", response_model=TermChecklistOut)
async def update_checklist_termo(
    term_id: str,
    payload: TermChecklistUpdate,
    db: DbDep,
    current_user: CurrentUser,
):
    """
    Atualiza o checklist de documentos obrigatórios (PATCH semântico).

    Restrições:
      - Somente o setor 'demandante' pode editar o checklist
      - O TR deve estar no status 'Rascunho'
    """
    # Valida: apenas demandante pode editar
    if current_user.setor_id != "demandante":
        raise WorkflowForbiddenError("demandante")

    # Valida: TR deve estar em Rascunho
    term = await TermRepository.get_by_id(db, term_id)
    if term is None:
        raise DocumentNotFoundError(term_id)
    if term.status != "Rascunho":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Checklist só pode ser editado em Rascunho",
        )

    # Atualiza apenas os campos enviados (exclude_none filtra os não enviados)
    updated = await ChecklistRepository.update(
        db, term_id, **payload.model_dump(exclude_none=True)
    )
    if updated is None:
        raise DocumentNotFoundError(term_id)

    return TermChecklistOut.model_validate(updated)
