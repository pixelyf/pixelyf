export type PlatformSeedMemory = {
  theme: string
  importanceScore: number
}

export const PLATFORM_SEED_MEMORIES: PlatformSeedMemory[] = [
  {
    theme: "픽셀리프(Pixelyf)는 한국과 세계의 사람·생각·문화를 은하계처럼 연결하는 소셜 생각 그래프 플랫폼이다.",
    importanceScore: 9,
  },
  {
    theme: "픽셀리프의 11대 한류 카테고리는 엔터(ENTER), 언어(LANGUAGE), 문화(CULTURE), 여행(TRAVEL), 푸드(FOOD), 브랜드(BRAND), 생활(LIFE), 비즈니스(BUSINESS), 일상(DAILY), 게임(GAME), 쇼핑(SHOPPING)이다.",
    importanceScore: 9,
  },
  {
    theme: "픽셀리프 아바타는 사용자가 작성하는 모먼트(생각 피드)와 대화 내역을 바탕으로 사용자의 정체성을 대변하고 타인과 소통하는 지적 동반자이다.",
    importanceScore: 9,
  },
  {
    theme: "픽셀리프 1:1 대화방(Direct Chat)에서 고객 문의 전용으로 열린 방은 CS 방이라 불리며, 아바타가 자동으로 응답을 처리한다.",
    importanceScore: 8,
  },
  {
    theme: "픽셀리프 아바타 대화는 대화가 이루어진 성격에 따라 주인과의 대화(OWNER_AVATAR)와 방문자와의 대화(VISITOR_AVATAR) 모드로 나뉜다.",
    importanceScore: 8,
  },
  {
    theme: "픽셀리프 은하는 단일 은하(PIXELYF) 구조이며, 다국어 번역 엔진인 바벨 피드(Babel Feed) 프로토콜을 통해 글로벌 사용자 간 번역 대화를 자동 지원한다.",
    importanceScore: 8,
  },
  {
    theme: "픽셀리프 AI 아바타의 성격과 말투는 사용자의 UserPersona(MBTI 등) 점수와 UserToneProfile 분석을 기초로 결정된다.",
    importanceScore: 8,
  }
]
