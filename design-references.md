# 🎨 Дизайн-референсы для Status Stock

Исследование современных дизайн-паттернов от ведущих tech-компаний.

---

## 🌈 Градиенты

### Anthropic
- Тёплые градиенты для hero sections
- Вертикальные переходы (180deg)
- Subtle, не агрессивные

### Linear
- Вертикальные subtle градиенты: `#08090a → #060708`
- LCH color space для natural transitions
- Градиенты на hover состояниях

### Vercel
- Минималистичные градиенты
- Черный к очень темно-серому
- Фокус на контенте

### Для Status Stock Orange (#FF6B00):
```css
/* Primary button gradient */
background: linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%);

/* Hover state */
background: linear-gradient(135deg, #FF8F3D 0%, #FFB574 100%);

/* Subtle card overlay */
background: linear-gradient(145deg,
  rgba(255, 107, 0, 0.05) 0%,
  rgba(255, 143, 61, 0.02) 100%
);

/* Radial glow on hover */
background: radial-gradient(
  600px circle at center,
  rgba(255, 107, 0, 0.08),
  transparent 40%
);
```

---

## 💎 Multi-layer Shadows

### Josh Comeau Method (используется в Linear, Raycast):
```css
box-shadow:
  0 1px 1px hsl(0deg 0% 0% / 0.075),
  0 2px 2px hsl(0deg 0% 0% / 0.075),
  0 4px 4px hsl(0deg 0% 0% / 0.075),
  0 8px 8px hsl(0deg 0% 0% / 0.075),
  0 16px 16px hsl(0deg 0% 0% / 0.075);
```

### Product Card Shadow:
```css
box-shadow:
  0 1px 2px rgba(0, 0, 0, 0.3),
  0 4px 12px rgba(0, 0, 0, 0.2),
  0 0 0 1px rgba(255, 255, 255, 0.05),
  inset 0 1px 0 rgba(255, 255, 255, 0.05);
```

### Orange Button Shadow (colored glow):
```css
box-shadow:
  0 4px 12px rgba(255, 107, 0, 0.3),
  0 8px 24px rgba(255, 107, 0, 0.15),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
```

### Bottom Sheet Shadow:
```css
box-shadow:
  0 -8px 32px rgba(0, 0, 0, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.1);
```

---

## 🪟 Glassmorphism

### Arc Browser Style:
```css
background: rgba(26, 26, 26, 0.7);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.08);
```

### Raycast Style:
```css
background: rgba(15, 15, 15, 0.95);
backdrop-filter: blur(40px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.1);
```

### Product Card Glass:
```css
background: linear-gradient(145deg,
  rgba(26, 26, 26, 0.9) 0%,
  rgba(20, 20, 20, 0.95) 100%
);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.08);
```

---

## ✍️ Типографика

### Fonts:
- **Inter** (Anthropic, Linear) - UI standard
- **Geist** (Vercel) - Swiss-inspired, technical
- **SF Pro** (Apple) - system font

### Hierarchy:
```css
/* Display (h1) */
font-size: 28px;
font-weight: 700;
letter-spacing: -0.02em;
line-height: 1.2;

/* Heading (h2, h3) */
font-size: 18-22px;
font-weight: 600;
letter-spacing: -0.01em;
line-height: 1.3;

/* Body */
font-size: 16px;
font-weight: 400;
letter-spacing: 0;
line-height: 1.5;

/* Price/Numbers */
font-size: 24px;
font-weight: 700;
letter-spacing: -0.02em;
font-variant-numeric: tabular-nums;
```

### Tight tracking for large text:
```css
.display-text {
  letter-spacing: -0.02em; /* Tight */
}

.body-text {
  letter-spacing: 0; /* Normal */
}

.small-caps {
  letter-spacing: 0.05em; /* Wide */
  text-transform: uppercase;
}
```

---

## 🎭 Анимации

### Timing:
- **Micro**: 100-150ms
- **Standard**: 200ms
- **Enter/Exit**: 300ms
- **Complex**: 400-500ms

### Easing Functions:
```css
/* Linear - standard */
transition: all 200ms cubic-bezier(0, 0, 0.58, 1);

/* Spring - Framer Motion */
transition: { type: 'spring', stiffness: 400, damping: 30 }

/* Ease-out - most common */
transition: all 200ms ease-out;
```

