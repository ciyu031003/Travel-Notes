import { NextResponse } from 'next/server'
import { getSiteSettings } from '@/lib/auth'

export async function GET() {
  try {
    const settings = await getSiteSettings()
    return NextResponse.json({ 
      anniversaryStart: settings.anniversaryStart,
    })
  } catch {
    return NextResponse.json({ anniversaryStart: null })
  }
}
