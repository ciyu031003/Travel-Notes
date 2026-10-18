import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getSecret, setSecret, hasSecret, deleteSecret } from '@/lib/modules/secret/secret.service'
import { isSecretEncryptionConfigured } from '@/lib/infrastructure/secret-crypto'
import { ApiError, errorResponse } from '@/lib/api-response'
import { parseBody, getRequestId } from '@/lib/api/handler'
import { OilSettingsSchema } from '@/lib/api/schemas/admin'

/**
 * 油画生成设置（后台）：总开关 + 通义 API key 管理。
 * - 开关存 AppSecret('OIL_PAINT_ENABLED')，未设置回退环境变量 OIL_PAINT_ENABLED
 * - API key 存 AppSecret('DASHSCOPE_API_KEY')（AES-256-GCM 加密落库），
 *   GET 只回打码掩码，永不回显完整 key
 */

const ENABLED_KEY = 'OIL_PAINT_ENABLED'
const API_KEY_NAME = 'DASHSCOPE_API_KEY'

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

async function statusPayload() {
  let enabled: boolean
  try {
    const flag = await getSecret(ENABLED_KEY)
    enabled = flag === 'true' ? true : flag === 'false' ? false : process.env.OIL_PAINT_ENABLED === 'true'
  } catch {
    enabled = process.env.OIL_PAINT_ENABLED === 'true'
  }
  const hasKey = await hasSecret(API_KEY_NAME)
  const keyMasked = hasKey ? maskKey((await getSecret(API_KEY_NAME)) || '') : null
  return {
    encryptionConfigured: isSecretEncryptionConfigured(),
    enabled,
    enabledSource: (await getSecret(ENABLED_KEY).catch(() => null)) == null ? 'env' : 'db',
    hasKey,
    keyMasked,
  }
}

export async function GET(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    return NextResponse.json(await statusPayload())
  } catch (error) {
    console.error('[OilSettings] 读取失败:', (error as Error)?.message || error)
    return NextResponse.json({ error: '读取失败' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authResult = await requireAuth(request as any)
  if (!authResult.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }
  try {
    if (!isSecretEncryptionConfigured()) {
      return NextResponse.json(
        { error: 'APP_ENCRYPTION_KEY 未配置，无法保存敏感设置' },
        { status: 400 }
      )
    }

    // P1-17：body 统一 zod（enabled 布尔、apiKey 8-200、clearKey 布尔）
    const { enabled, apiKey, clearKey } = await parseBody(request, OilSettingsSchema)

    if (typeof enabled === 'boolean') {
      await setSecret(ENABLED_KEY, enabled ? 'true' : 'false')
    }
    if (typeof apiKey === 'string' && apiKey.trim()) {
      await setSecret(API_KEY_NAME, apiKey.trim())
    }
    if (clearKey === true) {
      await deleteSecret(API_KEY_NAME)
    }

    return NextResponse.json(await statusPayload())
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[OilSettings] 保存失败:', (error as Error)?.message || error)
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
