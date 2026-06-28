import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDmDisplayFields,
  normalizeDmLocale,
  truncateDmPreview,
} from './messageDisplay.ts'

test('DM 표시 본문은 뷰어 언어의 완료 번역을 우선한다', () => {
  const display = getDmDisplayFields(
    '안녕하세요',
    [
      { locale: 'en', content: 'Hello', status: 'completed' },
      { locale: 'ja', content: '', status: 'failed' },
    ],
    'en-US',
  )

  assert.equal(display.displayContent, 'Hello')
  assert.equal(display.displayLanguage, 'en')
  assert.equal(display.translationStatus, 'completed')
})

test('DM 표시 본문은 실패 번역이면 원문으로 fallback한다', () => {
  const display = getDmDisplayFields(
    '안녕하세요',
    [{ locale: 'ja', content: '', status: 'failed' }],
    'ja-JP',
  )

  assert.equal(display.displayContent, '안녕하세요')
  assert.equal(display.displayLanguage, 'ja')
  assert.equal(display.translationStatus, 'failed')
})

test('DM 언어 코드는 지원 범위로 정규화한다', () => {
  assert.equal(normalizeDmLocale('EN_us'), 'en')
  assert.equal(normalizeDmLocale('zh-Hant'), 'zh')
  assert.equal(normalizeDmLocale('unknown'), 'ko')
})

test('DM 미리보기 절단은 surrogate pair를 깨지 않는다', () => {
  const preview = truncateDmPreview('😀😀😀', 2)
  assert.equal(preview, '😀😀')
})
