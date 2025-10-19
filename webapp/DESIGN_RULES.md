# Design Rules & Common Issues

## ⚠️ Модальные окна и Overlays

### Проблема: Обрезка снизу
Модальные окна (BottomSheet) могут обрезаться таб-баром.

### Решение:
**Всегда добавляй `pb-20` или `pb-24` в модалки:**

```jsx
// В BottomSheet компоненте
<div className="pb-20 ...">
  {children}
</div>

// Или в контенте модалки
<div className="p-6 pb-20">
  ...
</div>

// В footer модалки
<div className="p-4 pb-20 border-t ...">
  <button>...</button>
</div>
```

### Правило:
**Любой fixed/absolute элемент снизу должен учитывать высоту таб-бара (64-80px)**

---

## 📏 Spacing System

### Tab Bar высота
- Таб-бар: `h-16` (64px) + padding
- Safe area снизу: минимум `pb-20` (80px) для модалок

### Floating элементы
- Кнопка корзины: `bottom-20` (над таб-баром)
- Модалки: `pb-20` или `pb-24`
- Fixed alerts: `bottom-24`

---

## 🎨 Z-Index Layers

```
TabBar:           z-40
Modals backdrop:  z-40
Modals content:   z-50
Floating buttons: z-40
Alerts/Toasts:    z-60
```

---

## 🔧 Quick Fixes

### Модалка обрезана?
→ Добавь `pb-20` или `pb-24`

### Кнопка за таб-баром?
→ Используй `bottom-20` вместо `bottom-0`

### Контент не скроллится?
→ Проверь `max-h-[85vh]` и `overflow-y-auto`

### Footer модалки не виден?
→ Добавь `pb-20` в footer контейнер

---

## 📱 Touch Target Rules

- Минимум: 44px × 44px
- Кнопки: используй класс `touch-target` (определён в globals.css)
- Padding между кликабельными элементами: минимум 8px

---

## 🎭 Анимации

### Modal animations
- Entry: `y: '100%' → y: 0` (spring)
- Exit: `y: 0 → y: '100%'`
- Duration: `damping: 30, stiffness: 380`

### Button animations
- Tap: `scale: 0.98` (spring)
- Hover: `scale: 1.02`

---

## 🌈 Color System

```css
/* Dark theme */
--dark-bg: #0A0A0A;           /* Основной фон */
--dark-card: #1A1A1A;         /* Карточки */
--orange-primary: #FF6B00;    /* Primary */
--orange-light: #FF8533;      /* Hover */

/* Glassmorphism */
backdrop-filter: blur(40px) saturate(180%);
background: linear-gradient(180deg, rgba(26, 26, 26, 0.98) 0%, rgba(15, 15, 15, 0.99) 100%);
```

---

## 📦 Исправленные файлы (2025-10-18)

Список модальных окон с исправленной обрезкой:

1. **BottomSheet.jsx** - базовый компонент (строка 82: `pb-6` → `pb-20`)
   - Автоматически исправляет OrdersModal, WalletsModal, LanguageModal

2. **CartSheet.jsx** - корзина (строка 124: добавлен `pb-20`)

3. **PaymentMethodModal.jsx** - выбор криптовалюты (строка 87: `p-6` → `px-6 pt-6 pb-20`)

4. **PaymentDetailsModal.jsx** - детали оплаты (строка 212: добавлен `pb-20`)

5. **PaymentHashModal.jsx** - ввод TX hash (строка 211: добавлен `pb-20`)

---

## 🚫 Компоненты без изменений

- **OrderStatusModal.jsx** - центральное модальное окно, не конфликтует с таб-баром
- Любые модальные окна без фиксированной позиции снизу

---

## ✅ Checklist для новых модальных окон

Перед созданием нового bottom sheet:

- [ ] Добавлен `pb-20` или `pb-24` в контент/footer
- [ ] Проверена высота при открытой клавиатуре
- [ ] Кнопки не обрезаются таб-баром
- [ ] Контент скроллится до конца
- [ ] z-index не конфликтует с другими слоями
- [ ] Добавлен backdrop с `blur(12px)`
- [ ] Spring анимация для входа/выхода

---

## 📚 Полезные ссылки

- TailwindCSS spacing: https://tailwindcss.com/docs/padding
- Framer Motion: https://www.framer.com/motion/
- Telegram WebApp: https://core.telegram.org/bots/webapps
