module.exports = {
  plugins: {
    // Tailwind 4：入口由 @tailwindcss/postcss 处理（内置 Lightning CSS：前缀/嵌套/语法降级），
    // 不再需要 autoprefixer（依赖保留但配置里已移除，见 UPGRADE-EVALUATION §Tailwind4）。
    '@tailwindcss/postcss': {},
  },
}
