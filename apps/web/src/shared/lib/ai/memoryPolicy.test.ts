import assert from 'node:assert/strict'
import test from 'node:test'

import { isMemoryAllowedForDirectChat } from './memoryPolicy.ts'

const baseMemory = {
  source: 'HEARTBEAT',
  partnerUserId: null,
}

test('방문자는 주인의 공개 피드 기억만 조회할 수 있다', () => {
  assert.equal(isMemoryAllowedForDirectChat({
    ...baseMemory,
    memoryStream: 'OWNER',
    memoryNamespace: 'OWNER_FEED',
    memoryVisibility: 'PUBLIC',
  }, 'VISITOR_AVATAR', 'visitor-1'), true)

  assert.equal(isMemoryAllowedForDirectChat({
    ...baseMemory,
    memoryStream: 'OWNER',
    memoryNamespace: 'OWNER_DIRECT_CHAT',
    memoryVisibility: 'PRIVATE',
  }, 'VISITOR_AVATAR', 'visitor-1'), false)
})

test('방문자는 내부 자기 활동 기억을 조회할 수 없다', () => {
  assert.equal(isMemoryAllowedForDirectChat({
    ...baseMemory,
    memoryStream: 'SELF',
    memoryNamespace: 'SELF_ACTIVITY',
    memoryVisibility: 'INTERNAL',
  }, 'VISITOR_AVATAR', 'visitor-1'), false)
})

test('방문자는 자신의 대화 기억만 조회할 수 있다', () => {
  const ownMemory = {
    ...baseMemory,
    memoryStream: 'VISITOR',
    memoryNamespace: 'VISITOR_DIRECT_CHAT',
    memoryVisibility: 'PRIVATE',
    partnerUserId: 'visitor-1',
  }

  assert.equal(isMemoryAllowedForDirectChat(ownMemory, 'VISITOR_AVATAR', 'visitor-1'), true)
  assert.equal(isMemoryAllowedForDirectChat(ownMemory, 'VISITOR_AVATAR', 'visitor-2'), false)
})

test('주인은 주인 기억과 아바타 내부 기억을 조회할 수 있다', () => {
  assert.equal(isMemoryAllowedForDirectChat({
    ...baseMemory,
    memoryStream: 'OWNER',
  }, 'OWNER_AVATAR', 'owner-1'), true)
  assert.equal(isMemoryAllowedForDirectChat({
    ...baseMemory,
    memoryStream: 'SELF',
  }, 'OWNER_AVATAR', 'owner-1'), true)
})
