'use client'

import React, { useState, useEffect } from 'react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { motion } from 'framer-motion'
import { Send, UserCircle, MessageSquareReply, Pencil, Trash2, X } from 'lucide-react'
import { useUserStore } from '@/entities/user/model/useUserStore'
import { useToastStore } from '@/stores/toastStore'
import { useTranslations } from 'next-intl'
import { MomentKebabMenu } from './MomentKebabMenu'
import { relativeTime } from '@/shared/utils/relativeTime'

interface MomentCommentAccordionProps {
  momentId: string
  onUpdateCount: (delta: number) => void
}

export function MomentCommentAccordion({ momentId, onUpdateCount }: MomentCommentAccordionProps) {
  const userProfile = useUserStore(s => s.user)
  const addToast = useToastStore(s => s.addToast)
  const t = useTranslations('Moment')

  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [input, setInput] = useState('')
  
  // 수정 (Edit) 관련 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // 답글 (Reply) 관련 상태
  const [replyingToId, setReplyingToId] = useState<string | null>(null)

  const showToast = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    addToast({ title: t('records').split('·')[0].trim(), message: msg, type })
  }

  const fetchComments = async (cursor: string | null = null) => {
    setIsLoading(true)
    try {
      const url = `/api/moments/${momentId}/comments` + (cursor ? `?cursor=${cursor}` : '')
      const res = await fetch(url)
      if (res.ok) {
        const { comments, nextCursor: newCursor } = await res.json()
        setData(prev => cursor ? [...prev, ...comments] : comments)
        setNextCursor(newCursor)
      }
    } catch (err) {
      console.error(err)
      showToast(t('commentFetchError'), 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // 마운트 시 최초 데이터 로딩
  useEffect(() => {
    fetchComments()
  }, [momentId])

  const handlePostComment = async () => {
    const trimmed = input.trim()
    if (!trimmed || !userProfile) return
    if (isLoading) return

    const tempId = `temp-${Date.now()}`
    const isReply = !!replyingToId
    const parentId = replyingToId

    const tempComment = {
      id: tempId,
      user_id: userProfile.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      parent_id: parentId,
      user: {
        id: userProfile.id,
        display_name: userProfile.display_name,
        avatar_image_url: userProfile.avatar_url, // UI용 매핑 (의도된 임시값)
        supernova_tier: userProfile.supernova_tier
      },
      replies: []
    }

    // 낙관적 업데이트
    setInput('')
    setReplyingToId(null)
    onUpdateCount(1)

    setData(prev => {
      if (isReply) {
        return prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies || []), tempComment] } : c)
      }
      return [tempComment, ...prev]
    })

    try {
      const res = await fetch(`/api/moments/${momentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, parentId })
      })
      if (!res.ok) throw new Error('Failed to post')
      const realComment = await res.json()

      // tempId를 진짜 id로 교체
      setData(prev => {
        if (isReply) {
          return prev.map(c => c.id === parentId ? {
            ...c,
            replies: c.replies.map((r: any) => r.id === tempId ? realComment : r)
          } : c)
        }
        return prev.map(c => c.id === tempId ? realComment : c)
      })
    } catch (e) {
      showToast(t('commentWriteError'), 'error')
      onUpdateCount(-1)
      setData(prev => {
        if (isReply) {
          return prev.map(c => c.id === parentId ? { ...c, replies: c.replies.filter((r: any) => r.id !== tempId) } : c)
        }
        return prev.filter(c => c.id !== tempId)
      })
    }
  }

  const handleDeleteComment = async (commentId: string, parentId: string | null = null) => {
    onUpdateCount(-1)
    setConfirmDeleteId(null)
    setData(prev => {
      if (parentId) {
        return prev.map(c => c.id === parentId ? { ...c, replies: c.replies.filter((r: any) => r.id !== commentId) } : c)
      }
      return prev.filter(c => c.id !== commentId)
    })

    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
    } catch (e) {
      showToast(t('commentDeleteError'), 'error')
      fetchComments() 
      onUpdateCount(1)
    }
  }

  const handleEditComment = async (commentId: string, parentId: string | null = null) => {
    const trimmed = editInput.trim()
    if (!trimmed || trimmed === '') return

    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed })
      })
      if (!res.ok) throw new Error('Failed to edit')
      
      setData(prev => {
        if (parentId) {
          return prev.map(c => c.id === parentId ? {
            ...c,
            replies: c.replies.map((r: any) => r.id === commentId ? { ...r, content: trimmed } : r)
          } : c)
        }
        return prev.map(c => c.id === commentId ? { ...c, content: trimmed } : c)
      })
      setEditingId(null)
      setEditInput('')
    } catch (e) {
      showToast(t('commentEditError'), 'error')
    }
  }

  const startEditing = (comment: any) => {
    setEditingId(comment.id)
    setEditInput(comment.content)
    setReplyingToId(null)
  }

  const renderComment = (comment: any, isReply = false, parentId: string | null = null) => {
    const isEditing = editingId === comment.id
    const isMyComment = comment.user.id === userProfile?.id

    return (
      <div key={comment.id} className={`flex gap-2.5 items-start ${isReply ? 'mt-2 ml-8' : ''}`}>
        {!isReply && (
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 mt-1">
            {comment.user.avatar_image_url ? (
              <img src={comment.user.avatar_image_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-4 h-4 text-slate-400" />
            )}
          </div>
        )}
        {isReply && (
          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 mt-1">
            {comment.user.avatar_image_url ? (
              <img src={comment.user.avatar_image_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-3 h-3 text-slate-400" />
            )}
          </div>
        )}
        
        <div className="flex-1 min-w-0 bg-slate-100/60 border border-slate-200/80 rounded-xl p-2.5">
          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center min-w-0">
              <span className="text-[12px] font-normal text-[rgb(var(--theme-rgb))] truncate">{comment.user.display_name}</span>
              <span className="text-[11px] text-slate-400 font-medium ml-2 shrink-0">{relativeTime(comment.created_at, t)}</span>
            </div>
            {isMyComment && !isEditing && (
              <MomentKebabMenu
                editLabel={t('editBtn') || '수정'}
                deleteLabel={t('deleteBtn') || '삭제'}
                cancelLabel={t('cancelBtn') || '취소'}
                confirmLabel={t('confirmBtn') || '확인'}
                confirmMessage="삭제하시겠습니까?"
                onEdit={() => startEditing(comment)}
                onDelete={() => handleDeleteComment(comment.id, parentId)}
              />
            )}
          </div>
          
          {isEditing ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={editInput}
                onChange={e => setEditInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-[14px] text-slate-800 placeholder-slate-400 resize-none outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300/50 font-medium"
                rows={2}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)} className="text-sm text-slate-400 hover:text-slate-600 font-bold">{t('cancelBtn')}</button>
                <button onClick={() => handleEditComment(comment.id, parentId)} className="text-sm font-bold text-[rgb(var(--theme-rgb))] hover:opacity-80">{t('saveBtn')}</button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-slate-700 font-medium break-words leading-relaxed whitespace-pre-wrap">{comment.content}</p>
          )}

          {!isReply && !isEditing && userProfile && (
            <div className="mt-2 flex items-center">
              <button 
                onClick={() => { setReplyingToId(replyingToId === comment.id ? null : comment.id); setEditingId(null); }} 
                className="flex items-center gap-1 text-[12px] font-normal text-slate-600 hover:text-slate-900 transition-colors"
              >
                <MessageSquareReply className="w-3.5 h-3.5" /> {t('replyTo')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
        {replyingToId && (
          <div className="flex items-center justify-between bg-[rgba(var(--theme-rgb),0.08)] border border-[rgba(var(--theme-rgb),0.2)] rounded-lg px-3 py-1.5 ml-8">
            <span className="text-sm text-[rgb(var(--theme-rgb))] font-bold flex items-center gap-1">
              <MessageSquareReply className="w-3 h-3" />
              {t('replyWriting')}
            </span>
            <button onClick={() => setReplyingToId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3 h-3"/></button>
          </div>
        )}
        {userProfile ? (
          <div className={`flex items-center gap-2 ${replyingToId ? 'ml-8' : ''}`}>
            <input
              type="text"
              placeholder={replyingToId ? t('replyPlaceholder') : t('commentPlaceholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePostComment()}
              className="flex-1 bg-slate-100/50 border border-slate-200/80 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-500 focus:border-slate-300 focus:bg-white transition-all outline-none font-medium"
            />
            <button
              onClick={() => handlePostComment()}
              disabled={!input.trim() || isLoading}
              className="group p-2.5 rounded-xl bg-[rgb(var(--theme-rgb))] disabled:bg-slate-200 disabled:opacity-100 disabled:cursor-not-allowed transition-colors hover:opacity-90 shrink-0 border-none"
            >
              <Send className="w-4 h-4 text-white group-disabled:text-slate-400 transition-colors" fill="currentColor" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center p-3.5 mt-1 bg-slate-100/60 border border-slate-200/80 rounded-xl">
            <span className="text-sm font-bold text-slate-400">{t('loginForComment')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-2">
        {isLoading && data.length === 0 ? (
          <div className="flex items-center justify-center h-[96px] text-sm font-medium text-slate-400">
            <LogoSpinner size={16} />
            <span className="ml-2">{t('loadingComments')}</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-[96px] text-sm font-medium text-slate-400">
            {t('firstComment')}
          </div>
        ) : (
          data.map(comment => (
            <div key={comment.id} className="flex flex-col">
              {renderComment(comment, false, null)}
              {comment.replies && comment.replies.length > 0 && (
                <div className="flex flex-col mt-1">
                  {comment.replies.map((reply: any) => renderComment(reply, true, comment.id))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {nextCursor && (
        <button
          onClick={() => fetchComments(nextCursor)}
          disabled={isLoading}
          className="w-full py-3 mt-2 text-sm font-extrabold text-slate-400 hover:text-slate-600 transition-colors"
        >
          {isLoading ? t('loadingOlderComments') : t('loadOlderBtn')}
        </button>
      )}
      </div>
    </motion.div>
  )
}

