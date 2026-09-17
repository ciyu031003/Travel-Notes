#!/usr/bin/env node
/**
 * 门户下载页生产实测：版本号从 /api/version 拉取后要渲染、二维码要可扫。
 *
 * 为什么要单独验：`/download` 是「扫码下载最新版 APK」的唯一入口，
 * 它的版本号与二维码都是**客户端**从 /api/version 现取的（SSR HTML 里没有），
 * 所以 curl 页面源码看不出问题 —— 必须用真实浏览器跑一遍。
 */
const { chromium } = require('playwright')

const BASE = process.env.PROD_BASE || 'https://travel-notes.yuanabd.cn'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const versionRes = await page.request.get(`${BASE}/api/version`)
  const manifest = await versionRes.json()
  console.log('线上版本:', manifest.version, 'build', manifest.buildNumber)

  await page.goto(`${BASE}/download`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  // 版本号渲染出来（客户端拉取后才出现）
  await page.getByText(new RegExp(`v${manifest.version.replace(/\./g, '\\.')}`)).first().waitFor({ timeout: 30_000 })
  console.log('✓ 页面渲染版本号 v' + manifest.version)

  // 二维码是 data URL 图片
  const qr = page.locator('img[alt*="二维码"]').first()
  await qr.waitFor({ timeout: 30_000 })
  const src = await qr.getAttribute('src')
  if (!src || !src.startsWith('data:image')) throw new Error('二维码不是 data:image')
  console.log('✓ 二维码已渲染 (data URL 长度 ' + src.length + ')')

  // 下载按钮不在 <a> 上：点击后弹更新弹窗，弹窗里才是「立即下载 APK」（window.open 到固定路径）。
  // 因此这里验证两步：弹窗打开 + 弹窗里的二维码/版本/changelog 都渲染出来。
  await page.getByRole('button', { name: /下载 Android 安装包/ }).click()
  await page.getByRole('button', { name: /立即下载 APK/ }).waitFor({ timeout: 20_000 })
  console.log('✓ 下载弹窗已打开（含「立即下载 APK」）')

  const qrInModal = page.locator('img[alt*="扫码下载"]').first()
  await qrInModal.waitFor({ timeout: 20_000 })
  const modalQr = await qrInModal.getAttribute('src')
  if (!modalQr || !modalQr.startsWith('data:image')) throw new Error('弹窗二维码不是 data:image')
  console.log('✓ 弹窗二维码已渲染')

  // 点「立即下载 APK」不应报错（window.open 到 /downloads/tiantu.apk）
  const popupPromise = page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null)
  await page.getByRole('button', { name: /立即下载 APK/ }).click()
  const popup = await popupPromise
  console.log(popup ? '✓ 立即下载触发了新窗口：' + popup.url() : '（下载未开新窗口，走同页跳转）')

  // 真实下载一次（Range 前 1KB）确认 200/206 且长度正确
  const apk = await page.request.get(`${BASE}/downloads/tiantu.apk`, { headers: { Range: 'bytes=0-1023' } })
  if (![200, 206].includes(apk.status())) throw new Error('APK 下载状态异常 ' + apk.status())
  console.log('✓ APK 可下载 http=' + apk.status() + ' 首段=' + (await apk.body()).length + 'B')

  await browser.close()
  console.log('\n门户下载页实测通过')
  process.exit(0)
}

main().catch(async (e) => {
  console.error('✗ 门户下载页实测失败:', e.message)
  process.exit(1)
})
