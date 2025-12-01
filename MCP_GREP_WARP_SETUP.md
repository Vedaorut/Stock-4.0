# 🎉 MCP Grep Server - Инструкция по настройке Warp

MCP Grep Server успешно установлен! Теперь нужно настроить Warp Terminal для его использования.

## ✅ Что уже сделано

- ✅ Репозиторий склонирован в `/Users/sile/.mcp-servers/grep_app_mcp`
- ✅ Зависимости установлены
- ✅ Проект собран
- ✅ Файл `server-stdio.js` создан

## 📝 Настройка Warp Terminal

### Шаг 1: Открыть настройки MCP в Warp

Откройте настройки MCP серверов одним из способов:
- `Settings > MCP Servers`
- `Warp Drive > Personal > MCP Servers`
- `Command Palette` (поиск "Open MCP Servers")
- `Settings > AI > Manage MCP servers`

### Шаг 2: Добавить новый MCP сервер

Нажмите кнопку **"+ Add"** и вставьте следующую конфигурацию:

```json
{
  "grep_app": {
    "command": "node",
    "args": ["/Users/sile/.mcp-servers/grep_app_mcp/dist/server-stdio.js"],
    "env": {},
    "working_directory": "/Users/sile/.mcp-servers/grep_app_mcp"
  }
}
```

### Шаг 3: Сохранить и перезапустить Warp

После добавления конфигурации:
1. Сохраните настройки
2. Перезапустите Warp Terminal (или просто закройте и откройте заново)

## 🧪 Тестирование

После настройки попробуйте использовать Warp AI для поиска кода:

**Примеры запросов:**
- "Search for React useState examples in popular repositories"
- "Find TypeScript async/await patterns"
- "Show me examples of Express.js middleware"

Warp AI теперь сможет искать код в миллионах публичных GitHub репозиториев через grep.app!

## 🔧 Возможности MCP Grep Server

- **searchCode** - Поиск кода по ключевым словам
- **github_file** - Получение конкретного файла из репозитория
- **github_batch_files** - Пакетное получение файлов
- **batch_retrieve_files** - Массовое получение файлов

## 📚 Дополнительная информация

- Репозиторий: https://github.com/ai-tools-all/grep_app_mcp
- API: grep.app (бесплатный доступ)
- Поддержка: Node.js 18+

---

**Примечание:** Сервер использует бесплатный API grep.app для поиска в публичных GitHub репозиториях. Никаких дополнительных ключей API не требуется!
