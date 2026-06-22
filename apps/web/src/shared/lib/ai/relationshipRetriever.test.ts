import assert from 'node:assert/strict'
import test from 'node:test'

// Fast-path 정규식 필터 복제 검증
const RELATION_KEYWORDS_REGEX = /(반대|대립|모순|이전|연관|유래|생각|예시|경험|전제|원인|유발|extends|supports|contradicts|refines|instantiates|requires|triggered)/i

function simulateFastPath(queryText: string): boolean {
  const normalized = queryText.trim()
  if (!normalized) return false
  return RELATION_KEYWORDS_REGEX.test(normalized)
}

test('일상적이고 평이한 대화 발화는 Fast-path 정규식 필터에 의해 걸러진다(Bypass)', () => {
  assert.equal(simulateFastPath('안녕? 아바타 반가워!'), false)
  assert.equal(simulateFastPath('오늘 날씨가 정말 화창하고 좋네. 커피나 마셔야겠다.'), false)
  assert.equal(simulateFastPath('ㅋㅋㅋ 진짜 웃기다'), false)
})

test('관계 및 논리를 탐색하는 발화는 Fast-path 필터를 정확히 통과한다(Trigger)', () => {
  assert.equal(simulateFastPath('이전 커피에 관한 생각과 반대되는 생각이 뭐야?'), true)
  assert.equal(simulateFastPath('내 어제 생각과 모순되는 점을 짚어줘'), true)
  assert.equal(simulateFastPath('새벽 러닝 계획의 전제 조건이 뭔지 기억해?'), true)
  assert.equal(simulateFastPath('supports 관계가 있는 생각을 모아줘'), true)
})
