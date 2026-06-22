import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user: adminAuth } } = await supabase.auth.getUser()
  if (!adminAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUser = await prisma.user.findUnique({ where: { id: adminAuth.id } })
  if (!adminUser || adminUser.role === 'USER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { amount, reason } = body

  if (!amount || typeof amount !== 'number') {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  try {
    const updatedUser = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.findUnique({ where: { id }, select: { stardust_balance: true } })
      if (!user) throw new Error('User not found')

      const newBalance = user.stardust_balance + amount

      const u = await tx.user.update({
        where: { id },
        data: { stardust_balance: newBalance }
      })

      await tx.stardust_transactions.create({
        data: {
          user_id: id,
          amount,
          type: 'CS_ADJUSTMENT',
          balance_after: newBalance,
          category: 'ADMIN',
          description: reason || '관리자 직권 지급/차감'
        }
      })

      return u
    })

    return NextResponse.json({ success: true, balance: updatedUser.stardust_balance })
  } catch (error: any) {
    console.error('Admin User Stardust POST error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
