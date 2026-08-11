/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      },
      colors: {
        // 保留现有 primary 蓝色系
        primary: {
          50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
          400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
          800: '#075985', 900: '#0c4a6e',
        },
        // ★ 新增 travel 暖色调系列（项目主色调）
        travel: {
          cream: '#FAFBF7',    // 主背景（米白）
          ink: '#5A6670',       // 主文字（深灰）
          dim: '#D8DDD8',       // 次要边框（浅灰）
          sakura: '#F5DCE0',    // 樱花粉（浅）
          bloom: '#E8B8C2',     // 樱花粉（深，主强调色）
          sky: '#A8C8DC',       // 天空蓝
          mist: '#D6E8F0',      // 雾蓝（浅）
        },
        // ★ 新增语义化颜色
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
      fontFamily: {
        sans: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        zpix: ['Zpix', 'monospace', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        'soft': '0 10px 28px rgba(90,102,112,0.08)',
        'card': '0 12px 40px -12px rgba(90,102,112,0.18)',
        'glow-bloom': '0 0 12px rgba(232,184,194,0.4)',
        'glow-sky': '0 0 12px rgba(168,200,220,0.4)',
      },
      transitionTimingFunction: {
        'ease-out-soft': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'ease-in-out-soft': 'cubic-bezier(0.45, 0, 0.55, 1)',
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.8s ease-out forwards',
        'fade-down': 'fade-down 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-down': {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // 兼容 app/travel/[slug]/TravelDetailClient.tsx 内联动画引用
        'textReveal': {
          '0%': { opacity: '0', transform: 'translateY(40px) scale(0.92)', letterSpacing: '0.15em', filter: 'blur(8px)' },
          '50%': { opacity: '0.8', filter: 'blur(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', letterSpacing: '0.02em', filter: 'blur(0)' },
        },
        'fadeSlideUp': {
          '0%': { opacity: '0', transform: 'translateY(24px)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
