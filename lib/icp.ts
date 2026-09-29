/**
 * ICP 备案信息（移动互联网应用程序备案）。
 *
 * 依据《工业和信息化部关于开展移动互联网应用程序备案工作的通知》与各应用商店上架规范
 * （小米《APP备案编号的应用内展示指南》、华为/OPPO/vivo/应用宝同源要求）：
 *   1. App 内需在**显著位置**展示 App 备案编号；
 *   2. 备案编号需可点击（或在编号下方）跳转工信部备案系统 https://beian.miit.gov.cn/ 供用户查询。
 *
 * 因此备案号会同时出现在（便于应用市场/备案核验扫描到）：
 *   · App / Web UI：登录页、首页页脚、账号设置 →「关于」、下载页
 *   · 静态导出的 HTML（www/ 随 APK 一起分发，编号是明文文本）
 *   · 原生工程：android/app/src/main/res/values/strings.xml + AndroidManifest.xml 的 meta-data
 *   · public/icp-license.txt（随壳打到 assets/public/icp-license.txt）
 *
 * 如需更换备案号：设置 NEXT_PUBLIC_ICP_LICENSE 后**重新构建移动端壳**
 * （静态导出时编译期内联，改环境变量不会影响已打好的 APK）。
 *
 * 注意：同一主体的「网站备案号」与「App 备案号」服务项后缀不同（网站 \`-4\`、App \`-4A\`）。
 * 这里默认是本项目 App 的备案号；若门户网站另有网站备案号，请用环境变量覆盖本页脚展示值。
 */
export const ICP_LICENSE = process.env.NEXT_PUBLIC_ICP_LICENSE || '赣ICP备2024031528号-4A'

/** 工信部备案系统（点击备案号跳转查询） */
export const ICP_LICENSE_QUERY_URL =
  process.env.NEXT_PUBLIC_ICP_LICENSE_QUERY_URL || 'https://beian.miit.gov.cn/'

/** 展示用文案：编号 + 查询网址（备案核验要求「编号下方链接备案系统网址」） */
export const ICP_LICENSE_LABEL = `ICP 备案号：${ICP_LICENSE}`
export const ICP_LICENSE_QUERY_TEXT = `工信部备案查询：${ICP_LICENSE_QUERY_URL}`
