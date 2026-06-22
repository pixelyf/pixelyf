import React from 'react'
import { createClient } from '@/shared/lib/supabase/server'
import { redirect } from 'next/navigation'
import prisma from '@/shared/lib/prisma'
import AdminSidebar from './AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, display_name: true }
  })

  if (!adminUser || adminUser.role === 'USER') {
    redirect('/')
  }

  const isSuperAdmin = adminUser.role === 'SUPER_ADMIN'

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <AdminSidebar role={adminUser.role} displayName={adminUser.display_name} isSuperAdmin={isSuperAdmin} />
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 border-b border-slate-800 flex items-center px-8 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-slate-200">대시보드</h2>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
