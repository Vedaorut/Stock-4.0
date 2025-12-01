# 🎯 MCP Grep Server - Настройка для Claude Code

MCP Grep Server уже установлен! Теперь настроим его для Claude Code.

## 📝 Настройка Claude Code

### Метод 1: Через конфигурационный файл (Рекомендуется)

1. **Найти или создать файл конфигурации:**
   - Файл находится в `~/.claude.json`
   - Если файла нет, создай его

2. **Добавить конфигурацию MCP сервера:**

Открой файл `~/.claude.json` и добавь (или обнови) секцию `mcpServers`:

```json
{
  "mcpServers": {
    "grep_app": {
      "command": "node",
      "args": ["/Users/sile/.mcp-servers/grep_app_mcp/dist/server-stdio.js"],
      "env": {}
    }
  }
}
```

3. **Сохранить и перезапустить Claude Code**

### Метод 2: Через CLI (Альтернатива)

Если у тебя установлен Claude Code CLI:

```bash
claude mcp add grep_app --command node --args /Users/sile/.mcp-servers/grep_app_mcp/dist/server-stdio.js
```

## ✅ Проверка работы

После настройки:

1. Запусти Claude Code
2. Используй команду `/mcp` чтобы проверить статус серверов
3. Попробуй поиск кода:
   - "Search for React hooks examples in popular repositories"
   - "Find TypeScript interface patterns"
   - "Show me Express.js middleware examples"

## 🔧 Возможности

Claude Code теперь может:
- 🔍 Искать код в миллионах GitHub репозиториев
- 📄 Получать файлы из репозиториев
- 📦 Работать с пакетами файлов
- 🎯 Находить паттерны и примеры кода

## 🐛 Решение проблем

Если MCP сервер не работает:

1. **Проверь путь к файлу:**
   ```bash
   ls -la /Users/sile/.mcp-servers/grep_app_mcp/dist/server-stdio.js
   ```

2. **Проверь конфигурацию:**
   ```bash
   cat ~/.claude.json
   ```

3. **Перезапусти Claude Code полностью**

4. **Используй debug режим:**
   ```bash
   claude --mcp-debug
   ```

## 📚 Команды для поиска

Примеры того, что можно спросить у Claude Code:

- "Search grep.app for authentication examples in Next.js"
- "Find error handling patterns in Express.js"
- "Show me how to use useState with TypeScript"
- "Find examples of API integration in React"

---

**Примечание:** Сервер использует бесплатный grep.app API, никаких дополнительных ключей не требуется!
