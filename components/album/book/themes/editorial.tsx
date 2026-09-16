'use client'

import { BaseCoverPage } from '../sheets/base'
import type { BookTheme } from './types'

/**
 * 画报（Editorial）—— 默认主题
 *
 * 现代旅行摄影画册：米白纸张、大留白、大照片、细线、编辑杂志式排版、轻微阴影。
 * 它**不覆盖任何内页**：全部走默认版式（即 Album 2.0 之前 Art Mode 的视觉），
 * 只通过 token 与 `data-book-theme="editorial"` 的 CSS 作用域微调。
 * 这样"默认主题"等于"现有样子的正式命名"，不会因为引入主题系统而改变观感。
 */
export const EDITORIAL_THEME: BookTheme = {
  key: 'editorial',
  label: '画报',
  description: '现代旅行摄影画册 · 米白纸张 · 大留白',
  tokens: {
    // 与 tailwind travel.* 暖白系对齐；--art-* 仍是页面级基础变量，这里只覆盖画册语义层
    '--book-paper': '#f7f6f0',
    '--book-ink': '#292c26',
    '--book-accent': 'var(--color-travel-accent, #A85F3A)',
    '--book-cloth': '#7d8572',
    '--book-line': 'rgba(41,44,38,0.16)',
    '--book-serif': "'Source Serif 4', 'Songti SC', 'Noto Serif CJK SC', Georgia, serif",
    '--book-sans': "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    // 画报不做颗粒
    '--book-grain-opacity': '0',
    '--book-photo-filter': 'saturate(0.92) contrast(1.03) sepia(0.07)',
  },
  bodies: {},
  cover: BaseCoverPage,
}
