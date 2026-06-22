'use client'

import { motion, AnimatePresence, Variants } from 'framer-motion'
import { useGalaxyStore } from '@/stores/galaxyStore'
import { useEffect, useState } from 'react'
import { useGalaxySystem } from '@/shared/hooks/useGalaxySystem'

interface GalaxyInfo {
  name: string
  color: string
  desc?: string
}

export function GalaxyNameBadge() {
  const galaxyKey = useGalaxyStore((s) => s.galaxyKey)
  const activeCategory = useGalaxyStore((s) => s.activeCategory)
  const lodLevel = useGalaxyStore((s) => s.lodLevel) // [UX FIX] 줌인 상태에 따른 UI 가시성 조절을 위해 lodLevel 구독
  const { getGalaxyByKey } = useGalaxySystem()
  
  const [currentGalaxy, setCurrentGalaxy] = useState<GalaxyInfo | null>(null)

  useEffect(() => {
    const galaxy = getGalaxyByKey(galaxyKey)
    if (!galaxy) {
      setCurrentGalaxy(null)
      return
    }

    let name = galaxy.name
    let desc = galaxy.description
    let color = galaxy.color || '#A855F7'

    if (activeCategory) {
      const category = galaxy.categories?.find(c => c.key === activeCategory)
      if (category) {
        name = category.name
        desc = category.description || desc
        color = category.color || color
      }
    }

    setCurrentGalaxy({ name, desc: desc || undefined, color })
  }, [galaxyKey, activeCategory, getGalaxyByKey])

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1, 
      transition: { staggerChildren: 0.15, delayChildren: 0.1 } 
    },
    exit: { 
      opacity: 0, 
      transition: { staggerChildren: 0.05, staggerDirection: -1, when: 'afterChildren' } 
    }
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] } // graceful easeOut
    },
    exit: { 
      opacity: 0, 
      y: -10, 
      transition: { duration: 0.2, ease: 'easeIn' } 
    }
  }

  // [UX FIX] 확대(줌인) 시 스팸처럼 화면을 가리지 않도록, 거시적 관점(LOD 3, 4)에서만 뱃지를 표시합니다.
  const isVisible = currentGalaxy && lodLevel >= 3

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key={currentGalaxy.name}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="absolute top-48 left-1/2 -translate-x-1/2 z-[35] pointer-events-none select-none"
        >
          <div className="flex flex-col items-center gap-3 pointer-events-none select-none">
            {/* 상단 장식 구역: 별빛과 수평선 */}
            <motion.div variants={itemVariants} className="flex items-center gap-4 opacity-80">
              <div className="w-12 h-[1px] bg-gradient-to-l from-white/30 to-transparent" />
              <div 
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ 
                  backgroundColor: currentGalaxy.color, 
                  boxShadow: `0 0 15px 2px ${currentGalaxy.color}` 
                }}
              />
              <div className="w-12 h-[1px] bg-gradient-to-r from-white/30 to-transparent" />
            </motion.div>

            {/* 메인 텍스트: 그라데이션 텍스트 & 은은한 오라 */}
            <motion.span
              variants={itemVariants}
              className="font-light tracking-[0.4em] text-center uppercase"
              style={{
                fontSize: 'clamp(1.1rem, 2vw, 1.8rem)',
                background: `linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.4) 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: `drop-shadow(0 0 20px ${currentGalaxy.color}40)`,
                WebkitFontSmoothing: 'antialiased',
              }}
            >
              {currentGalaxy.desc || currentGalaxy.name}
            </motion.span>
            
            {/* 2등 스타일: 거대한 우주 지평선 광원 (Eclipse Flare 라인) */}
            <motion.div 
              variants={itemVariants}
              className="w-[80vw] max-w-[450px] h-1 my-4 opacity-80 mix-blend-screen"
              style={{
                background: `radial-gradient(ellipse at center, ${currentGalaxy.color} 0%, transparent 80%)`,
                boxShadow: `0 0 50px 5px ${currentGalaxy.color}60`,
                transform: 'scaleY(0.3)'
              }}
            />
            
            {/* 하단 보조 텍스트: 좌표/섹터 느낌 */}
            <motion.div variants={itemVariants} className="flex items-center">
              <span className="text-[9px] font-bold tracking-[0.4em] uppercase" style={{ color: currentGalaxy.color }}>
                SECTOR {currentGalaxy.name}
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
