/** @type {import('next').NextConfig} */
const MOBILE_EXPORT = process.env.MOBILE_EXPORT === '1'

const nextConfig = {
  reactStrictMode: true,
  // 移动端本地壳（Stage 3.0b）：MOBILE_EXPORT=1 时做静态导出（输出到 out/，再由脚本拷到 www/）。
  // Web/服务器构建不设该变量，保持 SSR/ISR 正常。
  output: MOBILE_EXPORT ? 'export' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // 静态导出无 next/image 优化服务，需 unoptimized
    unoptimized: MOBILE_EXPORT ? true : undefined,
  },
  // 低内存构建优化：
  // - 项目未配置 ESLint，构建期跳过 lint 步骤可显著降低内存与耗时
  // - 类型检查默认保留；极端低内存服务器可设置 SKIP_TSC=1 跳过（不推荐）
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TSC === '1',
  },
}

module.exports = nextConfig
