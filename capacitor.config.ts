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
    /**
     * C1：禁止 WebView 混合内容。
     * 本地壳是 https://localhost，之前允许 http 图片/媒体 —— 等于给中间人留了一条
     * "把 http 资源注入 HTTPS 页面"的通路。现在要求所有远程资源必须 HTTPS
     * （服务端 COS/CDN 与 API 都是 https；配合 network_security_config 双重约束）。
     */
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // targetSdk 36 强制 edge-to-edge；显式采用 CSS inset + 先声明 cover，
      // 避免依赖 Capacitor 默认值或首帧 viewport-fit 切换造成顶部跳动。
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      /**
       * C1：Android 端启用加密支持。实际打开加密库时 sqlite-db.ts 会显式传
       * encrypted=true / mode='secret' 并 setEncryptionSecret（密钥由 AndroidKeyStore
       * 生成的 SecureStore 插件提供）；这里置 true 是让插件的 isInConfigEncryption()
       * 与运行时行为一致，避免"配置说没开、代码却开"的隐性不一致。
       */
      androidIsEncryption: true,
    },
    Keyboard: {
      // ⚠️ `resize` 是 **iOS 专属**选项（Android 侧插件只读 resizeOnFullScreen）。
      // Android 的键盘避让不靠这里：Capacitor 8 的 SystemBars 插件默认
      // insetsHandling='css'，在 WindowInsets 监听里对 IME insets 做原生 padding
      // （新 WebView 直接透传 safe-area，旧 WebView 原生垫高），WebView 视口随之收缩。
      // 移动 Web 端的键盘避让由 hooks/use-keyboard-inset.ts（visualViewport 差值）补齐，
      // 已接入 CommentPanel / TravelDetailMobile / BottomSheet / TravelComposerForm。
      resize: 'native',
    },
  },
};

export default config;
