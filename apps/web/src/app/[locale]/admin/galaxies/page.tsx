'use client'

import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Edit2, Trash2, X, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { galaxyAlert, galaxyConfirm } from '@/stores/dialogStore'

/* ─── Types ─── */
interface Category {
  id: string; key: string; name: string; description: string | null
  icon: string | null; color: string | null; type: string
  isActive: boolean; sortOrder: number
}
interface Galaxy {
  id: string; key: string; partnerCode: string; name: string
  description: string | null; icon: string | null; color: string | null
  centerX: number; centerY: number; joinType: string
  isActive: boolean; isRoot: boolean; sortOrder: number
  categories: Category[]
}

/* ─── Modal Backdrop ─── */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="text-lg font-bold text-slate-200">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

/* ─── Input Field ─── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400 mb-1 block">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-600 mt-0.5 block">{hint}</span>}
    </label>
  )
}
const inputCls = "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"

/* ─── Main Page ─── */
export default function AdminGalaxiesPage() {
  const [galaxies, setGalaxies] = useState<Galaxy[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Modal states
  const [showCreateGalaxy, setShowCreateGalaxy] = useState(false)
  const [editGalaxy, setEditGalaxy] = useState<Galaxy | null>(null)
  const [showCreateCat, setShowCreateCat] = useState<string | null>(null) // galaxyId
  const [editCat, setEditCat] = useState<{ galaxyId: string; cat: Category } | null>(null)

  const fetchGalaxies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/galaxies')
      const json = await res.json()
      if (json.data) setGalaxies(json.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchGalaxies() }, [fetchGalaxies])

  /* ─── Galaxy CRUD handlers ─── */
  const handleCreateGalaxy = async (form: Record<string, any>) => {
    const res = await fetch('/api/admin/galaxies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const json = await res.json()
    if (!res.ok) { await galaxyAlert({ title: '생성 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    setShowCreateGalaxy(false)
    fetchGalaxies()
  }

  const handleUpdateGalaxy = async (id: string, form: Record<string, any>) => {
    const res = await fetch(`/api/admin/galaxies/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const json = await res.json()
    if (!res.ok) { await galaxyAlert({ title: '수정 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    setEditGalaxy(null)
    fetchGalaxies()
  }

  const handleDeleteGalaxy = async (galaxy: Galaxy) => {
    if (galaxy.isRoot || galaxy.key === 'PIXELYF' || galaxy.partnerCode === 'pixelyf') {
      await galaxyAlert({ title: '삭제 불가', message: '최상위 기본 은하(픽셀리프)는 삭제할 수 없습니다.', variant: 'warning' })
      return
    }
    const ok = await galaxyConfirm({ title: '은하 삭제', message: `"${galaxy.name}" 은하와 하위 카테고리가 모두 삭제됩니다. 계속하시겠습니까?`, variant: 'danger', confirmText: '삭제', confirmDanger: true })
    if (!ok) return
    const res = await fetch(`/api/admin/galaxies/${galaxy.id}`, { method: 'DELETE' })
    if (!res.ok) { const json = await res.json(); await galaxyAlert({ title: '삭제 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    fetchGalaxies()
  }

  /* ─── Category CRUD handlers ─── */
  const handleCreateCat = async (galaxyId: string, form: Record<string, any>) => {
    const res = await fetch(`/api/admin/galaxies/${galaxyId}/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const json = await res.json()
    if (!res.ok) { await galaxyAlert({ title: '생성 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    setShowCreateCat(null)
    fetchGalaxies()
  }

  const handleUpdateCat = async (galaxyId: string, catId: string, form: Record<string, any>) => {
    const res = await fetch(`/api/admin/galaxies/${galaxyId}/categories/${catId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    if (!res.ok) { const json = await res.json(); await galaxyAlert({ title: '수정 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    setEditCat(null)
    fetchGalaxies()
  }

  const handleDeleteCat = async (galaxyId: string, cat: Category) => {
    const ok = await galaxyConfirm({ title: '카테고리 삭제', message: `"${cat.name}" 카테고리를 삭제하시겠습니까?`, variant: 'danger', confirmText: '삭제', confirmDanger: true })
    if (!ok) return
    const res = await fetch(`/api/admin/galaxies/${galaxyId}/categories/${cat.id}`, { method: 'DELETE' })
    if (!res.ok) { const json = await res.json(); await galaxyAlert({ title: '삭제 실패', message: json.error || '오류가 발생했습니다.', variant: 'error' }); return }
    fetchGalaxies()
  }

  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Globe className="text-cyan-400" /> 시스템 은하 제어
        </h2>
        <button onClick={() => setShowCreateGalaxy(true)} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-lg text-sm font-medium transition flex items-center gap-1">
          <Plus className="w-4 h-4" /> 새 은하 생성
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">로딩 중...</div>
      ) : (
        <div className="space-y-4">
          {galaxies.map(galaxy => (
            <div key={galaxy.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              {/* Galaxy Header Row */}
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-4 h-4 rounded-full shrink-0 border-2" style={{ borderColor: galaxy.color || '#888', backgroundColor: galaxy.isActive ? (galaxy.color || '#888') : 'transparent' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-200 truncate">{galaxy.name}</h3>
                      {galaxy.isRoot && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">ROOT</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${galaxy.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                        {galaxy.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 font-mono">
                      <span>KEY: {galaxy.key}</span>
                      <span>·</span>
                      <span>/{galaxy.partnerCode}</span>
                      <span>·</span>
                      <span>({galaxy.centerX}, {galaxy.centerY})</span>
                    </div>
                    {galaxy.description && (
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-md">{galaxy.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditGalaxy(galaxy)} className="p-2 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition" title="수정">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {!galaxy.isRoot && (
                    <button onClick={() => handleDeleteGalaxy(galaxy)} className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition" title="삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => toggle(galaxy.id)} className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition">
                    {expanded[galaxy.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expandable Categories Section */}
              {expanded[galaxy.id] && (
                <div className="border-t border-slate-800 p-5 bg-slate-950/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-medium text-slate-300">하위 카테고리 ({galaxy.categories.length})</h4>
                    <button onClick={() => setShowCreateCat(galaxy.id)} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition">
                      <Plus className="w-3 h-3" /> 추가
                    </button>
                  </div>
                  {galaxy.categories.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-800 rounded-lg">등록된 카테고리가 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                      {galaxy.categories.map(cat => (
                        <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800 group">
                          <div className="flex items-center gap-3 min-w-0">
                            {cat.color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-200 font-medium">{cat.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">({cat.key})</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${cat.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                  {cat.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              {cat.description && <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-sm">{cat.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                            <button onClick={() => setEditCat({ galaxyId: galaxy.id, cat })} className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteCat(galaxy.id, cat)} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Create Galaxy Modal ─── */}
      <GalaxyFormModal open={showCreateGalaxy} title="새 은하 생성" onClose={() => setShowCreateGalaxy(false)} onSubmit={handleCreateGalaxy} />

      {/* ─── Edit Galaxy Modal ─── */}
      {editGalaxy && (
        <GalaxyFormModal open={true} title={`"${editGalaxy.name}" 은하 수정`} galaxy={editGalaxy}
          onClose={() => setEditGalaxy(null)}
          onSubmit={(form) => handleUpdateGalaxy(editGalaxy.id, form)}
        />
      )}

      {/* ─── Create Category Modal ─── */}
      {showCreateCat && (
        <CategoryFormModal open={true} title="카테고리 추가" onClose={() => setShowCreateCat(null)}
          onSubmit={(form) => handleCreateCat(showCreateCat, form)}
        />
      )}

      {/* ─── Edit Category Modal ─── */}
      {editCat && (
        <CategoryFormModal open={true} title={`"${editCat.cat.name}" 수정`} cat={editCat.cat}
          onClose={() => setEditCat(null)}
          onSubmit={(form) => handleUpdateCat(editCat.galaxyId, editCat.cat.id, form)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
/* Galaxy Form Modal                                            */
/* ══════════════════════════════════════════════════════════════ */
function GalaxyFormModal({ open, title, galaxy, onClose, onSubmit }: {
  open: boolean; title: string; galaxy?: Galaxy; onClose: () => void
  onSubmit: (form: Record<string, any>) => Promise<void>
}) {
  const isEdit = !!galaxy
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    key: galaxy?.key || '',
    partnerCode: galaxy?.partnerCode || '',
    name: galaxy?.name || '',
    description: galaxy?.description || '',
    icon: galaxy?.icon || '',
    color: galaxy?.color || '#A855F7',
    centerX: galaxy?.centerX ?? 0,
    centerY: galaxy?.centerY ?? 0,
    joinType: galaxy?.joinType || 'lazy',
    isActive: galaxy?.isActive ?? true,
    sortOrder: galaxy?.sortOrder ?? 0,
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!isEdit && (!form.key || !form.partnerCode || !form.name)) {
      await galaxyAlert({ title: '입력 오류', message: 'Key, 파트너코드, 이름은 필수입니다.', variant: 'warning' })
      return
    }
    setSubmitting(true)
    try {
      const payload = isEdit
        ? { name: form.name, description: form.description || null, icon: form.icon || null, color: form.color || null, centerX: Number(form.centerX), centerY: Number(form.centerY), joinType: form.joinType, isActive: form.isActive, sortOrder: Number(form.sortOrder) }
        : { ...form, centerX: Number(form.centerX), centerY: Number(form.centerY), sortOrder: Number(form.sortOrder), description: form.description || null, icon: form.icon || null, color: form.color || null }
      await onSubmit(payload)
    } finally { setSubmitting(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!isEdit && (
        <>
          <Field label="Key (시스템 고유키)" hint="예: PIXELYF_CORE — 생성 후 변경 불가">
            <input className={inputCls} value={form.key} onChange={e => set('key', e.target.value.toUpperCase())} placeholder="GALAXY_KEY" />
          </Field>
          <Field label="Partner Code (URL 슬러그)" hint="소문자/숫자/_ 만 가능, 생성 후 변경 불가">
            <input className={inputCls} value={form.partnerCode} onChange={e => set('partnerCode', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="galaxy_slug" />
          </Field>
        </>
      )}
      <Field label="이름">
        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="은하 이름" />
      </Field>
      <Field label="텍스트 뱃지 (Description)" hint="캔버스 상단에 표시되는 문구">
        <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="성장을 기록하고 발견하는 1095일의 기록" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="아이콘 (Lucide)">
          <input className={inputCls} value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="Rocket" />
        </Field>
        <Field label="대표색">
          <div className="flex gap-2">
            <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-10 h-10 rounded border border-slate-700 bg-transparent cursor-pointer" />
            <input className={inputCls} value={form.color} onChange={e => set('color', e.target.value)} placeholder="#A855F7" />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Center X">
          <input type="number" className={inputCls} value={form.centerX} onChange={e => set('centerX', e.target.value)} />
        </Field>
        <Field label="Center Y">
          <input type="number" className={inputCls} value={form.centerY} onChange={e => set('centerY', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Join Type">
          <select className={inputCls} value={form.joinType} onChange={e => set('joinType', e.target.value)}>
            <option value="auto">auto (자동 참여)</option>
            <option value="lazy">lazy (지연 참여)</option>
            <option value="invite">invite (초대 전용)</option>
          </select>
        </Field>
        <Field label="정렬 순서">
          <input type="number" className={inputCls} value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded border-slate-600" />
        <span className="text-sm text-slate-300">활성화</span>
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition">취소</button>
        <button onClick={submit} disabled={submitting} className="px-5 py-2 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-lg text-sm font-medium transition flex items-center gap-1 disabled:opacity-50">
          <Save className="w-4 h-4" /> {submitting ? '저장 중...' : (isEdit ? '수정 저장' : '생성')}
        </button>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════════ */
/* Category Form Modal                                          */
/* ══════════════════════════════════════════════════════════════ */
function CategoryFormModal({ open, title, cat, onClose, onSubmit }: {
  open: boolean; title: string; cat?: Category; onClose: () => void
  onSubmit: (form: Record<string, any>) => Promise<void>
}) {
  const isEdit = !!cat
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    key: cat?.key || '',
    name: cat?.name || '',
    description: cat?.description || '',
    icon: cat?.icon || '',
    color: cat?.color || '',
    type: cat?.type || 'content_tag',
    isActive: cat?.isActive ?? true,
    sortOrder: cat?.sortOrder ?? 0,
  })

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!isEdit && (!form.key || !form.name)) { await galaxyAlert({ title: '입력 오류', message: 'Key와 이름은 필수입니다.', variant: 'warning' }); return }
    setSubmitting(true)
    try {
      const payload = isEdit
        ? { name: form.name, description: form.description || null, icon: form.icon || null, color: form.color || null, type: form.type, isActive: form.isActive, sortOrder: Number(form.sortOrder) }
        : { ...form, sortOrder: Number(form.sortOrder), description: form.description || null, icon: form.icon || null, color: form.color || null }
      await onSubmit(payload)
    } finally { setSubmitting(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {!isEdit && (
        <Field label="Key (고유키)" hint="예: INQUE, GLOBAL — 생성 후 변경 불가">
          <input className={inputCls} value={form.key} onChange={e => set('key', e.target.value.toUpperCase())} placeholder="CATEGORY_KEY" />
        </Field>
      )}
      <Field label="이름">
        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="카테고리 이름" />
      </Field>
      <Field label="텍스트 뱃지 (Description)" hint="해당 카테고리 진입 시 캔버스에 표시">
        <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="성장을 기록하고 발견하는 1095일의 기록" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="아이콘 (Lucide)">
          <input className={inputCls} value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="Star" />
        </Field>
        <Field label="대표색">
          <div className="flex gap-2">
            {form.color && <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-10 h-10 rounded border border-slate-700 bg-transparent cursor-pointer" />}
            <input className={inputCls} value={form.color} onChange={e => set('color', e.target.value)} placeholder="#FBBF24" />
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="타입">
          <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="content_tag">content_tag</option>
            <option value="view_mode">view_mode</option>
          </select>
        </Field>
        <Field label="정렬 순서">
          <input type="number" className={inputCls} value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded border-slate-600" />
        <span className="text-sm text-slate-300">활성화</span>
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition">취소</button>
        <button onClick={submit} disabled={submitting} className="px-5 py-2 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-lg text-sm font-medium transition flex items-center gap-1 disabled:opacity-50">
          <Save className="w-4 h-4" /> {submitting ? '저장 중...' : (isEdit ? '수정 저장' : '생성')}
        </button>
      </div>
    </Modal>
  )
}
