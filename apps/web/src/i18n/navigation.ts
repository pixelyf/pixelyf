import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * next-intl 라우팅 래퍼
 * 
 * Phase 2에서 기존 `next/link`, `next/navigation`의 import를
 * 이 파일의 래퍼로 교체하면 자동으로 locale prefix가 적용됩니다.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
