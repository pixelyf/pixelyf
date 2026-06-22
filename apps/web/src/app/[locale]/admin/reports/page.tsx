'use client'

import { useState, useEffect } from 'react'
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { galaxyAlert, galaxyConfirm } from '@/stores/dialogStore'

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reports')
      const json = await res.json()
      if (json.data) {
        setReports(json.data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const handleAction = async (id: string, action: 'approve' | 'dismiss', filter_moment: boolean = false) => {
    const ok = await galaxyConfirm({
      title: action === 'approve' ? '신고 승인' : '신고 반려',
      message: action === 'approve' ? '이 신고를 승인(제재)하시겠습니까?' : '이 신고를 반려(기각)하시겠습니까?',
      variant: action === 'approve' ? 'danger' : 'warning',
      confirmText: action === 'approve' ? '승인' : '반려',
      confirmDanger: action === 'approve',
    })
    if (!ok) return
    
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, filter_moment })
      })
      if (res.ok) {
        fetchReports()
      } else {
        await galaxyAlert({ title: '오류', message: '신고 처리 중 오류가 발생했습니다.', variant: 'error' })
      }
    } catch (err) {
      await galaxyAlert({ title: '오류', message: '네트워크 오류가 발생했습니다.', variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="text-rose-500" /> 접수된 신고 관리
          {reports.length > 0 && (
            <span className="text-sm font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded-lg ml-2">
              총 <strong className="text-slate-200">{reports.length}</strong>건 대기 중
            </span>
          )}
        </h2>
        <button onClick={fetchReports} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition">
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && reports.length === 0 ? (
          <div className="p-8 text-center text-slate-500">로딩 중...</div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/50">
            대기 중인 신고 내역이 없습니다.
          </div>
        ) : reports.map(report => (
          <div key={report.id} className="p-6 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold px-2 py-1 bg-rose-500/20 text-rose-400 rounded-full">
                    {report.reason}
                  </span>
                  <div className="text-xs text-slate-500 mt-2">
                    신고자: <span className="text-slate-300">{report.users_user_reports_reporter_idTousers?.display_name} (@{report.users_user_reports_reporter_idTousers?.pixel_id})</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(report.created_at).toLocaleString()}
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-sm font-medium text-amber-500 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" /> 피신고자: {report.users_user_reports_reported_idTousers?.display_name} (@{report.users_user_reports_reported_idTousers?.pixel_id})
                  {report.users_user_reports_reported_idTousers?.is_shadow_banned && (
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-500 text-xs rounded">섀도우 밴 상태</span>
                  )}
                </div>
                
                {report.moments ? (
                  <div className={`text-sm p-3 rounded ${report.moments.is_deleted ? 'bg-slate-900/50 text-slate-500 line-through' : 'bg-slate-800 text-slate-300'}`}>
                    "{report.moments.content}"
                    {report.moments.is_deleted && <div className="text-xs text-rose-500 mt-2 font-medium">이미 삭제/블라인드된 콘텐츠입니다.</div>}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">연결된 모먼트 정보가 없습니다. (프로필 신고 등)</div>
                )}
              </div>
            </div>

            <div className="w-full md:w-64 flex flex-col justify-center gap-3 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
              <button 
                onClick={() => handleAction(report.id, 'approve', true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition text-sm font-medium border border-rose-500/20"
              >
                <CheckCircle className="w-4 h-4" /> 모먼트 삭제 및 승인
              </button>
              <button 
                onClick={() => handleAction(report.id, 'dismiss', false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition text-sm font-medium"
              >
                <XCircle className="w-4 h-4" /> 기각 (정상 콘텐츠)
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
