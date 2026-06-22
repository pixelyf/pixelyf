import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'
import prisma from '@/shared/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const galaxyKey = searchParams.get('galaxyKey')

    if (!galaxyKey) {
      return NextResponse.json({ error: 'galaxyKey is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. 은하 활성 상태 검증
    const galaxy = await prisma.galaxy.findUnique({
      where: { key: galaxyKey }
    })

    if (!galaxy || !galaxy.isActive) {
      return NextResponse.json({ error: 'Invalid or inactive galaxy' }, { status: 404 })
    }

    // 루트 은하는 항상 가입된 것으로 간주 (단, 데이터상으로도 가입되어 있음)
    if (galaxy.isRoot) {
      return NextResponse.json({ joined: true, isRoot: true })
    }

    // 2. 유저 좌표 존재 여부 검증
    const { data: existingCoord } = await supabase
      .from('user_coordinates')
      .select('id')
      .eq('user_id', user.id)
      .eq('galaxy_key', galaxyKey)
      .limit(1)
      .maybeSingle()



    return NextResponse.json({ 
      joined: !!existingCoord,
      isRoot: false
    })

  } catch (error) {
    console.error('Check Galaxy Join Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
