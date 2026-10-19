/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    /**
     * ★ 显式声明断点（P1-2）
     *
     * 此前**没有 screens 键**，全部走 Tailwind 默认值。虽然默认值本身是合理的，
     * 但"隐式默认"带来两个问题：
     *   1. 没人知道项目的断点契约是什么，新代码凭感觉选 sm/md/lg；
     *   2. 实测断点用量严重倾斜 —— md 250 处、lg 49 处、xl 仅 8 处、2xl 0 处，
     *      即"md=768 一刀切"，1024–1280 这一最常见的笔记本视口**没有任何专属档位**。
     *
     * 这里把默认值显式固化为契约（数值与 Tailwind 默认一致 → 视觉零变化），
     * 后续新增响应式规则时按此表选择：
     *   sm  640  大屏手机横屏 / 小平板竖屏
     *   md  768  平板竖屏（移动↔桌面分界，MobileBottomNav 的切换点）
     *   lg  1024 小笔记本 / iPad 横屏  ← 此前被忽视的档位
     *   xl  1280 主流笔记本
     *   2xl 1536 大屏/超宽
     */
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
          },
        },
      },
      colors: {
        // ★ semantic.* 语义层（UI-V3 收敛续篇 · 组件与色板解耦的约定层）：
        //   值走 CSS 变量（globals.css :root 亮色 / html.dark 暗色），组件写 bg-semantic-surface
        //   即自动双主题，无需 dark: 变体。新页面/新组件一律用 semantic.*；存量 travel.*/shell.*
        //   逐步迁移（ui/ 组件库已试点）。
        // P2-31：--semantic-* 已是 tokens.css 中 --ui-* 的别名（三层架构的 legacy 兼容层），
        // 因此 bg-semantic-* 实际消费 --ui-* 语义层；无需改 class。
        semantic: {
          bg: 'var(--semantic-bg)',
          surface: 'var(--semantic-surface)',
          surface2: 'var(--semantic-surface2)',
          line: 'var(--semantic-line)',
          text: 'var(--semantic-text)',
          heading: 'var(--semantic-heading)',
          muted: 'var(--semantic-muted)',
          faint: 'var(--semantic-faint)',
          accent: 'var(--semantic-accent)',
          accentStrong: 'var(--semantic-accent-strong)',
          accentSoft: 'var(--semantic-accent-soft)',
          accentWeak: 'var(--semantic-accent-weak)',
          onAccent: 'var(--semantic-on-accent)',
        },
        // ⚠️ deprecated（P2-31）：与 travel.accent* 同值的历史数字阶（admin 存量）。
        //   新代码请用 semantic-accent* / var(--ui-accent*)，本轮保留以维持视觉零变化。
        // ★ primary 语义色：对齐 travel 暖陶土（原为天蓝 #0ea5e9，与暖陶土品牌冲突）
        //   改为品牌主色后，admin 主按钮/聚焦环/上传态全局统一，一次性消除 primary 蓝残留
        // P2-31 B3：RGB 通道化（色值与旧 hex 逐字节相等，保留 /opacity 修饰符）
        primary: {
          50: 'rgb(var(--ui-tw-primary-50-rgb) / <alpha-value>)',
          100: 'rgb(var(--ui-tw-primary-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--ui-tw-primary-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--ui-tw-primary-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--ui-tw-primary-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--ui-tw-primary-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--ui-tw-primary-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--ui-tw-primary-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--ui-tw-primary-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--ui-tw-primary-900-rgb) / <alpha-value>)',
        },
        // ⚠️ deprecated（P2-31）：值与 tokens.css 的 --ui-travel-* / --palette-* 同源；
        //   含 775 处 /opacity 用法，直接改 var() 会破坏透明度修饰符，存量保留。
        // ★ travel 暖色调系列（项目主色调）→ --ui-travel-*（CSS 变量侧唯一源）
        // P2-31 B3：RGB 通道化（色值与旧 hex 逐字节相等，保留 /opacity 修饰符）
        travel: {
          cream: 'rgb(var(--ui-tw-travel-cream-rgb) / <alpha-value>)', // 主背景（暖米白）
          ink: 'rgb(var(--ui-tw-travel-ink-rgb) / <alpha-value>)', // 主文字（暖墨灰；P2-28 调深 #585450→#444140，/70 合成 4.12:1）
          dim: 'rgb(var(--ui-tw-travel-dim-rgb) / <alpha-value>)', // 次要边框（暖浅灰）
          sakura: 'rgb(var(--ui-tw-travel-sakura-rgb) / <alpha-value>)', // 暖米（浅）
          bloom: 'rgb(var(--ui-tw-travel-bloom-rgb) / <alpha-value>)', // 琥珀暖（深色模式强调）
          sky: 'rgb(var(--ui-tw-travel-sky-rgb) / <alpha-value>)', // 天空蓝
          mist: 'rgb(var(--ui-tw-travel-mist-rgb) / <alpha-value>)', // 雾蓝（浅）
          accent: 'rgb(var(--ui-tw-travel-accent-rgb) / <alpha-value>)', // 陶土暖棕（主强调）
          accentStrong: 'rgb(var(--ui-tw-travel-accent-strong-rgb) / <alpha-value>)', // 陶土深（hover/强调强）
          accentSoft: 'rgb(var(--ui-tw-travel-accent-soft-rgb) / <alpha-value>)', // 陶土浅（次级文字/浅强调）
          sand: 'rgb(var(--ui-tw-travel-sand-rgb) / <alpha-value>)', // 暖棕（纸面次级文字；P2-28 调深 #8B7355→#7D6754，AA 4.94:1）
          sandSoft: 'rgb(var(--ui-tw-travel-sand-soft-rgb) / <alpha-value>)', // 暖棕浅（暗色模式次级）
          sandLight: 'rgb(var(--ui-tw-travel-sand-light-rgb) / <alpha-value>)', // 暖米（暗色模式强调）
          parchment: 'rgb(var(--ui-tw-travel-parchment-rgb) / <alpha-value>)', // 羊皮纸亮
          parchmentDim: 'rgb(var(--ui-tw-travel-parchment-dim-rgb) / <alpha-value>)', // 羊皮纸亮-渐变色
          inkStrong: 'rgb(var(--ui-tw-travel-ink-strong-rgb) / <alpha-value>)', // 暖深棕标题
          line: 'rgb(var(--ui-tw-travel-line-rgb) / <alpha-value>)', // 暖浅边框
        },
                        // ★ 像素风木屋/纸面肤色（P2-31：去重 —— 值统一由 app/tokens.css 的
        //   --palette-pixel-*-rgb / --album-pixel-* 提供，这里只保留 Tailwind 入口。
        //   rgb(var(...) / <alpha-value>) 形式同时支持 bg-pixel-panel/70 这类透明度修饰符，
        //   渲染结果与原来的 hex 完全等值。）
        pixel: {
          ink: 'rgb(var(--ui-pixel-ink-rgb) / <alpha-value>)',
          muted: 'rgb(var(--ui-pixel-muted-rgb) / <alpha-value>)',
          faint: 'rgb(var(--ui-pixel-faint-rgb) / <alpha-value>)',
          line: 'rgb(var(--ui-pixel-line-rgb) / <alpha-value>)',
          photo: 'rgb(var(--ui-pixel-photo-rgb) / <alpha-value>)',
          panel: 'rgb(var(--ui-pixel-panel-rgb) / <alpha-value>)',
          panel2: 'rgb(var(--ui-pixel-panel2-rgb) / <alpha-value>)',
          panel3: 'rgb(var(--ui-pixel-panel3-rgb) / <alpha-value>)',
          paper: 'rgb(var(--ui-pixel-paper-rgb) / <alpha-value>)',
          online: 'rgb(var(--ui-pixel-online-rgb) / <alpha-value>)',
          bubble: 'rgb(var(--ui-pixel-bubble-rgb) / <alpha-value>)',
          lineLight: 'rgb(var(--ui-pixel-linelight-rgb) / <alpha-value>)',
          error: 'rgb(var(--ui-pixel-error-rgb) / <alpha-value>)',
          goldLight: 'rgb(var(--ui-pixel-goldlight-rgb) / <alpha-value>)',
          goldPale: 'rgb(var(--ui-pixel-goldpale-rgb) / <alpha-value>)',
        },
        // ⚠️ deprecated（P2-31）：与 tokens.css 的 --album-* / --ui-album-* 同值。
        //   保留仅为存量 class 兼容；新代码用 semantic-* 或 CSS 变量。含 rgba 与 /opacity
        //   混用，直接改 var() 会破坏透明度修饰符，故本轮只标注、不迁移（见汇报 deferred）。
        // ★ 相册暗色视觉系统（Stage 1：Album Design Tokens）
        // P2-31 B3：RGB 通道化。含内建 alpha 的 5 个色用 calc(<alpha-value> * a) 保留原 alpha，
        // 默认渲染值与旧 rgba 字面值逐字节相等；/opacity 修饰符在此基础上叠加（复合 alpha）。
        album: {
          bg0: 'rgb(var(--ui-tw-album-bg0-rgb) / <alpha-value>)',
          bg1: 'rgb(var(--ui-tw-album-bg1-rgb) / <alpha-value>)',
          bg2: 'rgb(var(--ui-tw-album-bg2-rgb) / <alpha-value>)',
          surface: 'rgb(var(--ui-tw-album-surface-rgb) / calc(<alpha-value> * 0.06))',
          text1: 'rgb(var(--ui-tw-album-text1-rgb) / calc(<alpha-value> * 0.92))',
          text2: 'rgb(var(--ui-tw-album-text2-rgb) / calc(<alpha-value> * 0.68))',
          text3: 'rgb(var(--ui-tw-album-text3-rgb) / calc(<alpha-value> * 0.45))',
          warm: 'rgb(var(--ui-tw-album-warm-rgb) / <alpha-value>)',
          accent: 'rgb(var(--ui-tw-album-accent-rgb) / <alpha-value>)',
          accentStrong: 'rgb(var(--ui-tw-album-accent-strong-rgb) / <alpha-value>)',
          accentDim: 'rgb(var(--ui-tw-album-accent-dim-rgb) / calc(<alpha-value> * 0.16))',
          ok: 'rgb(var(--ui-tw-album-ok-rgb) / <alpha-value>)',
          sync: 'rgb(var(--ui-tw-album-sync-rgb) / <alpha-value>)',
          wait: 'rgb(var(--ui-tw-album-wait-rgb) / <alpha-value>)',
          error: 'rgb(var(--ui-tw-album-error-rgb) / <alpha-value>)',
        },
        // ★ night.* 已于 P2-31 删除：13 个色值与 --social-* 暗色完全重复，且全仓 0 处
        //   night-* class 引用（grep 校验）。social 暗色统一由 tokens.css 的 --ui-social-* 承担。
        // ★ 标准壳暗色（P2-31：去重 —— 值与 tokens.css 的 --palette-shell-*-rgb 单一来源，
        //   这里只保留 Tailwind 入口；rgb() + <alpha-value> 保证 bg-shell-bg/90 等透明度用法不变）
        shell: {
          bg: 'rgb(var(--ui-shell-bg-rgb) / <alpha-value>)',
          surface: 'rgb(var(--ui-shell-surface-rgb) / <alpha-value>)',
          surface2: 'rgb(var(--ui-shell-surface2-rgb) / <alpha-value>)',
          surface3: 'rgb(var(--ui-shell-surface3-rgb) / <alpha-value>)',
          text: 'rgb(var(--ui-shell-text-rgb) / <alpha-value>)',
          muted: 'rgb(var(--ui-shell-muted-rgb) / <alpha-value>)',
          faint: 'rgb(var(--ui-shell-faint-rgb) / <alpha-value>)', // P2-28 提亮到 #8E949C（5.93:1）
          line: 'rgb(var(--ui-shell-line-rgb) / <alpha-value>)',
        },
        // ★ 新增语义化颜色
        success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
        // ⚠️ deprecated（P2-31）：admin 存量数字阶，无对应 CSS 变量语义层，新代码不要再用。
        // ★ 暖灰数字阶（1.20.0）：admin 后台由 Tailwind 冷灰 gray-N 归一到项目 token。
        //   取 stone（暖灰）系，与 gray-N 亮度逐档对齐 —— 批量替换后视觉零跳变，
        //   但整体色温与全站暖陶土色板一致，且受 check-design-tokens 治理。
        // P2-31 B3：RGB 通道化（色值与旧 hex 逐字节相等，保留 /opacity 修饰符）
        warm: {
          50: 'rgb(var(--ui-tw-warm-50-rgb) / <alpha-value>)',
          100: 'rgb(var(--ui-tw-warm-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--ui-tw-warm-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--ui-tw-warm-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--ui-tw-warm-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--ui-tw-warm-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--ui-tw-warm-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--ui-tw-warm-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--ui-tw-warm-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--ui-tw-warm-900-rgb) / <alpha-value>)',
        },
        // ★ travel 语义色（Phase2 对齐命名；色值与上方 success/warning/danger 保持一致）
        'travel-success': '#22c55e',
        'travel-warning': '#f59e0b',
        'travel-danger': '#ef4444',
      },
      fontFamily: {
        display: ['"Noto Serif SC"', '"Songti SC"', 'STSong', 'SimSun', 'serif'],
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






