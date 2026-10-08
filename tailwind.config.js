/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          50: '#f7f6f5', 100: '#eceae7', 200: '#d8d4ce', 300: '#b9b2a9', 400: '#8f877c',
          500: '#6e675d', 600: '#57514a', 700: '#3f3b36', 800: '#2a2724', 900: '#1a1816', 950: '#0f0e0d',
        },
        rose: {
          50: '#fff1f3', 100: '#ffe0e5', 200: '#ffc6d0', 300: '#ff9aab', 400: '#fb6480',
          500: '#f2375c', 600: '#e11d48', 700: '#bd123b', 800: '#9e1338', 900: '#871535',
        },
        amber: {
          50: '#fffaeb', 100: '#fff0c6', 200: '#ffe088', 300: '#ffcb4a', 400: '#ffb520',
          500: '#f99307', 600: '#dd6c02', 700: '#b74a06', 800: '#94390c', 900: '#7a300d',
        },
        teal: {
          50: '#effefb', 100: '#c8fff4', 200: '#91feea', 300: '#52f4dc', 400: '#1fdec8',
          500: '#06c2af', 600: '#029c8f', 700: '#077c74', 800: '#0b625e', 900: '#0e514e',
        },
        success: { 50: '#ecfdf3', 100: '#d1fae0', 500: '#16a34a', 600: '#15803d', 700: '#166534' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        error: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'scale-in': { '0%': { opacity: 0, transform: 'scale(.96)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        pulse2: { '0%,100%': { boxShadow: '0 0 0 0 rgba(225,29,72,.45)' }, '50%': { boxShadow: '0 0 0 12px rgba(225,29,72,0)' } },
      },
      animation: {
        'fade-up': 'fade-up .4s ease-out both',
        'scale-in': 'scale-in .2s ease-out both',
        pulse2: 'pulse2 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
