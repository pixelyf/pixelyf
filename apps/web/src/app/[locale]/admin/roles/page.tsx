'use client'

import { useState, useEffect } from 'react'
import { ShieldAlert, Save, RefreshCw, CheckCircle2 } from 'lucide-react'

// 정의된 권한 스코프 목록
const PERMISSION_SCOPES = [
  { group: '사용자 (Users)', items: ['users:read', 'users:write', 'users:ban'] },
  { group: '콘텐츠 (Contents)', items: ['contents:read', 'contents:write', 'contents:delete'] },
  { group: '신고 (Reports)', items: ['reports:read', 'reports:resolve'] },
  { group: '은하 (Galaxies)', items: ['galaxies:read', 'galaxies:write', 'galaxies:delete'] },
  { group: '시스템 (System)', items: ['roles:manage', 'audit:read'] },
]

export default function RolesPage() {
  const [admins, setAdmins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [newPixelId, setNewPixelId] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)

  useEffect(() => {
    fetchAdmins()
  }, [])

  const fetchAdmins = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/roles')
      const json = await res.json()
      if (json.success) {
        setAdmins(json.data)
      }
    } catch (error) {
      console.error('Failed to fetch admins', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPixelId.trim()) return

    setAddingAdmin(true)
    setSuccessMsg('')
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixel_id: newPixelId.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(`성공적으로 관리자로 승격되었습니다.`)
        setNewPixelId('')
        fetchAdmins() // 리스트 갱신
      } else {
        alert(json.error || '관리자 승격에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to add admin', error)
      alert('오류가 발생했습니다.')
    } finally {
      setAddingAdmin(false)
    }
  }

  const handlePermissionChange = (adminId: string, perm: string, checked: boolean) => {
    setAdmins(prev => prev.map(admin => {
      if (admin.id !== adminId) return admin
      
      const currentPerms = admin.admin_profile?.permissions || []
      const newPerms = checked 
        ? [...currentPerms, perm] 
        : currentPerms.filter((p: string) => p !== perm)
      
      return {
        ...admin,
        admin_profile: {
          ...admin.admin_profile,
          permissions: newPerms
        }
      }
    }))
  }

  const handleIpChange = (adminId: string, ipsString: string) => {
    setAdmins(prev => prev.map(admin => {
      if (admin.id !== adminId) return admin
      
      return {
        ...admin,
        admin_profile: {
          ...admin.admin_profile,
          allowed_ips: ipsString.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0)
        }
      }
    }))
  }

  const handleSave = async (admin: any) => {
    setSaving(admin.id)
    setSuccessMsg('')
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: admin.id,
          permissions: admin.admin_profile?.permissions || [],
          allowed_ips: admin.admin_profile?.allowed_ips || []
        })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(`${admin.display_name} 관리자의 권한이 저장되었습니다.`)
        setTimeout(() => setSuccessMsg(''), 3000)
      }
    } catch (error) {
      console.error('Failed to save role', error)
      alert('저장에 실패했습니다.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <header className="px-8 py-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-fuchsia-400" />
            권한 관리 (RBAC)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            관리자별 세부 권한(Scope) 및 접속 허용 IP를 제어합니다.
          </p>
        </div>
        <button
          onClick={fetchAdmins}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </header>

      {successMsg && (
        <div className="mx-8 mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
          <CheckCircle2 className="w-5 h-5" />
          {successMsg}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-8">
        {/* 새 관리자 추가 폼 */}
        <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl">
          <h3 className="text-sm font-bold text-slate-300 mb-4">새 관리자 추가</h3>
          <form onSubmit={handleAddAdmin} className="flex gap-3">
            <input
              type="text"
              value={newPixelId}
              onChange={(e) => setNewPixelId(e.target.value)}
              placeholder="추가할 유저의 Pixel ID를 입력하세요"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-fuchsia-500 transition-colors"
              disabled={addingAdmin}
            />
            <button
              type="submit"
              disabled={addingAdmin || !newPixelId.trim()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition flex items-center gap-2"
            >
              {addingAdmin ? <RefreshCw className="w-4 h-4 animate-spin" /> : '승격하기'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-8 h-8 text-fuchsia-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {admins.map(admin => {
              const profile = admin.admin_profile || { permissions: [], allowed_ips: [] }
              const isSuper = admin.role === 'SUPER_ADMIN'

              return (
                <div key={admin.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 bg-slate-800/30 border-b border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-lg text-fuchsia-400">
                        {admin.display_name[0]}
                      </div>
                      <div>
                        <h3 className="font-bold text-white flex items-center gap-2">
                          {admin.display_name}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            isSuper ? 'bg-fuchsia-500/20 text-fuchsia-400' : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {admin.role}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-500">{admin.pixel_id}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSave(admin)}
                      disabled={saving === admin.id}
                      className="flex items-center gap-2 px-5 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition"
                    >
                      {saving === admin.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      저장하기
                    </button>
                  </div>

                  <div className="p-6 grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* 왼쪽: 권한 그룹 매트릭스 */}
                    <div className="lg:col-span-3 space-y-6">
                      <h4 className="text-sm font-bold text-slate-300 border-b border-slate-800 pb-2">접근 권한 (Scopes)</h4>
                      
                      {isSuper && (
                        <div className="p-3 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-lg text-xs text-fuchsia-300">
                          이 계정은 <strong>SUPER_ADMIN</strong>이므로 아래 권한 체크 여부와 상관없이 모든 권한을 우회(Bypass)하여 허용받습니다. (체크박스는 UI 표시용입니다)
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {PERMISSION_SCOPES.map(group => (
                          <div key={group.group} className="space-y-3">
                            <h5 className="text-xs font-semibold text-slate-500">{group.group}</h5>
                            <div className="space-y-2">
                              {group.items.map(perm => {
                                const hasPerm = profile.permissions.includes(perm)
                                return (
                                  <label key={perm} className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={hasPerm}
                                        onChange={(e) => handlePermissionChange(admin.id, perm, e.target.checked)}
                                        className="appearance-none w-5 h-5 border-2 border-slate-700 rounded bg-slate-900 checked:bg-fuchsia-500 checked:border-fuchsia-500 transition-colors"
                                      />
                                      {hasPerm && <CheckCircle2 className="w-3.5 h-3.5 text-white absolute pointer-events-none" />}
                                    </div>
                                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                      {perm}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 오른쪽: 보안 (IP) */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-300 border-b border-slate-800 pb-2">보안 정책</h4>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 block">
                          허용된 IP 주소 (White-list)
                        </label>
                        <textarea
                          value={profile.allowed_ips.join(', ')}
                          onChange={(e) => handleIpChange(admin.id, e.target.value)}
                          placeholder="비워두면 모든 IP 허용&#10;예) 192.168.0.1, 10.0.0.1"
                          className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-700 focus:outline-none focus:border-fuchsia-500 transition-colors resize-none"
                        />
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          여러 IP를 등록하려면 쉼표(,)로 구분하세요.<br/>
                          SUPER_ADMIN이라 하더라도 IP가 지정된 경우 외부 IP에서는 즉각 차단됩니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
