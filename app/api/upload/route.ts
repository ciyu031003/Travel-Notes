import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import fs from 'fs'
import path from 'path'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_FILE_SIZE = 10 * 1024 * 1024

function getUploadDir(): string {
  return path.join(process.cwd(), 'public', 'uploads')
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  const uploadDir = getUploadDir()
  console.log('[Upload] Upload directory:', uploadDir)
  console.log('[Upload] process.cwd():', process.cwd())

  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '未上传任何文件' }, { status: 400 })
    }

    console.log('[Upload] Received', files.length, 'files')

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
      console.log('[Upload] Created upload directory:', uploadDir)
    }

    const urls: string[] = []
    const timestamp = Date.now()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log('[Upload] Processing file:', file.name, 'type:', file.type, 'size:', file.size)

      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `不支持的文件类型: ${file.type}` }, { status: 400 })
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `文件太大: ${file.name} 超过 10MB` }, { status: 400 })
      }

      if (file.size === 0) {
        return NextResponse.json({ error: `文件为空: ${file.name}` }, { status: 400 })
      }

      const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
      const filename = `${timestamp}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = path.join(uploadDir, filename)

      const buffer = Buffer.from(await file.arrayBuffer())
      console.log('[Upload] Writing file:', filePath, 'buffer size:', buffer.length)

      fs.writeFileSync(filePath, buffer)

      if (!fs.existsSync(filePath)) {
        console.error('[Upload] File not found after write:', filePath)
        return NextResponse.json({ error: '文件保存失败' }, { status: 500 })
      }

      const stat = fs.statSync(filePath)
      console.log('[Upload] File saved successfully:', filePath, 'size:', stat.size)

      urls.push(`/uploads/${filename}`)
    }

    console.log('[Upload] All files uploaded successfully:', urls)
    return NextResponse.json({ urls })
  } catch (error: any) {
    console.error('[Upload] Error:', error?.message, error?.stack)
    return NextResponse.json({ error: error.message || '上传失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url } = body

    if (!url || !url.startsWith('/uploads/')) {
      return NextResponse.json({ error: '无效的文件路径' }, { status: 400 })
    }

    const uploadDir = getUploadDir()
    const filePath = path.join(uploadDir, path.basename(url))

    console.log('[Upload DELETE] Deleting file:', filePath)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log('[Upload DELETE] File deleted successfully:', filePath)
    } else {
      console.warn('[Upload DELETE] File not found:', filePath)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Upload DELETE] Error:', error?.message, error?.stack)
    return NextResponse.json({ error: error.message || '删除失败' }, { status: 500 })
  }
}