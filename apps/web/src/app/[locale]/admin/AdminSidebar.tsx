'use client'

import { Link } from '@/i18n/navigation'
import { usePathname } from '@/i18n/navigation'
import {
  LayoutDashboard, Users, ShieldAlert, Globe, ActivitySquare, ArrowLeft
} from 'lucide-react'
import { Logo } from '@/shared/ui/Logo'

interface Props {
  role: string
  displayName: string
  isSuperAdmin: boolean
}

const NAV_ITEMS = [
  { href: '/admin', label: '운영 대시보드', icon: LayoutDashboard, color: 'text-indigo-400', exact: true },
  { href: '/admin/contents', label: '콘텐츠 모니터링', icon: ActivitySquare, color: 'text-amber-400' },
  { href: '/admin/users', label: '사용자 및 CS', icon: Users, color: 'text-emerald-400' },
  { href: '/admin/reports', label: '신고 관리', icon: ShieldAlert, color: 'text-rose-400' },
]

const SUPER_ITEMS = [
  { href: '/admin/galaxies', label: '은하/카테고리 제어', icon: Globe, color: 'text-cyan-400' },
  { href: '/admin/roles', label: '권한 관리', icon: ShieldAlert, color: 'text-fuchsia-400' },
]

export default function AdminSidebar({ role, displayName, isSuperAdmin }: Props) {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Logo size="sm" className="mb-0.5" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Pixelyf Admin
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            role === 'SUPER_ADMIN' ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-indigo-500/10 text-indigo-400'
          }`}>
            {role}
          </span>
          <span className="text-xs text-slate-500">{displayName}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${
                active
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <item.icon className={`w-5 h-5 ${active ? item.color : 'text-slate-500'}`} />
              {item.label}
            </Link>
          )
        })}

        {isSuperAdmin && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-4 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">System</p>
            </div>
            {SUPER_ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-medium ${
                    active
                      ? 'bg-slate-800 text-white border border-slate-700'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${active ? item.color : 'text-slate-500'}`} />
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-700 bg-slate-800/50 hover:bg-slate-700 rounded-xl transition text-sm text-slate-300"
        >
          <ArrowLeft className="w-4 h-4" /> 서비스로 돌아가기
        </Link>
      </div>
    </aside>
  )
}
