/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0A0A0A',
        'dark-card': '#1A1A1A',
        'dark-elevated': '#252525',
        'orange-primary': '#FF6B00',
        'orange-light': '#FF8533',
        'orange-dark': '#CC5500',
        'orange-accent': '#FFA366',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        // Multi-layer premium shadows (Linear-style)
        'premium-sm': `
          0.5px 1px 1px hsl(0deg 0% 0% / 0.7)
        `,
        'premium-md': `
          1px 2px 2px hsl(0deg 0% 0% / 0.333),
          2px 4px 4px hsl(0deg 0% 0% / 0.333),
          3px 6px 6px hsl(0deg 0% 0% / 0.333)
        `,
        'premium-lg': `
          1px 2px 2px hsl(0deg 0% 0% / 0.2),
          2px 4px 4px hsl(0deg 0% 0% / 0.2),
          4px 8px 8px hsl(0deg 0% 0% / 0.2),
          8px 16px 16px hsl(0deg 0% 0% / 0.2),
          16px 32px 32px hsl(0deg 0% 0% / 0.2)
        `,
        // Orange glow shadows
        'glow-orange': '0 0 20px rgba(255, 107, 0, 0.3), 0 0 40px rgba(255, 107, 0, 0.15)',
        'glow-orange-lg': '0 0 30px rgba(255, 107, 0, 0.4), 0 0 60px rgba(255, 107, 0, 0.2)',
      },
      backgroundImage: {
        'gradient-orange': 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)',
        'gradient-orange-hover': 'linear-gradient(135deg, #FF8C42 0%, #FFB366 100%)',
        'gradient-dark': 'linear-gradient(145deg, rgba(26, 26, 26, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)',
        'gradient-bg-subtle': 'linear-gradient(180deg, #0A0A0A 0%, #17212b 100%)',
      },
      fontVariantNumeric: {
        'tabular': 'tabular-nums',
      },
    },
  },
  plugins: [],
}
