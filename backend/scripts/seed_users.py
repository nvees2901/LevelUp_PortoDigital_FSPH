"""
seed_users.py — Popula usuários iniciais para desenvolvimento/staging.

Uso:
    cd backend
    uv run python -m scripts.seed_users

ATENÇÃO: Não executar em produção. Senha de dev é "senha123".
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

SEED_USERS = [
    # Demandantes — 1 por subunidade
    {"matricula": "DEM-HEMOSE-001", "nome": "Ana Lima (HEMOSE)",   "setor_id": "demandante", "subunidade": "HEMOSE"},
    {"matricula": "DEM-LACEN-001",  "nome": "Bruno Melo (LACEN)",  "setor_id": "demandante", "subunidade": "LACEN"},
    {"matricula": "DEM-SVO-001",    "nome": "Carla Nunes (SVO)",   "setor_id": "demandante", "subunidade": "SVO"},
    {"matricula": "DEM-ADM-001",    "nome": "Diego Souza (Adm)",   "setor_id": "demandante", "subunidade": "Área Administrativa"},
    # Demais setores
    {"matricula": "DIROP-001", "nome": "Elisa Torres", "setor_id": "dirop",    "subunidade": None},
    {"matricula": "DIRAF-001", "nome": "Fábio Costa",  "setor_id": "diraf",    "subunidade": None},
    {"matricula": "DIGER-001", "nome": "Gisele Prado", "setor_id": "diger",    "subunidade": None},
    {"matricula": "COLIC-001", "nome": "Hugo Ferraz",  "setor_id": "colic",    "subunidade": None},
    {"matricula": "JUR-001",   "nome": "Isabela Ramos","setor_id": "juridico", "subunidade": None},
]


async def seed() -> None:
    if settings.ENVIRONMENT == "production":
        print("ERRO: seed_users não deve ser executado em produção!", file=sys.stderr)
        sys.exit(1)

    senha_hash = hash_password(SENHA_DEV)
    created = 0
    skipped = 0

    async with AsyncSessionLocal() as session:
        for data in SEED_USERS:
            existing = await UserRepository.get_by_matricula(session, data["matricula"])
            if existing:
                skipped += 1
                continue
            await UserRepository.create(session, {**data, "senha_hash": senha_hash, "ativo": True})
            created += 1
        await session.commit()

    print(f"Seed concluído: {created} criados, {skipped} já existiam.")
    print(f"Senha padrão de dev: {SENHA_DEV!r}")


if __name__ == "__main__":
    asyncio.run(seed())
