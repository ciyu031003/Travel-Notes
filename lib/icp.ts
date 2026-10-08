/**
 * 备案信息单一来源（网站 ICP / App ICP / 工信部备案号 / 公安联网备案号）。
 *
 * 依据：
 *   · 工信部《移动互联网应用程序备案》与各应用商店上架规范（小米《APP备案编号的应用内展示指南》、
 *     华为/OPPO/vivo/应用宝同源要求）：App 内需在**显著位置**展示 App 备案编号，且编号可点击
 *     （或在编号下方）跳转工信部备案系统 https://beian.miit.gov.cn/ 供用户查询；
 *   · 公安部《计算机信息网络国际联网安全保护管理办法》与全国互联网安全管理服务平台要求：
 *     网站底部 / App 内需展示公安联网备案编号，并链接至 https://beian.mps.gov.cn/ 查询。
 *
 * 本项目备案信息：
 *   网站（www.yuanabd.cn 及子域名 travel-notes.yuanabd.cn / learn.yuanabd.cn）：
 *     · 网站 ICP 备案号：赣ICP备2024031528号-2
 *     · 工信部备案号：30178737190355077
 *     · 公安联网备案号：粤公网安备44010602017246号（编号 44010602017246）
 *   甜途 App（移动互联网应用程序备案）：
 *     · App ICP 备案号：赣ICP备2024031528号-4A
 *
 * 展示位置（6 处共用 components/IcpLicense.tsx）：账号设置 →「关于」、登录页、移动端首页「功能菜单」抽屉底部、
 * 门户首页页脚、全站页脚、APK 下载页；同时随静态壳打进 APK（www/ 内明文 + assets/public/icp-license.txt），
 * 原生侧另有 android values/strings.xml 与 AndroidManifest 的 meta-data，便于应用市场与备案核验扫描。
 *
 * 覆盖方式：这些值在**构建期编译期内联**（静态壳与服务端构建同理），改环境变量后必须重新构建；
 *   NEXT_PUBLIC_SITE_ICP_LICENSE / NEXT_PUBLIC_ICP_LICENSE（App 用）/ NEXT_PUBLIC_MIIT_FILING_NO /
 *   NEXT_PUBLIC_POLICE_FILING_NO / NEXT_PUBLIC_POLICE_FILING_CODE / NEXT_PUBLIC_ICP_LICENSE_QUERY_URL
 */

/** 网站 ICP 备案号（yuanabd.cn 主站及子域名共用） */
export const SITE_ICP_LICENSE = process.env.NEXT_PUBLIC_SITE_ICP_LICENSE || '赣ICP备2024031528号-2'

/** 甜途 App 的移动互联网应用程序备案号 */
export const APP_ICP_LICENSE = process.env.NEXT_PUBLIC_ICP_LICENSE || '赣ICP备2024031528号-4A'

/** 兼容旧引用：默认指 App 备案号 */
export const ICP_LICENSE = APP_ICP_LICENSE

/** 工信部备案号（工信部备案系统内的备案编号） */
export const MIIT_FILING_NO = process.env.NEXT_PUBLIC_MIIT_FILING_NO || '30178737190355077'

/** 公安联网备案号（全国互联网安全管理服务平台） */
export const POLICE_FILING_NO =
  process.env.NEXT_PUBLIC_POLICE_FILING_NO || '粤公网安备44010602017246号'

/** 公安备案编号（备案号里的数字部分，用于查询链接 code 参数） */
export const POLICE_FILING_CODE = process.env.NEXT_PUBLIC_POLICE_FILING_CODE || '44010602017246'

/** 工信部备案系统（ICP 备案号点击跳转查询） */
export const ICP_LICENSE_QUERY_URL =
  process.env.NEXT_PUBLIC_ICP_LICENSE_QUERY_URL || 'https://beian.miit.gov.cn/'

/** 工信部备案系统 · 备案查询页（工信部备案号点击跳转） */
export const MIIT_FILING_QUERY_URL = 'https://beian.miit.gov.cn/#/Integrated/recordQuery'

/** 全国互联网安全管理服务平台 · 网站/App 备案查询（公安备案号点击跳转） */
export const POLICE_FILING_QUERY_URL = `https://beian.mps.gov.cn/#/query/webSearch?code=${POLICE_FILING_CODE}`

/** 公安备案警徽（官方标识，随静态资源分发，离线壳内也能显示） */
export const POLICE_FILING_BADGE = '/brand/gongan-beian.png'

/** 展示用文案（供非组件场景复用） */
export const ICP_LICENSE_LABEL = `ICP 备案号（网站）：${SITE_ICP_LICENSE}`
export const APP_ICP_LICENSE_LABEL = `ICP 备案号（App）：${APP_ICP_LICENSE}`
export const MIIT_FILING_LABEL = `工信部备案号：${MIIT_FILING_NO}`
export const POLICE_FILING_LABEL = `公安备案号：${POLICE_FILING_NO}`
export const ICP_LICENSE_QUERY_TEXT = `工信部备案查询：${ICP_LICENSE_QUERY_URL}`
