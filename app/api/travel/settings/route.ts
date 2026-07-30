import { NextResponse } from 'next/server'
import { getSiteService } from '@/lib/container'

export async function GET() {
  try {
    const siteService = getSiteService()
    const config = await siteService.getSiteConfig()
    return NextResponse.json({
      anniversaryStart: config.anniversaryStart,
    })
  } catch {
    return NextResponse.json({ anniversaryStart: null })
  }
}
