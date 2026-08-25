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
        // ★ primary 语义色：对齐 travel 暖陶土（原为天蓝 #0ea5e9，与暖陶土品牌冲突）
        //   改为品牌主色后，admin 主按钮/聚焦环/上传态全局统一，一次性消除 primary 蓝残留
        primary: {
          50: '#F3E4D5', 100: '#E8D5C0', 200: '#D4B9A0', 300: '#C2A082',
          400: '#B08663', 500: '#A85F3A', 600: '#8A4A2B', 700: '#7A3F24',
          800: '#6A351E', 900: '#5A2C18',
        },
        // ★ 新增 travel 暖色调系列（项目主色调）
        travel: {
          cream: '#FAF6EE',    // 主背景（暖米白）
          ink: '#585450',       // 主文字（暖墨灰）
          dim: '#DAD5CB',       // 次要边框（暖浅灰）
          sakura: '#F3E4D5',    // 暖米（浅）
          bloom: '#E4B478',     // 琥珀暖（深色模式强调）
          sky: '#A8C8DC',       // 天空蓝
          mist: '#D6E8F0',      // 雾蓝（浅）
          accent: '#A85F3A',   // 陶土暖棕（主强调）
          accentStrong: '#8A4A2B', // 陶土深（hover/强调强）
          accentSoft: '#C97E55',  // 陶土浅（次级文字/浅强调）
          sand: '#8B7355',        // 暖棕（纸面次级文字）
          sandSoft: '#C2AF9A',     // 暖棕浅（暗色模式次级）
          sandLight: '#E4D6C4',    // 暖米（暗色模式强调）
          parchment: '#FDF5ED',    // 羊皮纸亮
          parchmentDim: '#F5EDE4', // 羊皮纸亮-渐变色
          inkStrong: '#5A4A3A',    // 暖深棕标题
          line: '#E8DDD4',         // 暖浅边框
        },
                        // ★ 像素风木屋/纸面肤色（Stage 1 引入）
        pixel: {
          ink: '#5a3b30',
          muted: '#8a7662',
          faint: '#8a8479',
          line: '#3c2a1a',
          photo: '#211713',
          panel: '#1c110d',
          panel2: '#2c1913',
          panel3: '#231611',
          paper: '#FDF5ED',
          online: '#5b8731',
          bubble: '#70b237',
          lineLight: '#d8c9a6',
          error: '#a02a2a',
          goldLight: '#fce268',
          goldPale: '#f3d7a0',
        },
        // ★ 相册暗色视觉系统（Stage 1：Album Design Tokens）
        album: {
          bg0: '#050508',
          bg1: '#0b0807',
          bg2: '#14100e',
          surface: 'rgba(255,255,255,0.06)',
          text1: 'rgba(245,247,255,0.92)',
          text2: 'rgba(245,247,255,0.68)',
          text3: 'rgba(245,247,255,0.45)',
          warm: '#a89f91',
          accent: '#e8b06a',
          accentStrong: '#f5c97e',
          accentDim: 'rgba(232,176,106,0.16)',
          ok: '#6fcf97',
          sync: '#f5c97e',
          wait: '#9aa3b2',
          error: '#e06c6c',
        },
        // ★ 旅行记忆宇宙（Stage 3：个人主页 / 旅行圈统一暗色 Editorial）
        night: {
          bg: '#080808',
          surface: '#111111',
          surface2: '#171717',
          surface3: '#1e1d1b',
          text: '#F5F1EA',
          muted: 'rgba(245,241,234,0.70)',
          faint: 'rgba(245,241,234,0.46)',
          gold: '#E8B36A',
          goldStrong: '#F2C88A',
          goldSoft: 'rgba(232,179,106,0.14)',
          line: 'rgba(245,241,234,0.09)',
          lineStrong: 'rgba(245,241,234,0.16)',
        },
        // ★ 新增语义化颜色
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
        // ★ travel 语义色（Phase2 对齐命名；色值与上方 success/warning/danger 保持一致）
        'travel-success': '#22c55e',
        'travel-warning': '#f59e0b',
        'travel-danger': '#ef4444',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'Noto Serif', 'Georgia', 'serif'],
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
        // ★ Phase2 归一 Typography Scale（命名 step，便于收敛内联 text-[xx]）
        'display-hero': ['3rem', { lineHeight: '1.12' }],     // 48px 首页/档案 hero
        'display-1': ['2.25rem', { lineHeight: '1.25' }],     // 36px 页级 H1
        'display-2': ['1.5rem', { lineHeight: '1.4' }],       // 24px 区块 H2
        'heading': ['1.125rem', { lineHeight: '1.5' }],       // 18px 卡片标题
        'body-lg': ['1.125rem', { lineHeight: '1.7' }],       // 18px 大正文
        'caption': ['0.75rem', { lineHeight: '1.5' }],        // 12px meta/标签
        'data': ['1.75rem', { lineHeight: '1.2' }],           // 28px 数据大数
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






