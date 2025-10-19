#!/bin/bash

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}║   🚀 Telegram Shop Platform                           ║${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Проверка Node.js
echo -e "${CYAN}📋 Checking requirements...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo -e "${YELLOW}Please install Node.js 18+ from https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# Проверка npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm v${NPM_VERSION}${NC}"

# Проверка PostgreSQL
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(psql --version | awk '{print $3}')
    echo -e "${GREEN}✓ PostgreSQL ${PSQL_VERSION}${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL not found in PATH${NC}"
    echo -e "${YELLOW}  (но может быть установлен через Homebrew)${NC}"
fi

echo ""

# Проверка .env файлов
echo -e "${CYAN}📝 Checking configuration files...${NC}"

if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}⚠ backend/.env not found${NC}"
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo -e "${GREEN}✓ Created backend/.env from .env.example${NC}"
        echo -e "${BLUE}  Please edit backend/.env with your values${NC}"
    elif [ -f ".env.example" ]; then
        cp .env.example backend/.env
        echo -e "${GREEN}✓ Created backend/.env from root .env.example${NC}"
    else
        echo -e "${RED}❌ No .env.example file found${NC}"
    fi
else
    echo -e "${GREEN}✓ backend/.env exists${NC}"
fi

echo ""

# Проверка зависимостей
echo -e "${CYAN}📦 Checking dependencies...${NC}"

NEED_INSTALL=false

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Root dependencies not found${NC}"
    NEED_INSTALL=true
fi

if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}⚠ Backend dependencies not found${NC}"
    NEED_INSTALL=true
fi

if [ ! -d "webapp/node_modules" ]; then
    echo -e "${YELLOW}⚠ WebApp dependencies not found${NC}"
    NEED_INSTALL=true
fi

if [ "$NEED_INSTALL" = true ]; then
    echo ""
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    echo -e "${CYAN}This may take a few minutes...${NC}"
    echo ""

    npm install

    if [ ! -d "backend/node_modules" ]; then
        echo -e "${CYAN}Installing backend dependencies...${NC}"
        cd backend && npm install && cd ..
    fi

    if [ ! -d "webapp/node_modules" ]; then
        echo -e "${CYAN}Installing webapp dependencies...${NC}"
        cd webapp && npm install && cd ..
    fi

    echo ""
    echo -e "${GREEN}✓ All dependencies installed${NC}"
else
    echo -e "${GREEN}✓ All dependencies are installed${NC}"
fi

echo ""

# Проверка БД
echo -e "${CYAN}🗄  Checking database...${NC}"

if command -v psql &> /dev/null; then
    if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw telegram_shop; then
        echo -e "${GREEN}✓ Database 'telegram_shop' exists${NC}"
    else
        echo -e "${YELLOW}⚠ Database 'telegram_shop' not found${NC}"
        echo -e "${BLUE}  Create with: ${CYAN}npm run db:setup${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Cannot check database (psql not available)${NC}"
fi

echo ""

# Проверка портов
echo -e "${CYAN}🔌 Checking ports...${NC}"

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠ Port 3000 is already in use${NC}"
    echo -e "${BLUE}  Backend may fail to start${NC}"
else
    echo -e "${GREEN}✓ Port 3000 is available${NC}"
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠ Port 5173 is already in use${NC}"
    echo -e "${BLUE}  WebApp may use another port${NC}"
else
    echo -e "${GREEN}✓ Port 5173 is available${NC}"
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}║   🚀 Starting services...                             ║${NC}"
echo -e "${BLUE}║                                                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${MAGENTA}Backend:${NC}  http://localhost:3000"
echo -e "${MAGENTA}WebApp:${NC}   http://localhost:5173"
echo -e "${MAGENTA}Health:${NC}   http://localhost:3000/health"
echo ""
echo -e "${CYAN}Press ${YELLOW}Ctrl+C${CYAN} to stop${NC}"
echo ""

# Запуск
npm run dev
