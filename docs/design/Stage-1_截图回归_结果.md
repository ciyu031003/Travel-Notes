# Stage 1 截图回归结果

> 日期：2026-08-18  
> 状态：✅ 脚本已跑通，8 个页面 × 桌面/移动截图已生成  
> 人工视觉复核：待用户打开图片确认（本执行环境不支持看图）

## 生成文件

| 页面 | 桌面 1440 | 移动 390 |
| --- | --- | --- |
| /login | ✅ | ✅ |
| / | ✅ | ✅ |
| /travel | ✅ | ✅ |
| /timeline | ✅ | ✅ |
| /album space | ✅ | ✅ |
| /album pixel | ✅ | ✅ |
| /moments | ✅ | ✅ |
| /search | ✅ | ✅ |

目录：`F:\CodeFiles\Travel-Notes\docs\design\screenshots\`

## 使用的凭据

- TN_USER=`yuanabd`
- TN_ALBUM_DATE=`2023-06-01`
- TN_PASSWORD 已按用户提供值设置

## 重点人工复核项

1. `/album pixel`：
   - 城市书架书脊不再有零碎微信息
   - 「旅行档案」信息区正常显示地点/日期/时间线
   - 「档案」按钮可用，打开档案视图
   - 顶部「星图」按钮可用，星图城市连线正常
2. `/album space`：
   - 银河背景星点变弱（透明度 ≤0.5）
   - HUD 文字对比度提高
3. `/home`、`/travel`、`/timeline`：
   - rose → travel 暖色迁移后无明显色差/可读性问题
4. 所有页面无硬编码色导致的可视异常

## 说明

- 若发现某页样式异常，把截图文件名发我，我按文件定位修复。
