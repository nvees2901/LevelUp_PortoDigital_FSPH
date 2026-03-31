# ====================================================================
# FSPH — Makefile de desenvolvimento
# ====================================================================
# Uso:
#   make install    — instala dependências do front e back
#   make dev        — roda front + back + banco + redis de uma vez
#   make front      — só o frontend (Vite)
#   make back       — só o backend (FastAPI)
#   make infra      — só PostgreSQL via Docker
#   make migrate    — gera e aplica migrações Alembic
#   make lint       — lint em ambos
#   make build      — build de produção do frontend
#   make clean      — para tudo e limpa containers
# ====================================================================

.PHONY: install dev dev-light front back infra stop migrate lint build clean help

# Diretórios
BACK  := backend
FRONT := frontend

# ------------------------------------------------------------------ #
# Ajuda (padrão)
# ------------------------------------------------------------------ #
help:
	@echo ""
	@echo "  FSPH — Comandos disponiveis"
	@echo "  ─────────────────────────────────────────"
	@echo "  make install     Instala dependencias (front + back)"
	@echo "  make dev         Roda tudo: banco + back + front"
	@echo "  make front       Roda so o frontend (porta 5173)"
	@echo "  make back        Roda so o backend  (porta 8000)"
	@echo "  make infra       Sobe PostgreSQL via Docker"
	@echo "  make stop        Para containers Docker"
	@echo "  make migrate     Gera e aplica migracoes do banco"
	@echo "  make lint        Roda linters (ruff + eslint)"
	@echo "  make build       Build de producao do frontend"
	@echo "  make clean       Para tudo e remove containers"
	@echo ""

# ------------------------------------------------------------------ #
# Instalar dependências
# ------------------------------------------------------------------ #
install:
	cd $(BACK)  && uv sync
	cd $(FRONT) && npm install

# ------------------------------------------------------------------ #
# Infraestrutura (PostgreSQL + Redis)
# ------------------------------------------------------------------ #
infra:
	docker compose up -d postgres chromadb
	@echo ""
	@echo "  PostgreSQL: localhost:5433"
	@echo "  ChromaDB:   localhost:8100"
	@echo ""

stop:
	docker compose stop

# ------------------------------------------------------------------ #
# Backend
# ------------------------------------------------------------------ #
back:
	cd $(BACK) && uv run dev

# ------------------------------------------------------------------ #
# Frontend
# ------------------------------------------------------------------ #
front:
	cd $(FRONT) && npm run dev

# ------------------------------------------------------------------ #
# Rodar tudo junto (infra + back + front)
# ------------------------------------------------------------------ #
dev: infra
	@echo ""
	@echo "  Iniciando backend e frontend..."
	@echo "  Backend:  http://localhost:8000/api/docs"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Ctrl+C para encerrar ambos"
	@echo ""
	@cd $(BACK) && uv run dev & \
	 cd $(FRONT) && npm run dev & \
	 wait

# ------------------------------------------------------------------ #
# Migrações
# ------------------------------------------------------------------ #
migrate:
	cd $(BACK) && uv run alembic upgrade head

migrate-gen:
	cd $(BACK) && uv run alembic revision --autogenerate -m "auto"

migrate-up:
	cd $(BACK) && uv run alembic upgrade head

migrate-down:
	cd $(BACK) && uv run alembic downgrade -1

# ------------------------------------------------------------------ #
# Lint
# ------------------------------------------------------------------ #
lint:
	cd $(BACK)  && uv run ruff check .
	cd $(FRONT) && npm run lint

# ------------------------------------------------------------------ #
# Build
# ------------------------------------------------------------------ #
build:
	cd $(FRONT) && npm run build

# ------------------------------------------------------------------ #
# Limpeza
# ------------------------------------------------------------------ #
clean:
	docker compose down -v
	rm -rf $(FRONT)/dist
	rm -rf $(BACK)/uploads/*
	@echo "Containers removidos e builds limpos."
