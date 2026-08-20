import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 甜途移动端 Capacitor 配置（Stage 3.0b 本地壳）。
 * 目标：去掉 server.url，App 从本地 webDir 加载并注入 Capacitor 桥，离线能力（SQLite/媒体/同步）生效。
 * 现状：仍保留 server.url（远程网页壳）——待「静态导出 + force-dynamic/服务端页面客户端化 + CORS/Cookie」完成后，
 * 移除 server 段、改 androidScheme: 'https'，App 即切到本地壳。
 */
const config: CapacitorConfig = {
  appId: 'com.tiantu.app',
  appName: '甜途',
  webDir: 'www',
  // TODO(3.0b-2)：静态导出完成后移除下面 server 段，切本地壳
  server: {
    url: 'http://106.55.2.197',
  },
  android: {
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
