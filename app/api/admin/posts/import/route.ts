import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getDocumentImportService } from '@/lib/container'
import { ok, fail, unauthorized } from '@/lib/api-response'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    const formData = await request.formData()
    const fileField = formData.get('file') as File | null

    if (!fileField) {
      return fail('缺少 file 字段', 400)
    }

    if (fileField.size > MAX_FILE_SIZE) {
      return fail('文件大小不能超过 5MB', 400)
    }

    if (fileField.size === 0) {
      return fail('文件不能为空', 400)
    }

    const buffer = Buffer.from(await fileField.arrayBuffer())
    const importService = getDocumentImportService()

    const result = await importService.import({
      name: fileField.name,
      buffer,
      mimeType: fileField.type,
    })

    return ok(result)
  } catch (error: any) {
    console.error('[Import] Error:', error?.message)
    if (
      error.message?.startsWith('不支持的文件格式')
    ) {
      return fail(error.message, 400)
    }
    return fail(error.message || '导入失败', 500)
  }
}
