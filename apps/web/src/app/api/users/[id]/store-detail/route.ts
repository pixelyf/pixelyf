import { NextResponse } from 'next/server'
import prisma from '@/shared/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const storeDetail = await prisma.storeDetail.findUnique({
      where: { user_id: id },
    })

    if (!storeDetail) {
      return NextResponse.json({ data: null })
    }

    return NextResponse.json({
      data: {
        phone: storeDetail.phone,
        address: storeDetail.address,
        google_place_id: storeDetail.google_place_id,
        latitude: storeDetail.latitude,
        longitude: storeDetail.longitude,
        business_hours: storeDetail.business_hours,
        menu_info: storeDetail.menu_info,
        gallery_photos: storeDetail.gallery_photos,
        description: storeDetail.description,
      }
    })
  } catch (error) {
    console.error('Fetch Store Detail Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
