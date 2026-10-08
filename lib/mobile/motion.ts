/** 移动端弹层共用参数：应用内只保留一套遮罩时长与抽屉弹簧手感。 */
export const MOBILE_OVERLAY_TRANSITION = {
  duration: 0.22,
  ease: 'easeOut',
} as const

export const MOBILE_PANEL_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 44,
} as const
