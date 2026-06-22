'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MoreVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

interface MomentKebabMenuProps {
  onEdit: () => void
  onDelete: () => void
  confirmMessage?: string
  align?: 'left' | 'right'
  vertical?: boolean
  editLabel?: string
  deleteLabel?: string
  cancelLabel?: string
  confirmLabel?: string
  className?: string
  iconClassName?: string
}

export function MomentKebabMenu({
  onEdit,
  onDelete,
  confirmMessage = '삭제하시겠습니까?',
  align = 'right',
  vertical = false,
  editLabel = '수정',
  deleteLabel = '삭제',
  cancelLabel = '취소',
  confirmLabel = '확인',
  className = '',
  iconClassName = '',
}: MomentKebabMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 외부 영역 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsConfirming(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleEditClick = () => {
    onEdit()
    setIsOpen(false)
  }

  const handleDeleteConfirmClick = () => {
    setIsConfirming(true)
  }

  const handleCancelDelete = () => {
    setIsConfirming(false)
    setIsOpen(false)
  }

  const handleConfirmDelete = () => {
    onDelete()
    setIsConfirming(false)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* 트리거 버튼 */}
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          setIsConfirming(false)
        }}
        className="p-1 rounded-lg border border-transparent hover:bg-slate-100 hover:border-slate-300 no-theme-hover transition text-slate-400 hover:text-slate-600 outline-none focus:outline-none ring-0 focus:ring-0"
        title="더보기"
      >
        {vertical ? (
          <MoreVertical className={`w-4 h-4 ${iconClassName}`} />
        ) : (
          <MoreHorizontal className={`w-4 h-4 ${iconClassName}`} />
        )}
      </button>

      {/* 드롭다운 레이어 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 bg-white border border-slate-200/80 rounded-xl shadow-md overflow-hidden min-w-[120px] z-50`}
          >
            {!isConfirming ? (
              <div className="flex flex-col py-1">
                {/* 수정 버튼 */}
                <button
                  onClick={handleEditClick}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition no-theme-hover text-left"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editLabel}
                </button>
                {/* 삭제 버튼 */}
                <button
                  onClick={handleDeleteConfirmClick}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 transition no-theme-hover text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleteLabel}
                </button>
              </div>
            ) : (
              /* 삭제 확인 단계 */
              <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 min-w-[140px]">
                <p className="text-[11px] text-slate-500 mb-2 text-center font-semibold whitespace-nowrap">
                  {confirmMessage}
                </p>
                <div className="flex gap-1.5 justify-center">
                  <button
                    onClick={handleCancelDelete}
                    className="flex-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:bg-slate-200/50 hover:text-slate-700 transition no-theme-hover text-center"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 px-2 py-1 rounded-lg bg-red-50 text-[11px] font-bold text-red-500 hover:bg-red-100 hover:text-red-700 transition no-theme-hover text-center"
                  >
                    {confirmLabel}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
