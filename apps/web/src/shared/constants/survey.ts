export interface SurveyQuestion {
  id: number
  dimension: 'EI' | 'SN' | 'TF' | 'JP'
  pole: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'
  question: string
}

export const MBTI_SURVEY: SurveyQuestion[] = [
  // --- E vs I (에너지의 방향) ---
  {
    id: 1,
    dimension: 'EI',
    pole: 'E',
    question: "새로운 사람들과 함께하는 파티나 모임에서 다양한 사람들과 대화하며 에너지를 얻는다."
  },
  {
    id: 2,
    dimension: 'EI',
    pole: 'I',
    question: "혼자만의 시간을 보내거나 깊은 대화를 나눌 수 있는 소수의 사람들과 있을 때 에너지가 충전된다."
  },
  {
    id: 3,
    dimension: 'EI',
    pole: 'E',
    question: "모임이나 단체 활동을 이끌거나 주도하는 역할을 즐겨 맡는 편이다."
  },
  {
    id: 4,
    dimension: 'EI',
    pole: 'I',
    question: "말하기보다는 주로 다른 사람들의 이야기를 경청하며 상황을 지켜보는 편이다."
  },
  {
    id: 5,
    dimension: 'EI',
    pole: 'E',
    question: "새로운 모임에서 처음 본 사람들에게 먼저 말을 건네고 친해지는 것이 어렵지 않다."
  },

  // --- S vs N (정보 인식의 방법) ---
  {
    id: 6,
    dimension: 'SN',
    pole: 'S',
    question: "구체적인 수치, 객관적인 사실, 실제 유용한 경험을 바탕으로 현실성 있게 이야기하는 것을 선호한다."
  },
  {
    id: 7,
    dimension: 'SN',
    pole: 'N',
    question: "미래의 가능성, 비유와 상징, 참신한 아이디어에 대해 자유롭게 토론하는 것을 선호한다."
  },
  {
    id: 8,
    dimension: 'SN',
    pole: 'S',
    question: "새로운 프로젝트를 시작할 때 지금 즉시 실행 가능한 구체적이고 체계적인 계획부터 세운다."
  },
  {
    id: 9,
    dimension: 'SN',
    pole: 'N',
    question: "이 프로젝트가 가져올 전체적인 비전과 장기적인 의미를 그리는 일에 더 큰 흥미를 느낀다."
  },
  {
    id: 10,
    dimension: 'SN',
    pole: 'S',
    question: "현실에서 실현 가능하고 즉각 활용할 수 있는 실용적인 정보를 다룰 때 가장 마음이 편하다."
  },

  // --- T vs F (판단과 결정의 근거) ---
  {
    id: 11,
    dimension: 'TF',
    pole: 'T',
    question: "중요한 결정을 내려야 할 때, 개인의 감정이나 인간관계보다는 객관적인 논리와 타당성을 최우선으로 고려한다."
  },
  {
    id: 12,
    dimension: 'TF',
    pole: 'F',
    question: "의사 결정 시 주변 사람들과의 감정적 조화 및 나와 상대방의 정서적 영향을 깊이 고민한다."
  },
  {
    id: 13,
    dimension: 'TF',
    pole: 'T',
    question: "동료나 친구가 힘든 일을 겪고 있을 때, 공감과 격려보다 상황을 객관적으로 분석해 실질적인 해결책을 제시해 주는 편이다."
  },
  {
    id: 14,
    dimension: 'TF',
    pole: 'F',
    question: "조언을 제공하기보다는 그가 겪고 있을 마음에 깊이 공감하고 정서적으로 든든한 위로를 건네주는 것을 선호한다."
  },
  {
    id: 15,
    dimension: 'TF',
    pole: 'T',
    question: "친절한 배려가 섞인 말보다 냉철하더라도 진실을 명확하게 짚어주는 솔직함이 더 가치 있다고 믿는다."
  },

  // --- J vs P (생활 양식과 조직력) ---
  {
    id: 16,
    dimension: 'JP',
    pole: 'J',
    question: "여행을 떠나기 전, 시간대별 이동 동선과 방문할 장소들을 꼼꼼하게 정리해 두어야 마음이 놓인다."
  },
  {
    id: 17,
    dimension: 'JP',
    pole: 'P',
    question: "목적지 정도만 느슨하게 정해 두고, 당일의 날씨와 기분에 맞춰 자유롭게 채워 나가는 여행을 선호한다."
  },
  {
    id: 18,
    dimension: 'JP',
    pole: 'J',
    question: "주어진 업무나 과제를 미리미리 준비하여 마감 기한보다 훨씬 일찍 마무리하는 편이다."
  },
  {
    id: 19,
    dimension: 'JP',
    pole: 'P',
    question: "마지막 마감 직전에 몰입하여 폭발적인 집중력을 발휘하는 일에 더 익숙하다."
  },
  {
    id: 20,
    dimension: 'JP',
    pole: 'J',
    question: "내 주변 환경(책상, 방 등)이 질서 정연하게 정리정돈되어 있을 때 가장 효율이 오른다."
  }
]
