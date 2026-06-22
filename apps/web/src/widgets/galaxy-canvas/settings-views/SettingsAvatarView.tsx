'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Crown, Check, ShoppingBag, UserRound, Scissors, Shirt, Gem, Zap } from 'lucide-react'
import { LogoSpinner } from '@/shared/ui/LogoSpinner'
import { galaxyConfirm, galaxyAlert } from '@/stores/dialogStore'
import * as PIXI from 'pixi.js'
import { PixelSkinSpine } from '@/entities/user/ui/PixelSkinSpine'
import { useTranslations } from 'next-intl'
import { useUserStore } from '@/entities/user/model/useUserStore'

// ─── 슬롯 카테고리 정의 ───
const SLOT_CATEGORIES = [
  { id: 'character_base', labelKey: 'catCharacter' as const, Icon: UserRound },
  { id: 'hair', labelKey: 'catHair' as const, Icon: Scissors },
  { id: 'top', labelKey: 'catTop' as const, Icon: Shirt },
  { id: 'bottom', labelKey: 'catBottom' as const, Icon: Shirt },
  { id: 'accessory', labelKey: 'catAccessory' as const, Icon: Gem },
  { id: 'effect', labelKey: 'catEffect' as const, Icon: Zap },
] as const

// ─── 등급 색상 ───
const RARITY_COLORS: Record<string, string> = {
  common: 'text-white/90 border-white/10',
  rare: 'text-blue-400 border-white/10',
  epic: 'text-purple-400 border-white/10',
  legendary: 'text-amber-400 border-white/10',
}
const RARITY_LABEL_KEYS: Record<string, string> = {
  common: 'rarityCommon',
  rare: 'rarityRare',
  epic: 'rarityEpic',
  legendary: 'rarityLegendary',
}

interface AvatarItem {
  id: string
  item_code: string
  item_type: string
  name: string
  description?: string
  price_star_dust?: number
  is_limited: boolean
  spine_asset_path?: string
  preview_image_url?: string
  slot_category?: string
  rarity: string
  owned: boolean
}

interface AvatarConfig {
  base_character: string
  equipped_slots: Record<string, string>
}

interface SettingsAvatarViewProps {
  userProfile: { stardust_balance?: number }
  hideInlineFooter?: boolean
  onFooterChange?: (node: React.ReactNode | null) => void
}



