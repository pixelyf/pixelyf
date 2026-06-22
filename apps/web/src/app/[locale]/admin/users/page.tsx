'use client'

import { useState, useEffect } from 'react'
import { Search, Ban, CheckCircle, ShieldAlert, Coins, Hand, Link2, MessageSquare, Heart, ActivitySquare } from 'lucide-react'
import { galaxyAlert, galaxyConfirm, galaxyPrompt } from '@/stores/dialogStore'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`)
      const json = await res.json()
      if (json.data) {
        setUsers(json.data)
        setTotalPages(json.meta.totalPages)
        setTotalCount(json.meta.total)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const delay = setTimeout(() => {
      fetchUsers()
    }, 400)
    return () => clearTimeout(delay)
  }, [search, page])

  const handleStatusUpdate = async (id: string, is_active: boolean, is_shadow_banned: boolean, reason?: string) => {
    const ok = await galaxyConfirm({ title: '상태 변경', message: '정말로 이 사용자의 상태를 변경하시겠습니까?', variant: 'warning', confirmText: '변경', confirmDanger: is_shadow_banned })
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active, is_shadow_banned, shadow_ban_reason: reason })
      })
      if (res.ok) fetchUsers()
    } catch (err) {
      await galaxyAlert({ title: '오류', message: '상태 변경 중 오류가 발생했습니다.', variant: 'error' })
    }
  }

  const handleStardust = async (id: string) => {
    const amountStr = await galaxyPrompt({ title: '별가루 지급/차감', message: '지급/차감할 별가루 수량을 입력하세요 (차감은 - 입력)', placeholder: '예: 100 또는 -50' })
    if (!amountStr) return
    const amount = parseInt(amountStr, 10)
    if (isNaN(amount)) { await galaxyAlert({ title: '입력 오류', message: '유효한 숫자를 입력하세요.', variant: 'warning' }); return }
    const reason = await galaxyPrompt({ title: '사유 입력', message: '지급/차감 사유를 입력하세요 (선택)', placeholder: '관리자 직권 지급/차감', defaultValue: '관리자 직권 지급/차감' }) || '관리자 직권 지급/차감'

    try {
      const res = await fetch(`/api/admin/users/${id}/stardust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason })
      })
      if (res.ok) fetchUsers()
      else await galaxyAlert({ title: '오류', message: '별가루 처리 중 오류가 발생했습니다.', variant: 'error' })
    } catch (err) {
      await galaxyAlert({ title: '오류', message: '네트워크 오류가 발생했습니다.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          사용자 및 CS 관리
          {totalCount > 0 && (
            <span className="text-sm font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded-lg ml-2">
              총 <strong className="text-slate-200">{totalCount}</strong>명 ({page} / {totalPages} 페이지)
            </span>
          )}
        </h2>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="픽셀 ID 또는 닉네임 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm w-64"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400">
            <tr>
              <th className="px-6 py-4 font-medium">유저 정보</th>
              <th className="px-6 py-4 font-medium">권한/페르소나</th>
              <th className="px-6 py-4 font-medium">활동 점수 / 재화</th>
              <th className="px-6 py-4 font-medium">상태</th>
              <th className="px-6 py-4 font-medium w-48">프론트엔드 활동 지표</th>
              <th className="px-6 py-4 font-medium text-right">관리 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && users.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">로딩 중...</td></tr>
            ) : users.map(user => {
              const bonds = (user._count?.constellation_bonds_constellation_bonds_user_a_idTousers || 0) + (user._count?.constellation_bonds_constellation_bonds_user_b_idTousers || 0)
              
              return (
              <tr key={user.id} className="hover:bg-slate-800/50 transition">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-200 flex items-center gap-1.5">
                    {user.country && (
                      <img src={`/flags/${user.country.toLowerCase()}.svg`} alt={user.country} className="w-4 h-3 object-cover rounded-[1px]" />
                    )}
                    {user.display_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">@{user.pixel_id}</div>
                </td>
                <td className="px-6 py-4">
                  <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'SUPER_ADMIN' ? 'bg-fuchsia-500/10 text-fuchsia-400' : 
                    user.role === 'CONTENT_ADMIN' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {user.role}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{user.persona?.persona_code || '미설정'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-slate-300">{Number(user.activity_score).toLocaleString()}점</div>
                  <div className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <Coins className="w-3 h-3" /> {user.stardust_balance.toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {!user.is_active ? (
                    <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-medium px-2 py-1 bg-rose-400/10 rounded">
                      <Ban className="w-3 h-3" /> 정지됨
                    </span>
                  ) : user.is_shadow_banned ? (
                    <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium px-2 py-1 bg-amber-400/10 rounded">
                      <ShieldAlert className="w-3 h-3" /> 섀도우 밴
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium px-2 py-1 bg-emerald-400/10 rounded">
                      <CheckCircle className="w-3 h-3" /> 정상
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 align-top">
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5" title="모먼트 작성수">
                      <ActivitySquare className="w-3.5 h-3.5 text-indigo-400/80" /> {user._count?.moments || 0}
                    </span>
                    <span className="flex items-center gap-1.5" title="받은 감정(Ping) 수">
                      <Heart className="w-3.5 h-3.5 text-pink-400/80" /> {user._count?.pings_received || 0}
                    </span>
                    <span className="flex items-center gap-1.5" title="받은 터치 수">
                      <Hand className="w-3.5 h-3.5 text-blue-400/80" /> {user._count?.touches_touches_touched_idTousers || 0}
                    </span>
                    <span className="flex items-center gap-1.5" title="별자리 연결 수">
                      <Link2 className="w-3.5 h-3.5 text-indigo-400/80" /> {bonds}
                    </span>
                    <span className="flex items-center gap-1.5 col-span-2" title="작성한 댓글 수">
                      <MessageSquare className="w-3.5 h-3.5 text-teal-400/80" /> {user._count?.momentComments || 0}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => handleStardust(user.id)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                    >
                      재화 CS
                    </button>
                    {!user.is_shadow_banned ? (
                      <button 
                        onClick={() => handleStatusUpdate(user.id, true, true, '관리자 직권 섀도우 밴')}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded text-xs transition"
                      >
                        섀도우 밴 적용
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleStatusUpdate(user.id, true, false)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                      >
                        밴 해제
                      </button>
                    )}
                    {user.is_active ? (
                      <button 
                        onClick={() => handleStatusUpdate(user.id, false, user.is_shadow_banned)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded text-xs transition"
                      >
                        계정 정지
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleStatusUpdate(user.id, true, user.is_shadow_banned)}
                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded text-xs transition"
                      >
                        정지 해제
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div className="p-4 border-t border-slate-800 flex justify-between items-center text-sm text-slate-400">
          <span>총 <strong className="text-slate-200">{totalCount}</strong>건 ({page} / {totalPages} 페이지)</span>
          <div className="flex gap-2">
            <button 
              disabled={page === 1}
              onClick={() => setPage(1)}
              className="px-3 py-1 border border-slate-700 rounded disabled:opacity-50 hover:bg-slate-800 transition"
            >
              처음
            </button>
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 border border-slate-700 rounded disabled:opacity-50 hover:bg-slate-800 transition"
            >
              이전
            </button>
            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border border-slate-700 rounded disabled:opacity-50 hover:bg-slate-800 transition"
            >
              다음
            </button>
            <button 
              disabled={page === totalPages || totalPages === 0}
              onClick={() => setPage(totalPages)}
              className="px-3 py-1 border border-slate-700 rounded disabled:opacity-50 hover:bg-slate-800 transition"
            >
              마지막
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
