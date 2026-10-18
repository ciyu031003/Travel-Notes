/**
 * 个人资料写路由的共享 zod schema（P1-17 收尾）。
 * 只做形状/范围校验；头像与头图是 multipart，字段校验在路由内联（见各路由注释）。
 */
import { z } from 'zod'

/** 头图焦点（0-1 归一化坐标）：两个坐标必须同时给或同时缺省，避免半套坐标落库后渲染错位 */
export const CoverFocusSchema = z
  .object({
    focusX: z.coerce.number().min(0).max(1).nullable().optional(),
    focusY: z.coerce.number().min(0).max(1).nullable().optional(),
  })
  .refine((v) => (v.focusX == null) === (v.focusY == null), {
    message: '焦点参数不合法（应为 0-1 之间的数字）',
  })
