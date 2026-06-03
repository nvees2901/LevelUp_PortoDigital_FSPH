"""
seed_users.py — Popula uma base fictícia de usuários para desenvolvimento.

Uso:
    cd backend
    uv run python -m scripts.seed_users

ATENÇÃO: Não executar em produção. Senha de dev é "senha123".
Os usuários têm nome realista e matrícula numérica (login = matrícula).
"""
import asyncio
import sys
from pathlib import Path

# Garante que o pacote `app` é importável ao rodar como módulo direto
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.repositories.user import UserRepository  # noqa: E402
from app.services.auth import hash_password  # noqa: E402

SENHA_DEV = "senha123"

# Matrículas de testes antigos a remover (substituídas pela base numérica abaixo).
OLD_TEST_MATRICULAS = [
    "DEM-HEMOSE-001", "DEM-LACEN-001", "DEM-SVO-001", "DEM-ADM-001",
    "DIROP-001", "DIRAF-001", "DIGER-001", "COLIC-001", "JUR-001",
]

# Base fictícia: nome realista + matrícula numérica.
SEED_USERS = [
    # Área Demandante (uma por subunidade)
    {"matricula": "1001", "nome": "Maria Eduarda Santos",   "setor_id": "demandante", "subunidade": "HEMOSE"},
    {"matricula": "1002", "nome": "João Pedro Oliveira",    "setor_id": "demandante", "subunidade": "LACEN"},
    {"matricula": "1003", "nome": "Ana Carolina Lima",      "setor_id": "demandante", "subunidade": "SVO"},
    {"matricula": "1004", "nome": "Carlos Henrique Souza",  "setor_id": "demandante", "subunidade": "Área Administrativa"},
    # Demais setores
    {"matricula": "2001", "nome": "Fernanda Almeida Costa",  "setor_id": "dirop",    "subunidade": None},
    {"matricula": "2002", "nome": "Ricardo Mendes Barbosa",  "setor_id": "diraf",    "subunidade": None},
    {"matricula": "2003", "nome": "Patrícia Gomes Ferreira", "setor_id": "diger",    "subunidade": None},
    {"matricula": "2004", "nome": "Bruno Carvalho Rocha",    "setor_id": "colic",    "subunidade": None},
    {"matricula": "2005", "nome": "Juliana Ribeiro Martins", "setor_id": "juridico", "subunidade": None},
    # Administrador do sistema (mantém matrícula ADMIN-001 — bootstrap depende dela)
    {"matricula": "ADMIN-001", "nome": "Roberto Dias Nogueira", "setor_id": "colic", "subunidade": None, "is_admin": True},
]


async def seed() -> None:
    if settings.ENVIRONMENT == "production":
        print("ERRO: seed_users não deve ser executado em produção!", file=sys.stderr)
        sys.exit(1)

    senha_hash = hash_password(SENHA_DEV)
    created = updated = removed = 0

    async with AsyncSessionLocal() as session:
        # Remove os usuários de teste antigos (sem TRs vinculados).
        for matricula in OLD_TEST_MATRICULAS:
            old = await UserRepository.get_by_matricula(session, matricula)
            if old:
                await session.delete(old)
                removed += 1
        await session.flush()

        # Upsert da base fictícia.
        for data in SEED_USERS:
            existing = await UserRepository.get_by_matricula(session, data["matricula"])
            if existing:
                existing.nome = data["nome"]
                existing.setor_id = data["setor_id"]
                existing.subunidade = data.get("subunidade")
                existing.is_admin = data.get("is_admin", False)
                existing.ativo = True
                existing.senha_hash = senha_hash
                updated += 1
            else:
                await UserRepository.create(
                    session, {**data, "senha_hash": senha_hash, "ativo": True}
                )
                created += 1
        await session.commit()

    print(f"Seed concluído: {created} criados, {updated} atualizados, {removed} antigos removidos.")
    print(f"Senha padrão de dev: {SENHA_DEV!r}")


if __name__ == "__main__":
    asyncio.run(seed())
