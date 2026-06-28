'use client'

/**
 * [생각그래프] 화면 D — 생각 상세 드로어 (78번 §2)
 * 
 * 생각 별 탭 시 열리는 하단 시트 드로어
 * - 글 본문, 작성자 정보, 연결된 생각 목록 표시
 * - 하단에 [이어가기][뒷받침][반론] 연결 글쓰기 버튼
 * 
 * 컴포넌트: ThoughtDetailDrawer (PixelDetailDrawer 패턴 계승)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { X, Link2, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { useGalaxyStore } from '@/stores/galaxyStore'
import type { ThoughtNodeData, ThoughtEdge } from '@/shared/lib/thought-graph/types'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { motion, AnimatePresence } from 'framer-motion'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useTranslations, useLocale } from 'next-intl'
import { usePanelResizable } from '@/shared/hooks/usePanelResizable'
import { MobileFullPopupWrapper } from '@/shared/ui/MobileFullPopupWrapper'
import { galaxyConfirm } from '@/stores/dialogStore'

export function ThoughtDetailDrawer() {
  const t = useTranslations('ThoughtGraph')
  const tCommon = useTranslations('Common')
  const locale = useLocale()

  const relationLabels = useMemo<Record<string, { label: string; emoji: string; color: string }>>(() => ({
    'extends': { label: t('relationExtends'), emoji: '', color: 'text-blue-400' },
    'supports': { label: t('relationSupports'), emoji: '', color: 'text-emerald-400' },
    'contradicts': { label: t('relationContradicts'), emoji: '', color: 'text-rose-400' },
    'refines': { label: t('relationRefines'), emoji: '✨', color: 'text-amber-400' },
    'instantiates': { label: t('relationInstantiates'), emoji: '📌', color: 'text-cyan-400' },
    'requires': { label: t('relationRequires'), emoji: '🔗', color: 'text-violet-400' },
    'triggered-by': { label: t('relationTriggeredBy'), emoji: '💡', color: 'text-yellow-400' },
    'near-miss': { label: t('relationNearMiss'), emoji: '🌙', color: 'text-gray-400' },
  }), [t])

  const selectedThoughtId = useGalaxyStore(s => s.selectedThoughtId)
  const selectThought = useGalaxyStore(s => s.selectThought)
  const thoughtNodes = useGalaxyStore(s => s.thoughtNodes)
  const thoughtEdges = useGalaxyStore(s => s.thoughtEdges)
  const viewMode = useGalaxyStore(s => s.viewMode)

  const userProfile = useUserStore(s => s.user)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const pixelPanelWidth = useGalaxyStore(s => s.pixelPanelWidth)
  const setPixelPanelWidth = useGalaxyStore(s => s.setPixelPanelWidth)

  const [isResizeHovered, setIsResizeHovered] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const { panelRef, handleResizeStart } = usePanelResizable({
    currentWidth: pixelPanelWidth,
    onWidthChange: setPixelPanelWidth,
    direction: 'left',
  })

  const isOpen = viewMode === 'thoughtGraph' && selectedThoughtId !== null

  // 탭 전환 시 스크롤 최상단으로 리셋
  useEffect(() => {
    if (selectedThoughtId && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [selectedThoughtId])

  // 선택된 노드
  const selectedNode = useMemo(() =>
    thoughtNodes.find(n => n.id === selectedThoughtId) || null,
    [thoughtNodes, selectedThoughtId]
  )

  // 현재 로그인 유저가 생각의 소유주(원작성자)인지 판별
  const isOwner = useMemo(() =>
    !!(userProfile && selectedNode && selectedNode.userId === userProfile.id),
    [userProfile, selectedNode]
  )

  // 연결된 엣지 + 상대 노드 (상대 노드 기준으로 중복을 제거하고 엣지들을 그룹화)
  const connectedItems = useMemo(() => {
    if (!selectedThoughtId) return []

    const peerMap = new Map<string, { peerNode: ThoughtNodeData; edges: ThoughtEdge[] }>()

    thoughtEdges
      .filter(e =>
        (e.source === selectedThoughtId || e.target === selectedThoughtId) &&
        e.status !== 'rejected'
      )
      .forEach(edge => {
        const peerId = edge.source === selectedThoughtId ? edge.target : edge.source
        const peerNode = thoughtNodes.find(n => n.id === peerId)
        if (peerNode) {
          if (!peerMap.has(peerId)) {
            peerMap.set(peerId, { peerNode, edges: [edge] })
          } else {
            peerMap.get(peerId)!.edges.push(edge)
          }
        }
      })

    return Array.from(peerMap.values())
  }, [selectedThoughtId, thoughtEdges, thoughtNodes])

  // 연결선 삭제
  const handleDeleteRelationship = useCallback(async (relationshipId: string) => {
    try {
      const res = await fetch(`/api/thought-graph/relationships/${relationshipId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        // 로컬 상태에서도 제거
        const updated = thoughtEdges.filter(e => e.id !== relationshipId)
        useGalaxyStore.getState().setThoughtData(thoughtNodes, updated)
      }
    } catch (err) {
      console.error('[ThoughtGraph] 연결 삭제 실패:', err)
    }
  }, [thoughtEdges, thoughtNodes])

  // 연결된 생각으로 이동
  const handleNavigate = useCallback((momentId: string) => {
    selectThought(momentId)
  }, [selectThought])

  const [isSynthesizing, setIsSynthesizing] = useState(false)

  // 지식 합성
  const handleSynthesize = useCallback(async () => {
    if (!selectedNode || connectedItems.length === 0) return

    const confirmMessage = t('synthesizeConfirm') || '선택한 생각들을 바탕으로 AI 지식 합성을 진행하시겠습니까?\n(AI API 호출에 따른 토큰 비용이 발생할 수 있습니다.)';
    const isOk = await galaxyConfirm({
      title: tCommon('confirm'),
      message: confirmMessage,
    })
    if (!isOk) return

    setIsSynthesizing(true)
    try {
      const nodeIds = [selectedNode.id, ...connectedItems.map(item => item.peerNode?.id).filter(Boolean)]
      const res = await fetch('/api/thought-graph/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds,
          galaxyKey: selectedNode.galaxyKey || useGalaxyStore.getState().galaxyKey,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.content) {
          // 합성 초안 저장 및 모달 기동
          useGalaxyStore.getState().setSynthesizedDraft(data.content)
          useGalaxyStore.getState().setIsMomentModalOpen(true)
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        alert(errData.error || t('synthesizeFailNoKey'))
      }
    } catch (err) {
      console.error('[ThoughtGraph:Synthesize] 실패:', err)
      alert(t('synthesizeError'))
    } finally {
      setIsSynthesizing(false)
    }
  }, [selectedNode, connectedItems])

  // 닫기
  const handleClose = useCallback(() => {
    selectThought(null)
  }, [selectThought])

  const resizeHandle = !isMobile && (
    <div
      onPointerDown={handleResizeStart}
      onMouseEnter={() => setIsResizeHovered(true)}
      onMouseLeave={() => setIsResizeHovered(false)}
      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors z-50"
      style={isResizeHovered ? { backgroundColor: '#818CF84D' } : undefined}
    />
  )

  return (
    <MobileFullPopupWrapper
      isOpen={isOpen && !!selectedNode}
      onClose={handleClose}
      transitionType="slide-up"
      desktopWidth={pixelPanelWidth}
      desktopStyle={{
        overflow: 'visible',
      }}
      desktopClassName="bg-slate-950/95 backdrop-blur-3xl text-white border-l border-white/10 shrink-0 pointer-events-auto flex flex-col shadow-2xl h-full"
      className="bg-slate-950/95 backdrop-blur-3xl text-white"
      resizeHandle={resizeHandle}
    >

          {/* 데스크탑 패널 헤더 — 모바일 숨김 */}
          {!isMobile && (
            <div className="flex items-center justify-between px-3 h-9 border-b border-white/5 shrink-0">
              <div className="w-7" />
              <div className="flex items-center gap-1.5 justify-center flex-1 min-w-0">
                <span className="text-[14px] font-bold text-white/40">{t('drawerTitle')}</span>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 border border-white/10 text-white/60 hover:text-white hover:bg-white/20 transition shrink-0"
                title="사이드바 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedNode && (
            <>
          {/* 내부 스크롤 가능한 바디 컨테이너 */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 custom-scrollbar"
          >
            {/* 모바일용 드래그 핸들 */}
            {isMobile && (
              <div className="flex justify-center pb-2 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
            )}

            {/* 헤더 — 작성자 + summary */}
            <div className="flex items-start gap-3 shrink-0">
              {/* 아바타 */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 text-white text-sm font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]">
                {selectedNode.avatarUrl ? (
                  <img src={selectedNode.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                ) : (
                  selectedNode.displayName?.charAt(0) || '✦'
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-[16px] leading-tight break-words">
                  {selectedNode.summary || t('drawerTitle')}
                </h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-white/50 text-[12px]">{selectedNode.displayName}</span>
                  <span className="text-white/20 text-[12px]">
                    {new Date(selectedNode.createdAt).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* 모바일용 닫기 버튼 */}
              {isMobile && (
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/40 hover:text-white/80 shrink-0"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* 본문 / 수납 글 멀티 카드 리스트 */}
            {selectedNode.posts && selectedNode.posts.length > 0 ? (
              <div className="flex flex-col gap-3 shrink-0">
                {selectedNode.posts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col gap-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {post.avatarUrl ? (
                          <img src={post.avatarUrl} className="w-full h-full rounded-full object-cover" alt="" />
                        ) : (
                          post.displayName?.charAt(0) || '✦'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-white/90 truncate">
                          {post.displayName}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {new Date(post.createdAt).toLocaleDateString(locale, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                    <p className="text-[15px] text-white/80 leading-relaxed whitespace-pre-wrap break-words">
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              selectedNode.content && (
                <div className="shrink-0">
                  <p className="text-white/80 text-[16px] leading-relaxed whitespace-pre-wrap">
                    {selectedNode.content.length > 500
                      ? selectedNode.content.slice(0, 500) + '...'
                      : selectedNode.content}
                  </p>
                </div>
              )
            )}

            {/* 구분선 */}
            <div className="border-t border-white/5 shrink-0" />

            {/* 연결된 생각 */}
            <div className="flex-1 flex flex-col min-h-[120px]">
              <div className="flex items-center gap-1.5 mb-2 shrink-0">
                <Link2 size={14} className="text-indigo-400" />
                <span className="text-white/60 text-[12px] font-bold">
                  {t('connectedThoughts', { count: connectedItems.length })}
                </span>
              </div>

              {connectedItems.length === 0 ? (
                <p className="text-white/30 text-[12px] py-6 text-center shrink-0">
                  {t('noConnectedThoughts')}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {connectedItems.map(({ peerNode, edges }) => {
                    if (!peerNode) return null
                    const primaryRel = relationLabels[edges[0].relationType] || relationLabels.extends
                    const joinedLabels = edges
                      .map(edge => {
                        const rel = relationLabels[edge.relationType] || relationLabels.extends
                        return `${rel.emoji ? rel.emoji + ' ' : ''}${rel.label}`
                      })
                      .join(' | ')

                    return (
                      <div
                        key={peerNode.id}
                        className="group bg-white/5 border border-white/10 rounded-2xl p-3.5 hover:bg-white/[0.07] transition-colors cursor-pointer"
                        onClick={() => handleNavigate(peerNode.id)}
                      >
                        {/* 상단: 작성자 + 관계 배지 + 삭제/이동 */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[14px] shrink-0 text-white/40">✦</span>
                          <span className="text-white/60 text-[13px] font-medium truncate">{peerNode.displayName}</span>
                          <span className={`text-[11px] font-bold ${primaryRel.color} flex items-center gap-0.5 shrink-0`}>
                            <span>{joinedLabels}</span>
                          </span>
                          <div className="flex-1" />

                          {/* 삭제 (호버 - 소유주만 허용) */}
                          {isOwner && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteRelationship(edges[0].id)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-rose-500/20 transition-all text-white/30 hover:text-rose-400 shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}

                          <ChevronRight size={14} className="text-white/20 shrink-0" />
                        </div>

                        {/* 본문 전문 */}
                        <p className="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap break-words">
                          {peerNode.content || peerNode.summary || t('drawerTitle')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 지식 합성 버튼 */}
          {connectedItems.length > 0 && (
            <div className="px-5 pb-2 shrink-0">
              <button
                id="btn-synthesize-knowledge"
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-white font-bold text-[13px] shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSynthesizing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t('synthesizing')}</span>
                  </>
                ) : (
                  <>
                    <span>✦</span>
                    <span>{t('synthesizeBtn')}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* 하단 연결 글쓰기 버튼 — 패널 하단 고정 */}
          <div className="px-5 pt-2 pb-4 flex items-center gap-2 shrink-0 border-t border-white/5">
            {(['extends', 'supports', 'contradicts'] as const).map((type) => {
              const rel = relationLabels[type]
              return (
                <button
                  key={type}
                  id={`btn-reply-${type}`}
                  onClick={() => {
                    // MomentModal 열기 + pre-connected 설정
                    useGalaxyStore.getState().setPreConnectedThought({
                      id: selectedNode.id,
                      content: selectedNode.content || selectedNode.summary || '부모 생각',
                      relationType: type,
                    })
                    useGalaxyStore.getState().setIsMomentModalOpen(true)
                  }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-white/70 hover:text-white text-[12px] font-bold active:scale-95 shadow-sm"
                >
                  <span>{rel.emoji}</span>
                  <span>{rel.label}</span>
                </button>
              )
            })}
          </div>
            </>
          )}
    </MobileFullPopupWrapper>
  )
}
