import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const imageId = parseInt(id, 10)

    if (isNaN(imageId)) {
      return new NextResponse('Invalid image ID', { status: 400 })
    }

    const image = await prisma.postImage.findUnique({
      where: { id: imageId },
    })

    if (!image) {
      return new NextResponse('Image not found', { status: 404 })
    }

    return new NextResponse(image.data, {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[Image API] Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