### Product Card Hover:
```jsx
whileHover={{
  y: -4,
  transition: { duration: 0.2, ease: "easeOut" }
}}
```

### Button Tap:
```jsx
whileTap={{
  scale: 0.98,
  transition: { duration: 0.1 }
}}
```

### Staggered List:
```jsx
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }}
>
  {items.map((item, i) => (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
    >
      {item}
    </motion.div>
  ))}
</motion.div>
```

---

## 📏 Spacing System

### 8px Grid (Linear, Vercel):
```
4px - 8px - 12px - 16px - 24px - 32px - 48px - 64px - 96px
```

### Component Spacing:
```css
/* Cards */
padding: 20px;  /* 5 * 4px */
gap: 12px;      /* 3 * 4px */

/* Buttons */
padding: 12px 24px;  /* 3*4 x 6*4 */

/* Sections */
margin-bottom: 32px;  /* 8 * 4px */
```

---

## 🎨 Color System

### Background:
```css
--bg-primary: #0A0A0A;      /* Soft black */
--bg-elevated: #1A1A1A;     /* Cards */
--bg-card: #141414;         /* Nested cards */
```

### Orange Palette:
```css
--orange-50: #FFF5EB;
--orange-100: #FFE5CC;
--orange-200: #FFCC99;
--orange-300: #FFB366;
--orange-400: #FF9933;
--orange-500: #FF6B00;  /* Primary */
--orange-600: #E55A00;
--orange-700: #CC4E00;
--orange-800: #B24300;
--orange-900: #993800;
```

### Text:
```css
--text-primary: rgba(255, 255, 255, 0.95);
--text-secondary: rgba(255, 255, 255, 0.7);
--text-tertiary: rgba(255, 255, 255, 0.5);
--text-disabled: rgba(255, 255, 255, 0.3);
```

---

## 🏆 Premium Feel Checklist

- [x] Multi-layer shadows вместо одной
- [x] Градиенты на кнопках и акцентах
- [x] Glassmorphism с правильным blur + saturate
- [x] Tight letter-spacing на заголовках
- [x] Spring анимации (не linear)
- [x] Colored shadows для glow эффектов
- [x] Generous spacing (8px grid)
- [x] Tabular numbers для цен
- [x] Backdrop blur на модалах
- [x] Hover states с translateY
- [x] Subtle gradient overlays
- [x] Rounded corners (12-20px)

---

## 🎯 Конкретные компоненты

### Orange Button:
```css
background: linear-gradient(135deg, #FF6B00 0%, #FF8F3D 100%);
color: #fff;
padding: 12px 24px;
border-radius: 12px;
font-weight: 600;
box-shadow:
  0 4px 12px rgba(255, 107, 0, 0.3),
  0 8px 24px rgba(255, 107, 0, 0.15),
  inset 0 1px 0 rgba(255, 255, 255, 0.2);
transition: all 200ms ease-out;
```

### Product Card:
```css
height: 180px;
padding: 20px;
border-radius: 20px;
background: linear-gradient(145deg,
  rgba(26, 26, 26, 0.9) 0%,
  rgba(20, 20, 20, 0.95) 100%
);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.08);
box-shadow:
  0 4px 16px rgba(0, 0, 0, 0.3),
  0 0 0 1px rgba(255, 255, 255, 0.05),
  inset 0 1px 0 rgba(255, 255, 255, 0.05);
```

### Tab Bar:
```css
background: linear-gradient(180deg,
  rgba(26, 26, 26, 0.8) 0%,
  rgba(15, 15, 15, 0.95) 100%
);
backdrop-filter: blur(20px) saturate(180%);
border-top: 1px solid rgba(255, 255, 255, 0.08);
box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
```

---

## 📚 Инструменты

- **Shadow Generator**: https://shadows.brumm.af/
- **Gradient Generator**: https://cssgradient.io/
- **Color Contrast**: https://contrast-ratio.com/
- **Easing Functions**: https://cubic-bezier.com/
- **Motion Examples**: https://www.framer.com/motion/

---

**Итого**: Используем градиенты + multi-layer shadows + glassmorphism + spring анимации + tight tracking = Premium feel! 🚀
