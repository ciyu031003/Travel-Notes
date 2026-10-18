import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { getDocumentImportService } from '@/lib/container'
import { ok, fail, unauthorized, ApiError, errorResponse } from '@/lib/api-response'
import { getRequestId } from '@/lib/api/handler'
import { z } from 'zod'

const MAX_FILE_SIZE = 5 * 1024 * 1024

/** multipart 上传：只校验 file 字段形状（格式/魔数由 DocumentImportService 判定） */
const ImportFileSchema = z.object({
  file: z.custom<File>((v) => v instanceof File, { message: '缺少 file 字段' }),
})

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) return unauthorized()

  try {
    // P1-17：multipart 不套 parseBody(JSON)，按字段形状做 zod 校验
    const formData = await request.formData()
    const parsedFile = ImportFileSchema.safeParse({ file: formData.get('file') })
    if (!parsedFile.success) {
      throw new ApiError('VALIDATION_ERROR', parsedFile.error.issues[0]?.message || '缺少 file 字段', 400)
    }
    const fileField = parsedFile.data.file

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
    if (error instanceof ApiError) return errorResponse(error, getRequestId(request))
    console.error('[Import] Error:', error?.message)
    if (
      error.message?.startsWith('不支持的文件格式')
    ) {
      return fail(error.message, 400)
    }
    return fail(error.message || '导入失败', 500)
  }
}
