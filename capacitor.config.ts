import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 甜途移动端 Capacitor 配置
 *
 * 当前已内置服务器地址，App 启动后直接加载网页端。
 * 后续如需切换服务器地址，可修改 server.url 后重新执行：
 *   npx cap sync android
 */
const config: CapacitorConfig = {
  appId: 'com.tiantu.app',
  appName: '甜途',
  webDir: 'www',
  server: {
    url: 'http://106.55.2.197',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