export function SettingsAvatarView({ userProfile, hideInlineFooter, onFooterChange }: SettingsAvatarViewProps) {
  const t = useTranslations('Settings')
  const BASE_CHARACTERS: AvatarItem[] = [
    { id: 'base-0', item_code: 'none', item_type: 'avatar', name: t('baseNone'), description: t('baseNoneDesc'), price_star_dust: 0, is_limited: false, spine_asset_path: '', preview_image_url: '', slot_category: 'character_base', rarity: 'common', owned: true },
    // { id: 'base-1', item_code: 'spineboy', item_type: 'avatar', name: t('baseSpineboy'), description: t('baseSpineboyDesc'), price_star_dust: 0, is_limited: false, spine_asset_path: '', preview_image_url: '', slot_category: 'character_base', rarity: 'common', owned: true },
    // { id: 'base-2', item_code: 'raptor', item_type: 'avatar', name: t('baseRaptor'), description: t('baseRaptorDesc'), price_star_dust: 0, is_limited: false, spine_asset_path: '', preview_image_url: '', slot_category: 'character_base', rarity: 'common', owned: true },
    // { id: 'base-3', item_code: 'alien', item_type: 'avatar', name: t('baseAlien'), description: t('baseAlienDesc'), price_star_dust: 0, is_limited: false, spine_asset_path: '', preview_image_url: '', slot_category: 'character_base', rarity: 'common', owned: true },
    // { id: 'base-4', item_code: 'stella', item_type: 'avatar', name: t('baseStella'), description: t('baseStellaDesc'), price_star_dust: 0, is_limited: false, spine_asset_path: '', preview_image_url: '', slot_category: 'character_base', rarity: 'common', owned: true },
  ]

  const [config, setConfig] = useState<AvatarConfig>({ base_character: 'none', equipped_slots: {} })
  const [previewConfig, setPreviewConfig] = useState<AvatarConfig>({ base_character: 'none', equipped_slots: {} }) // 입어보기용 상태
  const [items, setItems] = useState<AvatarItem[]>(BASE_CHARACTERS)
  const [activeCategory, setActiveCategory] = useState<string>('character_base')
  const [showOnlyOwned, setShowOnlyOwned] = useState<boolean>(false) // 보관함(내 옷장) 토글
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [purchasingItem, setPurchasingItem] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string>('')
  const [balance, setBalance] = useState(userProfile?.stardust_balance ?? 0)

  const CHARACTER_OFFSETS: Record<string, { scale: number; yOffsetRatio: number }> = {
    spineboy: { scale: 1.2, yOffsetRatio: 1.4 },
    raptor: { scale: 0.5, yOffsetRatio: 1.3 },
    alien: { scale: 0.8, yOffsetRatio: 1.4 },
    stella: { scale: 0.9, yOffsetRatio: 1.4 },
    default: { scale: 1.0, yOffsetRatio: 1.4 },
  }

  // ─── Spine 프리뷰 캔버스 ───
  const previewRef = useRef<HTMLDivElement>(null)
  const pixiAppRef = useRef<PIXI.Application | null>(null)
  const spinePreviewRef = useRef<PixelSkinSpine | null>(null)

  /**
   * 단일 Effect: 앱 생성(첫 번째만) + Spine 교체
   * 
   * - app.destroy()는 언마운트 시에만 호출 → Batcher crash 원천 제거
   * - 캐릭터 전환 시: ticker 정지 → 스테이지 교체 → ticker 재시작
   */
  useEffect(() => {
    if (!previewRef.current) return
    let cancelled = false

    const run = async () => {
      // ── 1. 앱이 없으면 한 번만 생성 ──
      if (!pixiAppRef.current) {
        const targetWidth = previewRef.current!.clientWidth || 300
        const app = new PIXI.Application()
        await app.init({
          width: targetWidth,
          height: 320,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        })
        if (cancelled) {
          try { app.ticker.stop(); app.destroy(true, { children: true }) } catch {}
          return
        }
        app.canvas.style.width = '100%'
        app.canvas.style.height = '100%'
        app.canvas.style.borderRadius = '12px'
        previewRef.current!.innerHTML = ''
        previewRef.current!.appendChild(app.canvas)
        pixiAppRef.current = app
      }

      const app = pixiAppRef.current!
      if (cancelled) return

      // ── 2. 티커 정지 → 기존 Spine 제거 (렌더 중 파괴 방지) ──
      app.ticker.stop()

      if (spinePreviewRef.current) {
        try { spinePreviewRef.current.destroy() } catch {}
        spinePreviewRef.current = null
      }
      // stage의 남은 자식도 정리
      while (app.stage.children.length > 0) {
        const child = app.stage.children[0]
        app.stage.removeChild(child)
        try { child.destroy({ children: true }) } catch {}
      }

      if (cancelled) { app.ticker.start(); return }

      // ── 3. 새 Spine 캐릭터 생성 ──
      const dpr = window.devicePixelRatio || 1
      const previewContainer = new PIXI.Container()
      const charConfig = CHARACTER_OFFSETS[previewConfig.base_character] || CHARACTER_OFFSETS.default
      previewContainer.position.set(
        app.canvas.width / (2 * dpr),
        app.canvas.height / (charConfig.yOffsetRatio * dpr)
      )
      previewContainer.scale.set(charConfig.scale)
      app.stage.addChild(previewContainer)

      if (previewConfig.base_character !== 'none') {
        const spine = new PixelSkinSpine(previewContainer, 'preview', previewConfig.base_character, previewConfig.equipped_slots)
        spinePreviewRef.current = spine
      } else {
        const myUser = useUserStore.getState().user
        if (myUser?.avatar_url) {
          const loadAvatar = async () => {
            try {
              const texture = await PIXI.Assets.load({ src: myUser.avatar_url, parser: 'loadTextures' })
              const sprite = new PIXI.Sprite(texture)
              sprite.anchor.set(0.5)
              const mask = new PIXI.Graphics()
              const { getHexPoints } = await import('@/shared/lib/pixi/geometry')
              mask.poly(getHexPoints(50)).fill(0xffffff)
              previewContainer.addChild(mask)
              sprite.mask = mask
              
              const scale = 100 / Math.min(texture.width, texture.height)
              sprite.scale.set(scale)
              
              sprite.alpha = 0
              previewContainer.addChild(sprite)
              
              // @ts-ignore
              const gsapMod = await import('gsap')
              gsapMod.gsap.to(sprite, { alpha: 1, duration: 0.5, ease: 'sine.out' })
            } catch (e) {
              const text = new PIXI.Text({ text: 'Original Profile', style: { fill: 0xffffff, fontSize: 16 }})
              text.anchor.set(0.5)
              previewContainer.addChild(text)
            }
          }
          loadAvatar()
        } else {
          const fallback = new PIXI.Graphics()
          fallback.circle(0, 0, 40).fill({ color: 0xffffff, alpha: 0.1 })
          previewContainer.addChild(fallback)
        }
      }

      // ── 4. 티커 재시작 ──
      app.ticker.start()
    }

    run()

    return () => {
      cancelled = true
    }
  }, [previewConfig.base_character, JSON.stringify(previewConfig.equipped_slots), isLoading])

  // 언마운트 시에만 앱 파괴
  useEffect(() => {
    return () => {
      const app = pixiAppRef.current
      const spine = spinePreviewRef.current
      pixiAppRef.current = null
      spinePreviewRef.current = null
      if (app) {
        // ticker.destroy()는 내부 RAF를 즉시 취소 → 추가 렌더 프레임 불가
        app.ticker.destroy()
        try { if (spine) spine.destroy() } catch {}
        try { app.stage.removeChildren(); app.destroy(true, { children: true }) } catch {}
      }
    }
  }, [])

  // ─── 데이터 로드 ───
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [configRes, itemsRes] = await Promise.all([
        fetch('/api/avatar/config'),
        fetch('/api/avatar/items'),
      ])
      if (configRes.ok) {
        const { config: c } = await configRes.json()
        const isLegacySpineChar = ['spineboy', 'raptor', 'alien', 'stella'].includes(c.base_character)
        const safeConfig = {
          ...c,
          base_character: isLegacySpineChar ? 'none' : c.base_character
        }
        setConfig(safeConfig)
        setPreviewConfig(safeConfig) // 초기 입어보기 상태 동기화
      }
      if (itemsRes.ok) {
        const { items: i } = await itemsRes.json()
        
        // DB 데이터와 기본 캐릭터 병합 (중복 방지)
        const mergedItems = [...i]
        BASE_CHARACTERS.forEach(baseChar => {
          if (!mergedItems.find(item => item.item_code === baseChar.item_code)) {
            mergedItems.unshift(baseChar)
          }
        })
        setItems(mergedItems)
      }
    } catch (e) {
      console.error('[Avatar] Load Error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── 아이템 장착/해제 (Try-On) ───
  const handleEquip = (item: AvatarItem) => {
    if (!item.owned) return

    if (item.slot_category === 'character_base') {
      setPreviewConfig(prev => ({ ...prev, base_character: item.item_code }))
    } else if (item.slot_category) {
      setPreviewConfig(prev => {
        const newSlots = { ...prev.equipped_slots }
        if (newSlots[item.slot_category!] === item.item_code) {
          delete newSlots[item.slot_category!] // 이미 장착 시 해제 (Unequip)
        } else {
          newSlots[item.slot_category!] = item.item_code
        }
        return { ...prev, equipped_slots: newSlots }
      })
    }
  }

  // ─── 저장 ───
  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage('')
    try {
      const res = await fetch('/api/avatar/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewConfig), // 변경된 미리보기 상태를 저장
      })
      if (res.ok) {
        setConfig(previewConfig) // 확정된 상태를 원본에 덮어쓰기
        setSaveMessage(t('savedOk'))
        setTimeout(() => setSaveMessage(''), 2000)
        
        // [FIX] 동기화 엔진에 실시간 업데이트 전송
        const myId = useUserStore.getState().user?.id
        if (myId) {
          window.dispatchEvent(new CustomEvent('profile-updated', {
            detail: {
              pixelId: myId,
              skinCode: previewConfig.base_character,
              equippedSlots: previewConfig.equipped_slots
            }
          }))
        }
      } else {
        setSaveMessage(t('saveFailed'))
      }
    } catch (e) {
      console.error('[Avatar] Save error:', e)
      setSaveMessage(t('networkError'))
    } finally {
      setIsSaving(false)
    }
  }

  // ─── 구매 ───
  const handlePurchase = async (item: AvatarItem) => {
    if (item.price_star_dust == null) return // null/undefined만 차단, 0(무료)은 허용
    const isFree = item.price_star_dust === 0
    const msg = isFree
      ? t('acquireMsg', { name: item.name })
      : t('purchaseMsg', { name: item.name, price: item.price_star_dust!.toLocaleString() })
    const ok = await galaxyConfirm({
      title: isFree ? t('acquireTitle') : t('purchaseTitle'),
      message: msg,
      variant: 'info',
      confirmText: isFree ? t('acquireBtn') : t('purchaseBtn'),
    })
    if (!ok) return

    setPurchasingItem(item.item_code)
    try {
      const res = await fetch('/api/avatar/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_code: item.item_code }),
      })
      const data = await res.json()
      if (res.ok) {
        setBalance(data.balance)
        // 아이템 목록에서 보유 상태 갱신
        setItems(prev => prev.map(i => i.item_code === item.item_code ? { ...i, owned: true } : i))
        // [PROD] 구매 후 자동 장착 (입어보기)
        if (item.slot_category === 'character_base') {
          setPreviewConfig(prev => ({ ...prev, base_character: item.item_code }))
        } else if (item.slot_category) {
          setPreviewConfig(prev => ({
            ...prev,
            equipped_slots: { ...prev.equipped_slots, [item.slot_category!]: item.item_code },
          }))
        }
      } else {
        await galaxyAlert({ title: t('purchaseTitle'), message: data.error || t('purchaseFailed'), variant: 'error' })
      }
    } catch (e) {
      console.error('[Avatar] Purchase error:', e)
      await galaxyAlert({ title: t('networkError'), message: t('purchaseNetworkError'), variant: 'error' })
    } finally {
      setPurchasingItem(null)
    }
  }

  // ─── 현재 카테고리 아이템 필터 (보관함 토글 포함) ───
  const categoryItems = items.filter(i => {
    if (i.slot_category !== activeCategory) return false
    if (showOnlyOwned && !i.owned) return false
    return true
  })

  // ─── 장착 여부 체크 (미리보기 기준) ───
  const isEquipped = (item: AvatarItem) => {
    if (item.slot_category === 'character_base') return previewConfig.base_character === item.item_code
    return item.slot_category ? previewConfig.equipped_slots[item.slot_category] === item.item_code : false
  }
  
  // 실제 장착 여부와 입어보기 여부가 다를 경우의 플래그
  const isChanged = JSON.stringify(config) !== JSON.stringify(previewConfig)

  // ─── 공통 Footer Node ───
  const footerNode = (
    <div className="flex gap-3 w-full">
      {isChanged && (
        <button
          onClick={() => setPreviewConfig(config)}
          disabled={isSaving}
          className="flex-shrink-0 px-6 py-4 rounded-2xl bg-white text-black hover:bg-slate-100 font-bold text-sm transition-all"
        >
          {t('revert')}
        </button>
      )}
      <button
        onClick={handleSave}
        disabled={isSaving || !isChanged}
        className={`w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group ${
          isChanged 
            ? 'bg-white/20 hover:bg-white/30 text-white' 
            : 'bg-white/5 text-white/90 opacity-50 cursor-not-allowed'
        }`}
      >
        {isSaving ? (
          <LogoSpinner size={36} variant="white" />
        ) : saveMessage ? (
          <span className="text-base">{saveMessage}</span>
        ) : (
          <span className="text-base">{isChanged ? t('saveChanges') : t('equipped')}</span>
        )}
      </button>
    </div>
  )

  useEffect(() => {
    if (onFooterChange) {
      onFooterChange(hideInlineFooter ? footerNode : null)
    }
  }, [isChanged, isSaving, saveMessage, config, hideInlineFooter, onFooterChange])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LogoSpinner size={64} variant="white" />
        <span className="ml-3 text-white/90">{t('avatarLoading')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ─── 프리뷰 + 잔액 ─── */}
      <div className="rounded-2xl p-6 bg-white/[0.03] border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">
            {t('myAvatar')}
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-amber-300 font-bold">{balance.toLocaleString()}</span>
            <span className="text-white/90">{t('stardust')}</span>
          </div>
        </div>

        {/* 프리뷰 영역 — Spine 캔버스 (높이 확장) */}
        <div
          ref={previewRef}
          className="bg-white/[0.02] rounded-xl h-80 flex flex-col items-center justify-center border border-white/5 overflow-hidden"
        />
        <div className="flex items-center justify-center gap-2 mt-2">
          <p className="text-sm text-white/90">
            {t('base')} <span className="text-white font-medium">{previewConfig.base_character}</span>
          </p>
          {Object.keys(previewConfig.equipped_slots).length > 0 && (
            <span className="text-xs text-white/90">
              | {t('parts', { count: Object.keys(previewConfig.equipped_slots).length })}
            </span>
          )}
        </div>
      </div>

      {/* ─── 상점 / 내 옷장 토글 ─── */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <h4 className="text-[16px] font-bold text-white">{t('itemShop')}</h4>
        <div className="flex items-center gap-2 bg-white/[0.03] p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setShowOnlyOwned(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !showOnlyOwned ? 'bg-white/15 text-white' : 'text-white/90 hover:text-white'
            }`}
          >
            {t('viewAll')}
          </button>
          <button
            onClick={() => setShowOnlyOwned(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              showOnlyOwned ? 'bg-white/15 text-white' : 'text-white/90 hover:text-white'
            }`}
          >
            {t('myCloset')}
          </button>
        </div>
      </div>

      {/* ─── 카테고리 탭 ─── */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
        {SLOT_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat.id
          const count = items.filter(i => i.slot_category === cat.id).length
          const CatIcon = cat.Icon
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/5 text-white/90 border border-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              <CatIcon className="w-4 h-4" />
              {t(cat.labelKey as any)}
              {count > 0 && <span className="text-xs opacity-60">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* ─── 아이템 그리드 ─── */}
      {categoryItems.length === 0 ? (
        <div className="text-center py-16 text-white/90">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t('noCategoryItems')}</p>
          <p className="text-sm mt-1">{t('comingSoon')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categoryItems.map(item => {
            const equipped = isEquipped(item)
            const isPurchasing = purchasingItem === item.item_code
            return (
              <div
                key={item.id}
                className={`group relative rounded-2xl border p-4 transition-all cursor-pointer ${
                  equipped
                    ? 'bg-white/10 border-white/25 ring-1 ring-white/10'
                    : item.owned
                    ? 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/5'
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
                onClick={() => item.owned ? handleEquip(item) : undefined}
              >
                {/* 등급 뱃지 */}
                <div className={`absolute top-2 right-2 text-[12px] font-bold px-2 py-0.5 rounded-full border ${RARITY_COLORS[item.rarity] || RARITY_COLORS.common}`}>
                  {t(RARITY_LABEL_KEYS[item.rarity] as any) || item.rarity}
                </div>

                {/* 장착 체크 */}
                {equipped && (
                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                {/* 아이템 미리보기 */}
                <div className="w-full aspect-square rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-3 overflow-hidden">
                  {item.preview_image_url ? (
                    <img src={item.preview_image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (() => {
                    const catDef = SLOT_CATEGORIES.find(c => c.id === item.slot_category)
                    const FallbackIcon = catDef?.Icon || ShoppingBag
                    return <FallbackIcon className="w-10 h-10 text-white/85 opacity-60" />
                  })()}
                </div>

                {/* 아이템 정보 */}
                <p className="text-sm font-bold text-white truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-white/90 truncate mt-0.5">{item.description}</p>
                )}

                {/* 가격 / 보유 상태 */}
                <div className="mt-2">
                  {item.owned ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEquip(item) }}
                      className="w-full text-xs font-bold py-1.5 rounded-lg bg-white text-black hover:bg-slate-100 transition-all"
                    >
                      {equipped ? t('unequip') : t('equip')}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePurchase(item) }}
                      disabled={isPurchasing}
                      className="w-full text-xs font-bold py-1.5 rounded-lg bg-[rgba(var(--theme-rgb),0.15)] text-[rgb(var(--theme-rgb-light))] hover:bg-[rgba(var(--theme-rgb),0.25)] transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isPurchasing ? (
                        <LogoSpinner size={24} variant="white" />
                      ) : (
                        <>
                          <Crown className="w-3 h-3" />
                          {item.price_star_dust?.toLocaleString() || t('free')}
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 한정 아이템 표시 */}
                {item.is_limited && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── 인라인 저장 버튼 (데스크탑 등) ─── */}
      {!hideInlineFooter && (
        <div className="mt-4 pt-4 border-t border-white/10 flex gap-3">
          {footerNode}
        </div>
      )}
    </div>
  )
}
