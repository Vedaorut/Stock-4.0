# Telegram E-Commerce Platform - Makefile

.PHONY: help install dev build start stop restart logs clean test migrate seed

# Colors
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(CYAN)Telegram E-Commerce Platform - Commands:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ===== Installation =====

install: ## Install all dependencies
	@echo "$(CYAN)Installing dependencies...$(NC)"
	@cd backend && npm install
	@cd bot && npm install
	@cd webapp && npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

# ===== Development =====

dev: ## Start all services in development mode
	@echo "$(CYAN)Starting development environment...$(NC)"
	@docker-compose up -d postgres redis
	@echo "$(YELLOW)Waiting for database to be ready...$(NC)"
	@sleep 5
	@make migrate
	@echo "$(CYAN)Starting backend...$(NC)"
	@cd backend && npm run dev &
	@echo "$(CYAN)Starting bot...$(NC)"
	@cd bot && npm run dev &
	@echo "$(CYAN)Starting webapp...$(NC)"
	@cd webapp && npm run dev &
	@echo "$(GREEN)✓ Development environment started$(NC)"

dev-backend: ## Start only backend in development
	@cd backend && npm run dev

dev-bot: ## Start only bot in development
	@cd bot && npm run dev

dev-webapp: ## Start only webapp in development
	@cd webapp && npm run dev

# ===== Docker =====

build: ## Build all Docker images
	@echo "$(CYAN)Building Docker images...$(NC)"
	@docker-compose build
	@echo "$(GREEN)✓ Images built$(NC)"

start: ## Start all services with Docker Compose
	@echo "$(CYAN)Starting all services...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)✓ Services started$(NC)"
	@make status

stop: ## Stop all services
	@echo "$(YELLOW)Stopping all services...$(NC)"
	@docker-compose stop
	@echo "$(GREEN)✓ Services stopped$(NC)"

restart: ## Restart all services
	@echo "$(YELLOW)Restarting all services...$(NC)"
	@docker-compose restart
	@echo "$(GREEN)✓ Services restarted$(NC)"

down: ## Stop and remove all containers
	@echo "$(RED)Stopping and removing containers...$(NC)"
	@docker-compose down
	@echo "$(GREEN)✓ Containers removed$(NC)"

# ===== Logs =====

logs: ## Show logs from all services
	@docker-compose logs -f

logs-backend: ## Show backend logs
	@docker-compose logs -f backend

logs-bot: ## Show bot logs
	@docker-compose logs -f bot

logs-webapp: ## Show webapp logs
	@docker-compose logs -f webapp

logs-db: ## Show database logs
	@docker-compose logs -f postgres

# ===== Database =====

migrate: ## Run database migrations
	@echo "$(CYAN)Running database migrations...$(NC)"
	@cd backend && node database/migrations.js
	@echo "$(GREEN)✓ Migrations complete$(NC)"

seed: ## Seed database with test data
	@echo "$(CYAN)Seeding database...$(NC)"
	@cd backend && node database/migrations.js --seed
	@echo "$(GREEN)✓ Database seeded$(NC)"

db-reset: ## Reset database (drop all tables and recreate)
	@echo "$(RED)Resetting database...$(NC)"
	@cd backend && node database/migrations.js --drop --seed
	@echo "$(GREEN)✓ Database reset$(NC)"

db-shell: ## Open PostgreSQL shell
	@docker-compose exec postgres psql -U admin -d telegram_shop

db-backup: ## Backup database
	@echo "$(CYAN)Creating database backup...$(NC)"
	@mkdir -p backups
	@docker-compose exec -T postgres pg_dump -U admin telegram_shop > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)✓ Backup created$(NC)"

db-restore: ## Restore database from latest backup (use BACKUP=filename to specify)
	@echo "$(YELLOW)Restoring database...$(NC)"
	@docker-compose exec -T postgres psql -U admin telegram_shop < $$(ls -t backups/*.sql | head -1)
	@echo "$(GREEN)✓ Database restored$(NC)"

# ===== Testing =====

test: ## Run all tests
	@echo "$(CYAN)Running tests...$(NC)"
	@cd backend && npm test
	@cd bot && npm test
	@cd webapp && npm test

test-backend: ## Run backend tests
	@cd backend && npm test

test-bot: ## Run bot tests
	@cd bot && npm test

test-webapp: ## Run webapp tests
	@cd webapp && npm test

# ===== Cleanup =====

clean: ## Clean all node_modules and build files
	@echo "$(RED)Cleaning project...$(NC)"
	@rm -rf backend/node_modules backend/logs
	@rm -rf bot/node_modules bot/logs
	@rm -rf webapp/node_modules webapp/dist
	@echo "$(GREEN)✓ Project cleaned$(NC)"

clean-docker: ## Remove all Docker containers, volumes, and images
	@echo "$(RED)Cleaning Docker resources...$(NC)"
	@docker-compose down -v --rmi all
	@echo "$(GREEN)✓ Docker resources cleaned$(NC)"

# ===== Utility =====

status: ## Show status of all services
	@echo "$(CYAN)Service Status:$(NC)"
	@docker-compose ps

health: ## Check health of all services
	@echo "$(CYAN)Checking service health...$(NC)"
	@curl -s http://localhost:3000/health || echo "$(RED)✗ Backend not responding$(NC)"
	@curl -s http://localhost/health || echo "$(RED)✗ WebApp not responding$(NC)"
	@docker-compose exec postgres pg_isready -U admin || echo "$(RED)✗ Database not ready$(NC)"

env: ## Create .env file from .env.example
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN)✓ .env file created. Please edit it with your values.$(NC)"; \
	else \
		echo "$(YELLOW)⚠ .env file already exists$(NC)"; \
	fi
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo "$(GREEN)✓ backend/.env file created$(NC)"; \
	fi
	@if [ ! -f bot/.env ]; then \
		cp bot/.env.example bot/.env; \
		echo "$(GREEN)✓ bot/.env file created$(NC)"; \
	fi
	@if [ ! -f webapp/.env ]; then \
		cp webapp/.env.example webapp/.env; \
		echo "$(GREEN)✓ webapp/.env file created$(NC)"; \
	fi

setup: env install ## Complete setup (create env files and install dependencies)
	@echo "$(GREEN)✓ Setup complete! Edit .env files and run 'make dev' to start.$(NC)"

# ===== Production =====

prod-build: ## Build for production
	@echo "$(CYAN)Building for production...$(NC)"
	@cd webapp && npm run build
	@docker-compose build
	@echo "$(GREEN)✓ Production build complete$(NC)"

prod-start: ## Start production environment
	@echo "$(CYAN)Starting production environment...$(NC)"
	@docker-compose -f docker-compose.yml up -d
	@echo "$(GREEN)✓ Production started$(NC)"

prod-logs: ## Show production logs
	@docker-compose -f docker-compose.yml logs -f

# Default target
.DEFAULT_GOAL := help
