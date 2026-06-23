"use client"

import { useRef, useState, useEffect } from 'react'
import { motion, useScroll, useTransform, useSpring, AnimatePresence, useInView, useMotionTemplate, useMotionValue } from 'framer-motion'
import { Logo } from '@/shared/ui/Logo'
import { LogoText } from '@/shared/ui/LogoText'
import { ChevronDown } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

function TypographicNaming() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, margin: "-20%" })
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (isInView) {
      setStep(1)
      const t1 = setTimeout(() => setStep(2), 1500)
      const t2 = setTimeout(() => setStep(3), 2700)
      const t3 = setTimeout(() => setStep(4), 3900)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
    } else {
      setStep(0)
    }
  }, [isInView])

  return (
    <div ref={ref} className="flex items-center text-4xl md:text-6xl font-black tracking-tighter py-8">
      {/* P I X E */}
      <motion.div
        initial={{ x: -30, opacity: 0 }}
        animate={{ x: step > 0 ? 0 : -30, opacity: step > 0 ? 1 : 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`flex ${step >= 4 ? 'text-[#ed1672] drop-shadow-[0_0_15px_rgba(237,22,114,0.5)]' : 'text-white/40'} transition-all duration-1000`}
      >
        <span>P</span><span>I</span><span>X</span><span>E</span>
      </motion.div>

      {/* L (The anchor) */}
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: step > 0 ? 0 : 30, opacity: step > 0 ? 1 : 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className={`${step >= 4 ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'text-white/40'} transition-all duration-1000`}
      >
        L
      </motion.div>

      {/* The + sign */}
      <AnimatePresence>
        {step > 0 && step < 2 && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -180, width: 0, margin: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0, width: 'auto', margin: '0 16px' }}
            exit={{ scale: 0, opacity: 0, rotate: 180, width: 0, margin: 0 }}
            transition={{ duration: 0.6 }}
            className="text-hot-magenta font-light origin-center whitespace-nowrap"
          >
            +
          </motion.div>
        )}
      </AnimatePresence>

      {/* Second L */}
      <AnimatePresence>
        {step > 0 && step < 2 && (
          <motion.div
            initial={{ x: 30, opacity: 0, width: 0 }}
            animate={{ x: 0, opacity: 1, width: 'auto' }}
            exit={{ width: 0, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.6 }}
            className="text-white/40 origin-left"
          >
            L
          </motion.div>
        )}
      </AnimatePresence>

      {/* I -> Y */}
      <motion.div
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: step >= 3 ? -6 : (step > 0 ? 0 : 30), opacity: step > 0 ? 1 : 0 }}
        transition={{ duration: 1, ease: "easeInOut", delay: 0.1 }}
        className="relative flex items-center justify-center"
      >
        {/* I (Fades out) */}
        <motion.span
          initial={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
          animate={{ opacity: step < 3 ? 1 : 0, filter: step < 3 ? 'blur(0px)' : 'blur(8px)', scale: step < 3 ? 1 : 0.8 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          className="absolute text-white/40"
        >
          I
        </motion.span>

        {/* Y (Fades in) */}
        <motion.span
          initial={{ opacity: 0, filter: 'blur(8px)', scale: 1.2 }}
          animate={{ opacity: step >= 3 ? 1 : 0, filter: step >= 3 ? 'blur(0px)' : 'blur(8px)', scale: step >= 3 ? 1 : 1.2 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          className={`${step >= 4 ? 'text-[#ed1672] drop-shadow-[0_0_15px_rgba(237,22,114,0.5)]' : 'text-white/40'} transition-colors duration-1000`}
        >
          Y
        </motion.span>
      </motion.div>

      {/* F */}
      <motion.div
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: step >= 3 ? -6 : (step > 0 ? 0 : 30), opacity: step > 0 ? 1 : 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className={`${step >= 4 ? 'text-[#ed1672] drop-shadow-[0_0_15px_rgba(237,22,114,0.5)]' : 'text-white/40'} transition-all duration-1000`}
      >
        F
      </motion.div>

      {/* Final E */}
      <AnimatePresence>
        {step > 0 && step < 3 && (
          <motion.div
            initial={{ x: 30, opacity: 0, width: 0 }}
            animate={{ x: 0, opacity: 1, width: 'auto' }}
            exit={{ width: 0, opacity: 0, scale: 0.5, filter: 'blur(5px)' }}
            transition={{ duration: 0.6 }}
            className="text-white/40 origin-left"
          >
            E
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BrandShowroom() {
  const t = useTranslations('Brand')
  const containerRef = useRef<HTMLDivElement>(null)

  // Track global scroll for the background lines
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  })

  // 2. Parallax Tilt & Magnetic Interactivity
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e
    const { innerWidth, innerHeight } = window
    mouseX.set((clientX / innerWidth) * 2 - 1) // -1 ~ 1
    mouseY.set((clientY / innerHeight) * 2 - 1)
  }

  const frameRotateX = useTransform(mouseY, [-1, 1], [15, -15])
  const frameRotateY = useTransform(mouseX, [-1, 1], [-15, 15])

  // Smooth progress for the side lines and convergence
  // 덜컥거림(Settling jerk) 현상 방지를 위해 텐션 조정 (스냅 거리를 서브 픽셀 단위로 축소)
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.00001, restSpeed: 0.00001 })

  // === 거시적 수렴 애니메이션 매핑 (Macroscopic Convergence) ===
  // The Soul 섹션 추가(6섹션)로 스크롤 비율 재조정 (2026-05-06)
  // 1. 거대 정사각 라운드 -> The Frame (scroll 0.37 부근에서 수렴)
  const squareY = useTransform(smoothProgress, [0, 0.37], ["-200vh", "0vh"])
  const squareProgress = useTransform(smoothProgress, [0, 0.37], [1, 0])
  const squareXDesktop = useMotionTemplate`calc(min(25vw, 288px) * ${squareProgress})`
  const squareScale = useTransform(smoothProgress, [0, 0.37], [5, 1])
  const squareRotate = useTransform(smoothProgress, [0, 0.37], [-336.5, 23.5]) // 1회전(-360도 + 23.5도) 하면서 합체
  const squareOpacity = useTransform(smoothProgress, [0, 0.32, 0.37], [0.1, 0.8, 0])

  // 2. 거대 원 -> The Pixel (scroll 0.52 부근에서 수렴)
  const circleY = useTransform(smoothProgress, [0, 0.52], ["-300vh", "0vh"])
  const circleProgress = useTransform(smoothProgress, [0, 0.52], [1, 0])
  const circleXDesktop = useMotionTemplate`calc(max(-25vw, -288px) * ${circleProgress})`
  const circleScale = useTransform(smoothProgress, [0, 0.52], [2.8125, 1]) // 로고 비율(18.75%) 정확히 일치
  const circleOpacity = useTransform(smoothProgress, [0, 0.42, 0.52], [0.1, 0.8, 0]) // 처음에 90% 투명하게 시작

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} className="min-h-screen bg-[#121318] text-white relative overflow-x-hidden selection:bg-hot-magenta/30">

      {/* --- 좌우 여백을 활용한 애니메이션 (Side Lifelines) --- */}
      <div className="fixed inset-0 pointer-events-none z-0 flex justify-between px-2 md:px-8 opacity-60">
        <motion.div
          className="w-[2px] h-full bg-gradient-to-b from-transparent via-[#ed1672] to-[#ed1672] origin-top"
          style={{ scaleY: smoothProgress }}
        />
        <motion.div
          className="w-[2px] h-full bg-gradient-to-b from-transparent via-[#ed1672] to-[#ed1672] origin-top"
          style={{ scaleY: smoothProgress }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full p-6 z-50 flex justify-between items-center mix-blend-difference">
        <Link href="/" className="text-sm font-bold tracking-widest text-white/70 hover:text-white transition-colors">
          BACK TO GALAXY
        </Link>
        <div className="text-xs font-mono text-white/50">PIXELYF BRAND GUIDELINES</div>
      </nav>

      {/* SCENE 1: HERO */}
      <section className="relative h-screen flex flex-col items-center justify-center z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <Logo size="xl" className="mb-12" />
          <div className="select-none flex flex-col items-center">
            <LogoText size="lg" className="mb-4 justify-center items-center" />
          </div>
          <p className="text-lg md:text-2xl text-white/60 font-light tracking-widest text-center">
            {t('heroTagline')}
          </p>
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute bottom-12 text-white/30 flex flex-col items-center"
        >
          <span className="text-xs mb-2 tracking-widest uppercase">Scroll to explore</span>
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </section>

      {/* SCENE 1.5: NAMING STORY */}
      <section className="relative min-h-screen flex items-center justify-center py-32 px-6 z-10 bg-transparent">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-20%" }}
            transition={{ duration: 1 }}
            className="order-2 md:order-1"
          >
            <h2 className="text-6xl font-bold mb-6 text-white/90">The Name</h2>
            <h3 className="text-2xl text-hot-magenta mb-4 tracking-tight">{t('namingTitle')}</h3>
            <p className="text-white/60 leading-relaxed mb-6 text-lg">
              {t('namingDesc1')}
            </p>
            <p className="text-white/60 leading-relaxed text-lg">
              {t('namingDesc2')}
            </p>
          </motion.div>

          <motion.div
            className="order-1 md:order-2 relative flex justify-center items-center h-80 overflow-visible"
          >
            <TypographicNaming />
          </motion.div>
        </div>
      </section>

      {/* SCENE 2: THE FRAME (23.5 Degrees) */}
      <section className="relative min-h-screen flex items-center justify-center py-32 px-6 z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative">
            {/* SVG Blueprint Animation */}
            <div className="relative w-80 h-80 mx-auto" style={{ perspective: "1000px" }}>

              {/* === 거대 사각형 수렴 애니메이션 === */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Desktop (md 이상): 화면 정중앙(오른쪽으로 오프셋)에서 시작하여 타겟(왼쪽)으로 수렴 */}
                <motion.div
                  className="hidden md:block w-[60%] h-[60%] rounded-[15%] border-[3px] border-white/80 bg-transparent origin-center"
                  style={{
                    x: squareXDesktop,
                    y: squareY,
                    scale: squareScale,
                    rotate: squareRotate,
                    opacity: squareOpacity
                  }}
                />
                {/* Mobile (md 미만): 그리드가 1열이므로 이미 정중앙, X축 이동 불필요 */}
                <motion.div
                  className="block md:hidden w-[60%] h-[60%] rounded-[15%] border-[3px] border-white/80 bg-transparent origin-center"
                  style={{
                    x: "0px",
                    y: squareY,
                    scale: squareScale,
                    rotate: squareRotate,
                    opacity: squareOpacity
                  }}
                />
              </div>

              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1 }}
                className="w-full h-full relative"
                style={{ rotateX: frameRotateX, rotateY: frameRotateY, transformStyle: "preserve-3d" }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] overflow-visible">
                  <motion.rect
                    x="20" y="20" width="60" height="60" rx="9"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="origin-center"
                    initial={{ pathLength: 0, rotate: 0 }}
                    whileInView={{ pathLength: 1, rotate: 23.5 }}
                    viewport={{ once: false, margin: "-20%" }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                  />
                  {/* Axis lines */}
                  <motion.line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />
                  <motion.line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2 2" />
                </svg>
                {/* 23.5 degree label */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: false }}
                  transition={{ delay: 1.5, duration: 1 }}
                  className="absolute top-10 right-10 text-hot-magenta/80 font-mono text-sm"
                >
                  23.5°
                </motion.div>
              </motion.div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-20%" }}
            transition={{ duration: 1 }}
            className="order-1 md:order-2"
          >
            <h2 className="text-6xl font-bold mb-6 text-white/90">The Frame</h2>
            <h3 className="text-2xl text-hot-magenta mb-4 tracking-tight">{t('frameTitle')}</h3>
            <p className="text-white/60 leading-relaxed mb-6 text-lg">
              {t('frameDesc1')}
            </p>
            <p className="text-white/60 leading-relaxed text-lg">
              {t('frameDesc2')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* SCENE 3: THE PIXEL */}
      <section className="relative min-h-screen flex items-center justify-center py-32 px-6 bg-transparent z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-20%" }}
            transition={{ duration: 1 }}
          >
            <h2 className="text-6xl font-bold mb-6 text-white/90">The Pixel</h2>
            <h3 className="text-2xl text-hot-magenta mb-4 tracking-tight">{t('pixelTitle')}</h3>
            <p className="text-white/60 leading-relaxed mb-6 text-lg">
              {t('pixelDesc1')}
            </p>
            <p className="text-white/60 leading-relaxed text-lg">
              {t('pixelDesc2')}
            </p>
          </motion.div>

          <div className="relative flex justify-center items-center h-80">
            {/* Pulsing Dot Representation */}
            <div className="relative flex items-center justify-center w-full h-full">

              {/* === 거대 원 수렴 애니메이션 === */}
              {/* Desktop (md 이상): 화면 정중앙(왼쪽으로 오프셋)에서 시작하여 타겟(오른쪽)으로 수렴 */}
              <motion.div
                className="hidden md:block absolute w-16 h-16 rounded-full bg-white shadow-[0_0_50px_rgba(255,255,255,0.8)] pointer-events-none origin-center"
                style={{
                  x: circleXDesktop,
                  y: circleY,
                  scale: circleScale,
                  opacity: circleOpacity
                }}
              />
              {/* Mobile (md 미만): 1열 그리드이므로 정중앙 시작 */}
              <motion.div
                className="block md:hidden absolute w-16 h-16 rounded-full bg-white shadow-[0_0_50px_rgba(255,255,255,0.8)] pointer-events-none origin-center"
                style={{
                  x: "0px",
                  y: circleY,
                  scale: circleScale,
                  opacity: circleOpacity
                }}
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1, type: "spring" }}
                className="relative flex items-center justify-center w-full h-full"
              >
                <div className="w-16 h-16 rounded-full bg-white shadow-[0_0_50px_rgba(255,255,255,0.8)] z-10 relative" />
                <motion.div
                  animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute w-16 h-16 rounded-full border border-white/50"
                />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 0.2 }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ duration: 1 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-full h-[1px] bg-white absolute" />
              <div className="h-full w-[1px] bg-white absolute" />
              <div className="w-64 h-64 rounded-full border border-white/30 border-dashed absolute" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* SCENE 3.5: THE SOUL (AI GALAXY) */}
      <section className="relative min-h-screen flex items-center justify-center py-32 px-6 z-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1 relative flex justify-center items-center h-80">
            {/* AI Soul Splitting and Connecting Animation */}
            <div className="relative flex items-center justify-center w-full h-full">
              
              {/* Central User Pixel */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1 }}
                className="absolute w-8 h-8 rounded-full bg-white shadow-[0_0_30px_rgba(255,255,255,0.8)] z-20"
              />

              {/* The AI Souls (Splitting off from center) */}
              <motion.div
                initial={{ x: 0, y: 0, scale: 0.5, opacity: 0 }}
                whileInView={{ x: -80, y: -100, scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1.5, delay: 0.5, type: "spring", stiffness: 50 }}
                className="absolute w-5 h-5 rounded-full bg-hot-magenta/80 shadow-[0_0_20px_rgba(237,22,114,0.6)] z-30 flex items-center justify-center"
              >
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              </motion.div>

              <motion.div
                initial={{ x: 0, y: 0, scale: 0.5, opacity: 0 }}
                whileInView={{ x: 220, y: 20, scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1.8, delay: 0.8, type: "spring", stiffness: 40 }}
                className="absolute w-6 h-6 rounded-full bg-[#ed1672] shadow-[0_0_20px_rgba(237,22,114,0.8)] z-30 flex items-center justify-center"
              >
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </motion.div>

              <motion.div
                initial={{ x: 0, y: 0, scale: 0.5, opacity: 0 }}
                whileInView={{ x: -160, y: 150, scale: 1, opacity: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 2, delay: 1.1, type: "spring", stiffness: 45 }}
                className="absolute w-4 h-4 rounded-full bg-hot-magenta/60 shadow-[0_0_20px_rgba(237,22,114,0.4)] z-30 flex items-center justify-center"
              >
                <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
              </motion.div>

              {/* Network Connections (Dashed lines from Center to AI Souls) */}
              <motion.svg
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: false, margin: "-20%" }}
                transition={{ duration: 1, delay: 0.5 }}
                className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none z-10"
                style={{ overflow: 'visible' }}
              >
                {/* Line 1 */}
                <motion.line
                  x1="0" y1="0" x2="-80" y2="-100"
                  stroke="rgba(237, 22, 114, 0.4)" strokeWidth="1.5" strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1, strokeDashoffset: -20 }}
                  viewport={{ once: false }}
                  transition={{ 
                    pathLength: { duration: 1.5, delay: 0.5 },
                    strokeDashoffset: { repeat: Infinity, duration: 1, ease: "linear", delay: 0.5 }
                  }}
                />
                
                {/* Line 2 */}
                <motion.line
                  x1="0" y1="0" x2="220" y2="20"
                  stroke="rgba(237, 22, 114, 0.4)" strokeWidth="1.5" strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1, strokeDashoffset: -20 }}
                  viewport={{ once: false }}
                  transition={{ 
                    pathLength: { duration: 1.8, delay: 0.8 },
                    strokeDashoffset: { repeat: Infinity, duration: 1, ease: "linear", delay: 0.8 }
                  }}
                />
                
                {/* Line 3 */}
                <motion.line
                  x1="0" y1="0" x2="-160" y2="150"
                  stroke="rgba(237, 22, 114, 0.4)" strokeWidth="1.5" strokeDasharray="4 4"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1, strokeDashoffset: -20 }}
                  viewport={{ once: false }}
                  transition={{ 
                    pathLength: { duration: 2, delay: 1.1 },
                    strokeDashoffset: { repeat: Infinity, duration: 1, ease: "linear", delay: 1.1 }
                  }}
                />
              </motion.svg>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-20%" }}
            transition={{ duration: 1 }}
            className="order-1 md:order-2"
          >
            <h2 className="text-6xl font-bold mb-6 text-white/90">The Soul</h2>
            <h3 className="text-2xl text-hot-magenta mb-4 tracking-tight">{t('soulTitle')}</h3>
            <p className="text-white/60 leading-relaxed mb-6 text-lg">
              {t('soulDesc1')}
            </p>
            <p className="text-white/60 leading-relaxed mb-6 text-lg">
              {t('soulDesc2')}
            </p>
            <p className="text-white/60 leading-relaxed text-lg">
              {t('soulDesc3')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* SCENE 4: THE PULSE & DOWNLOAD */}
      <section className="relative min-h-screen flex flex-col items-center justify-center py-32 px-6 z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 1 }}
          className="text-center max-w-3xl mb-20"
        >
          <h2 className="text-6xl font-bold mb-6 text-white/90">The Pulse</h2>
          <h3 className="text-2xl text-[#ed1672] mb-6 tracking-tight">{t('pulseTitle')}</h3>
          <p className="text-white/60 leading-relaxed text-lg">
            {t('pulseDesc')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ delay: 0.5, duration: 1 }}
          className="flex flex-col items-center gap-8 relative"
        >
          {/* Pulse Rings */}
          <motion.div
            animate={{ scale: [1, 3], opacity: [0.5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 rounded-full border border-[#ed1672]/30 pointer-events-none"
          />
          <motion.div
            animate={{ scale: [1, 3], opacity: [0.5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeOut", delay: 2 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 rounded-full border border-hot-magenta/20 pointer-events-none"
          />

          <div 
            className="p-8 md:p-16 glass rounded-3xl border border-white/10 flex flex-col items-center gap-8 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-hot-magenta/5 mix-blend-overlay" />
            <Logo size="xl" />
            <p className="text-white/40 text-sm font-mono tracking-widest z-10">COMING SOON</p>
            <div className="flex flex-col sm:flex-row gap-4 mt-4 z-10">
              {/* Apple App Store */}
              <button className="flex items-center gap-3 px-6 py-3 bg-white/10 hover:bg-white/15 rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 group cursor-default">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] text-white/50 leading-none">Download on the</div>
                  <div className="text-sm font-semibold text-white leading-tight">App Store</div>
                </div>
              </button>
              {/* Google Play */}
              <button className="flex items-center gap-3 px-6 py-3 bg-white/10 hover:bg-white/15 rounded-xl transition-all duration-300 border border-white/10 hover:border-white/20 group cursor-default">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 010 2.594z"/>
                  <path fill="#34A853" d="M1.017.512C.89.715.827.958.827 1.235v21.53c0 .277.063.52.19.723l11.07-11.465L1.017.512z"/>
                  <path fill="#FBBC04" d="M14.584 12.023l3.497-3.474L3.338.291A1.49 1.49 0 002.15.104L14.584 12.023z"/>
                  <path fill="#EA4335" d="M14.584 12.023L2.15 23.942a1.49 1.49 0 001.188-.187l14.743-8.239-3.497-3.493z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] text-white/50 leading-none">GET IT ON</div>
                  <div className="text-sm font-semibold text-white leading-tight">Google Play</div>
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-white/30 text-xs font-mono border-t border-white/5 z-10 relative">
        © 2026 PIXELYF. The Universe of Thoughts.
      </footer>
    </div>
  )
}
