'use client'

import { useState, useEffect } from 'react'
import { ActivitySquare, Search, EyeOff, Trash2, ShieldAlert, MessageCircle, Heart } from 'lucide-react'
import { galaxyAlert, galaxyConfirm, galaxyPrompt } from '@/stores/dialogStore'

export default function AdminContentsPage() {
  const [moments, setMoments] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const fetchMoments = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/moments?page=${page}&limit=30&search=${encodeURIComponent(search)}`)
      const json = await res.json()
      if (json.data) {
        setMoments(json.data)
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
      fetchMoments()
    }, 400)
    return () => clearTimeout(delay)
  }, [search, page])

  const handleFilter = async (id: string, currentDeleted: boolean) => {
    const is_deleted = !currentDeleted
    const filter_reason = is_deleted ? (await galaxyPrompt({ title: '블라인드 사유', message: '블라인드 사유를 입력하세요', placeholder: '관리자 직권 블라인드', defaultValue: '관리자 직권 블라인드' }) || '관리자 직권 블라인드') : null
    
    if (is_deleted) {
      const ok = await galaxyConfirm({ title: '모먼트 블라인드', message: '이 모먼트를 블라인드(삭제) 처리하시겠습니까?', variant: 'danger', confirmText: '블라인드', confirmDanger: true })
      if (!ok) return
    }

    try {
      const res = await fetch(`/api/admin/moments/${id}/filter`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_deleted, is_filtered: is_deleted, filter_reason })
      })
      if (res.ok) fetchMoments()
      else await galaxyAlert({ title: '오류', message: '모먼트 처리 중 오류가 발생했습니다.', variant: 'error' })
    } catch (err) {
      await galaxyAlert({ title: '오류', message: '네트워크 오류가 발생했습니다.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ActivitySquare className="text-indigo-400" /> 콘텐츠 (모먼트) 실시간 모니터링
          {totalCount > 0 && (
            <span className="text-sm font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded-lg ml-2">
              총 <strong className="text-slate-200">{totalCount}</strong>건 ({page} / {totalPages} 페이지)
            </span>
          )}
        </h2>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="모먼트 내용 검색..."
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
              <th className="px-6 py-4 font-medium w-48">작성자</th>
              <th className="px-6 py-4 font-medium">모먼트 내용</th>
              <th className="px-6 py-4 font-medium w-32">상태</th>
              <th className="px-6 py-4 font-medium w-24">활동</th>
              <th className="px-6 py-4 font-medium w-32">작성일</th>
              <th className="px-6 py-4 font-medium text-right w-32">관리 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && moments.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">로딩 중...</td></tr>
            ) : moments.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">콘텐츠가 없습니다.</td></tr>
            ) : moments.map(moment => (
              <tr key={moment.id} className="hover:bg-slate-800/50 transition">
                <td className="px-6 py-4 align-top">
                  <div className="font-medium text-slate-200 flex items-center gap-1.5">
                    {moment.user?.country && (
                      <img src={`/flags/${moment.user.country.toLowerCase()}.svg`} alt={moment.user.country} className="w-4 h-3 object-cover rounded-[1px]" />
                    )}
                    {moment.user?.display_name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">@{moment.user?.pixel_id}</div>
                  {moment.user?.is_shadow_banned && (
                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-rose-500/10 text-rose-500 text-[10px] font-bold rounded">
                      <ShieldAlert className="w-3 h-3" /> 섀도우 밴 유저
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 align-top">
                  <div className={`text-sm ${moment.is_deleted ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                    {moment.content}
                  </div>
                  {moment.category && (
                    <div className="mt-2 text-xs text-indigo-400 bg-indigo-500/10 inline-block px-2 py-0.5 rounded-full">
                      {moment.category}
                    </div>
                  )}
                  {moment.is_deleted && moment.filter_reason && (
                    <div className="mt-2 text-xs text-rose-500 font-medium bg-rose-500/10 inline-block px-2 py-0.5 rounded">
                      사유: {moment.filter_reason}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 align-top">
                  {moment.is_deleted ? (
                    <span className="text-rose-500 text-xs font-medium px-2 py-1 bg-rose-500/10 rounded inline-flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> 숨김/삭제됨
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-xs font-medium px-2 py-1 bg-emerald-500/10 rounded inline-flex items-center gap-1">
                      정상
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 align-top">
                  <div className="flex flex-col gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-rose-400/80" /> {moment.ping_count || 0}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-sky-400/80" /> {moment.comment_count || 0}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 align-top text-slate-400 text-xs">
                  {new Date(moment.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 align-top text-right">
                  {!moment.is_deleted ? (
                    <button 
                      onClick={() => handleFilter(moment.id, moment.is_deleted)}
                      className="flex items-center justify-center gap-1 w-full px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded text-xs transition"
                    >
                      <Trash2 className="w-3 h-3" /> 블라인드
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleFilter(moment.id, moment.is_deleted)}
                      className="flex items-center justify-center gap-1 w-full px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                    >
                      복구
                    </button>
                  )}
                </td>
              </tr>
            ))}
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
