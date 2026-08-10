/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
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
