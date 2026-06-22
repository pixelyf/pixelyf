import assert from 'node:assert/strict'
import test from 'node:test'

import { isAiDirectChatRoom } from './roomSemantics.ts'

test('CS 방과 자기 아바타 방만 AI 직접 대화로 판정한다', () => {
  assert.equal(isAiDirectChatRoom('CS', false), true)
  assert.equal(isAiDirectChatRoom('DM', true), true)
  assert.equal(isAiDirectChatRoom('DM', false), false)
  assert.equal(isAiDirectChatRoom('GROUP', true), false)
})
