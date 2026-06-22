import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!adminUser || adminUser.role === 'USER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { action, filter_moment } = await request.json()

  try {
    const report = await prisma.user_reports.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.$transaction(async (tx: any) => {
      // 1. Update report status
      await tx.user_reports.update({
        where: { id },
        data: { status: action === 'approve' ? '"resolved"' : '"dismissed"', reviewed_at: new Date() }
      })

      // 2. Filter moment if requested
      if (filter_moment && report.moment_id) {
        await tx.moment.update({
          where: { id: report.moment_id },
          data: { is_filtered: true, is_deleted: true, filter_reason: '신고 누적에 의한 관리자 삭제' }
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin Report PATCH error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
