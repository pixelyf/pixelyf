import { NextResponse } from 'next/server'
import { createClient } from '@/shared/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { fileName, fileType, fileSize } = await request.json()

    // Validate size (MVP let's say max 10MB)
    if (fileSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 })
    }

    const key = `moments/${user.id}/${crypto.randomUUID()}-${fileName}`

    // MVP: In reality, we'd use Cloudflare R2 SDK here (S3 Client) to generate a presigned URL.
    // Since we don't have R2 configured in .env, we'll dummy it or use Supabase storage for the MVP PoC to actually work
    // Let's assume we use Supabase storage if it's easier, but the request was "Cloudflare R2 Direct Upload".
    // I will mock the Cloudflare presigned URL endpoint.
    
    const uploadUrl = `https://mock-r2.cloudflare.com/upload/${key}`
    const publicUrl = `https://cdn.pixelyf.app/${key}`

    return NextResponse.json({ uploadUrl, publicUrl })
  } catch (error) {
    console.error('Upload URL Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
