import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 甜途移动端 Capacitor 配置（Stage 3.0b · A 拆分架构 · 本地壳）。
 * 已移除 server.url：App 从本地 webDir（www/，由 scripts/build-mobile.cjs 静态导出）加载，
 * API 走 NEXT_PUBLIC_API_BASE（默认 https://travel-notes.yuanabd.cn）指向服务器，
 * 原生 SQLite/文件系统/网络插件在本地壳下生效，实现离线读写与自动同步。
 */
const config: CapacitorConfig = {
  appId: 'com.tiantu.app',
  appName: '甜途',
  webDir: 'www',
  android: {
    // 本地壳 https://localhost 中仍可加载 http 图片/媒体
    allowMixedContent: true,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
  },
};

export default config;
