# Bot Design Principles - Status Stock Telegram Bot

Руководство по UX/UI для минималистичного Telegram e-commerce бота на основе best practices 2025.

---

## 🔍 Key Findings from Research

### Источники исследования:
- Telegram Official Bot Guidelines
- Telegraf.js Documentation & Best Practices
- Успешные боты: DropMail.me, QuizBot, Faino
- E-commerce bot patterns (Shopify bots, marketplace bots)
- UX research articles на minimalist bot design

---

## 📝 Message Style Guidelines

### Оптимальная длина сообщений:
- ✅ **2-3 строки текста** для минималистичного подхода
- ✅ **Технический лимит**: 4096 символов (Telegram API)
- ✅ **Практический лимит**: 100-150 символов для лучшей читаемости

### Tone of Voice:
> "Brief, to the point and on topic" - Telegram Official Guidelines

- **Professional** но не формальный
- **Минималистичный** - каждое слово на вес золота
- **Actionable** - фокус на следующий шаг, не на объяснения
- **Consistent** - одинаковый tone во всех сообщениях

### Emoji Usage:
- ✅ **Только в кнопках** для visual clarity
- ❌ **НЕ в основном тексте** сообщений (делает текст шумным)
- ✅ Максимум **1 emoji на кнопку**
- ✅ Standard Unicode emoji (custom требует Telegram Premium)

### ❌ ПЛОХО vs ✅ ХОРОШО:

**❌ ПЛОХО:**
```
👋 Привет! Добро пожаловать в наш замечательный бот! 🎉
Мы очень рады что вы здесь! Здесь вы можете создавать 
магазины, продавать товары, покупать у других продавцов 
и многое другое! Давайте начнём? 🚀
```

**✅ ХОРОШО:**
```
Telegram Shop

Выберите роль:
```

---

## ⌨️ Keyboard Layout Best Practices

### Оптимальное количество кнопок:
- ✅ **3-5 кнопок** на экран (больше overwhelms пользователей)
- ✅ **2 колонки** для main actions
- ✅ **1 колонка** для navigation (Back, Home)

### Структура клавиатуры:
```
[Primary Action 1]  [Primary Action 2]
[Secondary Action]
[« Назад]
```

### Button Text Guidelines:
- **Максимум 20 символов** на кнопку
- **Глаголы** для действий (Добавить, Найти, Открыть)
- **Существительные** для навигации (Товары, Продажи, Подписки)
- **Emoji prefix** для visual clarity

### Back Button - КРИТИЧЕСКИ ВАЖЕН:
> "Users panic without an escape route" - UX Research

- ✅ **Всегда** предоставлять кнопку "Назад"
- ✅ Последняя позиция в клавиатуре
- ✅ Emoji: `«` или `◀️`

### Inline vs Reply Keyboards:
- ✅ **Inline keyboards**: smoother UX, edit messages вместо send new
- ❌ **Reply keyboards**: занимают много места, устаревший подход
- ✅ **Web App buttons**: для сложных интерфейсов

---

## 🎯 User Flow Patterns

### 1. Registration Flow (Multi-step):
```
Start → Select Currency → Show Address → Enter TX Hash → Verify → Complete
```

**Best Practices:**
- Finite State Machine (FSM) для tracking progress
- Показывать текущий шаг (1/4, 2/4, etc.)
- Всегда кнопка "Отменить" для выхода
- Сохранять progress (можно вернуться)

### 2. Navigation Patterns:
```
Main Menu
├── Seller Menu
│   ├── Add Product (Scene)
│   ├── My Products (WebApp)
│   └── Sales (WebApp)
└── Buyer Menu
    ├── Search Shop (Scene)
    ├── Subscriptions (List)
    └── Orders (WebApp)
```

**Best Practices:**
- **Breadth-first** навигация (мало уровней, больше опций)
- **Home button** на глубине 3+ levels
- **Chain of Responsibility** pattern для routing

### 3. Payment Flow:
```
Select Currency → Display Address → Wait TX Hash → Verify → Success
```

**Best Practices:**
- Seamless - без персональных данных
- Real-time verification через blockchain APIs
- Clear feedback на каждом шаге
- Timeout handling (10-15 минут)

### 4. Error Handling:
```
Error → User-friendly message → Suggested action → Retry/Back button
```

**Best Practices:**
- ❌ НЕ показывать technical errors
- ✅ Понятные сообщения ("Магазин не найден")
- ✅ Предлагать альтернативу ("Попробуйте другое название")
- ✅ Логировать детали для debugging

---

## 🏆 Examples from Best Bots

### 1. DropMail.me (@DropMailBot)
**Что хорошо:**
- Мгновенная генерация email - 1 кнопка
- Минимум текста: "Your temporary email:"
- Inline keyboard для всех действий

**Lesson:** Одна функция = один экран

### 2. QuizBot (@QuizBot)
**Что хорошо:**
- Четкие кнопки с emoji
- Короткие prompts
- FSM для quiz creation flow

**Lesson:** Пошаговый подход для сложных flows

### 3. Faino (marketplace bot)
**Что хорошо:**
- Products в WebApp, navigation в боте
- Notifications через бота
- Минимализм в тексте

