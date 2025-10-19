# Telegram Shop WebApp

Production-ready React WebApp для Telegram Mini App E-Commerce платформы.

## Технологии

- **React 18** - UI библиотека
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Framer Motion** - Анимации
- **Zustand** - State management
- **Axios** - HTTP клиент
- **@twa-dev/sdk** - Telegram WebApp SDK

## Структура проекта

```
webapp/
├── src/
│   ├── components/      # Переиспользуемые компоненты
│   │   ├── Layout/      # Layout компоненты (Header, TabBar)
│   │   ├── Shop/        # Компоненты магазинов
│   │   ├── Product/     # Компоненты товаров
│   │   ├── Cart/        # Корзина покупок
│   │   └── Payment/     # Компоненты оплаты
│   ├── pages/           # Страницы приложения
│   ├── hooks/           # Custom React hooks
│   ├── store/           # Zustand store
│   ├── styles/          # Глобальные стили
│   └── utils/           # Утилиты
├── public/              # Статические файлы
└── dist/                # Build output
```

## Установка

```bash
cd webapp
npm install
```

## Разработка

```bash
npm run dev
```

Приложение будет доступно на `http://localhost:5173`

## Production Build

```bash
npm run build
```

Build будет создан в папке `dist/`

## Дизайн-система

### Цвета
- Background: `#0A0A0A`
- Cards: `#1A1A1A`
- Elevated: `#252525`
- Primary Orange: `#FF6B00`
- Light Orange: `#FF8533`
- Accent Orange: `#FFA366`

### Шрифты
- Inter (400, 500, 600, 700, 800)

### Эффекты
- Glassmorphism: `backdrop-blur-lg` + `bg-opacity-50`
- Transitions: `duration-300 ease-in-out`
- Touch targets: минимум `44px`

## State Management

**ВАЖНО:** Приложение использует только in-memory state:
- React state (useState, useReducer)
- Zustand store (без persist middleware)
- НЕ используется localStorage/sessionStorage

Данные сохраняются только через API вызовы.

## Telegram Integration

- Авторизация через `window.Telegram.WebApp.initData`
- Haptic feedback для взаимодействий
- Main Button для основных действий
- Back Button для навигации
- Popup для диалогов

## API Integration

Все API вызовы через custom hook `useApi`:

```javascript
const { get, post, loading, error } = useApi();

// GET запрос
const { data } = await get('/shops');

// POST запрос
const { data } = await post('/orders', orderData);
```

## Компоненты

### Layout
- `Header` - Верхний header с корзиной
- `TabBar` - Нижняя навигация (3 таба)

### Shop
- `ShopCard` - Карточка магазина
- `ShopList` - Список магазинов

### Product
- `ProductCard` - Карточка товара (2-column grid)
- `ProductGrid` - Сетка товаров

### Cart
- `CartSheet` - Bottom sheet с корзиной
- `CartItem` - Элемент корзины

### Payment
- `CryptoSelector` - Выбор криптовалюты

## Страницы

1. **Subscriptions** (`/`) - Активные подписки пользователя
2. **Catalog** - Каталог магазинов и товаров
3. **Settings** - Настройки аккаунта

## Анимации

Все анимации через Framer Motion:
- Page transitions
- List animations (stagger)
- Tap animations (scale)
- Layout animations (layoutId)

## Responsive Design

- Mobile-first подход
- Safe area support (iOS notch)
- Touch-friendly интерфейс
- Optimized для Telegram WebApp

## Environment Variables

Создайте `.env` файл:

```env
VITE_API_URL=http://localhost:3000/api
```

## License

Private