**Lesson:** Bot = hub, WebApp = content

---

## 🚀 Our Implementation Strategy

### Design Philosophy:
```
✅ Минимализм: 2-3 строки текста, 3-4 кнопки
✅ Emoji только в кнопках
✅ Товары ТОЛЬКО в WebApp (catalog слишком сложен для бота)
✅ Bot = navigation hub, WebApp = content consumption
✅ FSM для multi-step flows (регистрация, payment)
✅ Inline keyboards везде где возможно
```

### Seller Flow:

**1. Registration ($25):**
```
Регистрация магазина - $25

Выберите валюту:
[₿ Bitcoin] [Ξ Ethereum]
[₮ USDT]    [Ł Litecoin]
```

**2. After Currency Selection:**
```
Отправьте на адрес:
bc1q...xyz

Затем отправьте хэш транзакции
[« Отменить]
```

**3. Seller Menu:**
```
Мой магазин: TechStore Pro

[➕ Добавить товар]
[📦 Мои товары]
[💰 Продажи]
[📱 Приложение]
```

### Buyer Flow:

**1. Search:**
```
Введите название магазина
[« Назад]
```

**2. Buyer Menu:**
```
Мои покупки

[🔍 Найти магазин]
[📚 Подписки]
[🛒 Заказы]
[📱 Приложение]
```

---

## 📋 Recommended Message Templates

### /start Command:
```
Telegram Shop

Выберите роль:
[🛍 Покупатель]
[💼 Продавец]
```

### Seller - Create Shop:
```
Регистрация магазина - $25

Выберите валюту:
[₿ BTC] [Ξ ETH] [₮ USDT] [Ł LTC]
```

### Seller - Add Product:
```
Добавить товар

Отправьте название товара:
[« Отменить]
```

### Buyer - Search Result:
```
TechStore Pro
Продавец: @john

[✓ Подписаться]
[📱 Открыть магазин]
[« Назад]
```

### Payment Success:
```
✓ Оплата подтверждена

Ваш магазин активирован!
[📱 Открыть приложение]
```

### Error - Shop Not Found:
```
Магазин не найден

Попробуйте другое название
[🔍 Поиск] [« Назад]
```

---

## 🎨 Visual Design Consistency

### Emoji Guide:
```
🛍 - Покупатель
💼 - Продавец
➕ - Добавить
📦 - Товары
💰 - Продажи/Деньги
🔍 - Поиск
📚 - Подписки
🛒 - Заказы
📱 - Приложение/WebApp
✓ - Успех
« - Назад
◀️ - Назад (альтернатива)
₿ - Bitcoin
Ξ - Ethereum
₮ - USDT
Ł - Litecoin
```

### Button Naming Convention:
```javascript
// Actions: Verb + Noun
"➕ Добавить товар"
"🔍 Найти магазин"
"📱 Открыть приложение"

// Navigation: Noun only
"📦 Товары"
"💰 Продажи"
"🛒 Заказы"

// Back: Arrow + Text
"« Назад"
"« Отменить"
```

---

## 🔧 Technical Implementation Notes

### 1. Message Editing vs Sending:
```javascript
// ✅ ХОРОШО: Edit existing message
await ctx.editMessageText('New text', { reply_markup: keyboard });

// ❌ ПЛОХО: Send new message (спам)
await ctx.reply('New text', { reply_markup: keyboard });
```

### 2. FSM для Multi-step Flows:
```javascript
// Telegraf Scenes для complex flows
const createShopScene = new Scenes.WizardScene(
  'createShop',
  selectCurrency,
  showAddress,
  verifyPayment,
  enterShopName,
  complete
);
```

### 3. Error Handling Pattern:
```javascript
try {
  const result = await api.createShop(data);
  await ctx.editMessageText('✓ Магазин создан');
} catch (error) {
  logger.error('Create shop failed:', error);
  await ctx.editMessageText(
    'Не удалось создать магазин\n\nПопробуйте позже',
    { reply_markup: backButton }
  );
}
```

### 4. Inline Keyboard Structure:
```javascript
const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '🛍 Покупатель', callback_data: 'buyer' }],
    [{ text: '💼 Продавец', callback_data: 'seller' }]
  ]
};
```

---

## ✅ Checklist для Review

При создании новой feature:
- [ ] Сообщение не длиннее 3 строк?
- [ ] Не больше 4 кнопок на экран?
- [ ] Emoji только в кнопках, не в тексте?
- [ ] Есть кнопка "Назад"?
- [ ] Error messages понятны пользователю?
- [ ] Используется edit message вместо send new?
- [ ] FSM для multi-step flows?
- [ ] Логирование всех ошибок?

---

## 🎯 Key Takeaways

1. **Краткость** - каждое слово на вес золота
2. **Действие** - фокус на next step, not explanation
3. **Безопасность** - всегда Back button
4. **Консистентность** - один tone of voice
5. **Делегирование** - сложные UI в WebApp
6. **FSM** - для всех multi-step flows
7. **Edit не Send** - smoother UX
8. **User-friendly errors** - понятные сообщения

---

**Этот документ должен быть reference для всех решений по UX/UI бота.**
