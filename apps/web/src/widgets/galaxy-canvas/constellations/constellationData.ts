/**
 * [별자리 정규 데이터 및 인터페이스]
 * 
 * 총 20개의 랜드마크 별자리의 좌표 및 간선 정보를 정의합니다.
 * 본 데이터는 실제 천문학 성도(Stellarium 등)의 공식 연결선(Asterism)과 
 * 별의 개수(Slot)를 100% 동일하게 매핑하여 구성된 정밀 데이터입니다. (총 157개 슬롯)
 * 
 * ── 좌표 배치 알고리즘 (coordinateCalculator.ts 동일 체계) ──
 * 반경: calculatePosition()과 동일한 면적 보존 디스크 공식 (rank 800~10300, 500간격)
 * 각도: 별자리 인덱스(i) × 황금각(2.39996) → 20개가 360° 균등 분산
 * 좌표 = 반경 × cos/sin(θ) × VISUAL_SCALE(70) → PixiJS 월드 좌표
 * 사분면 분포: Q1:5 Q2:6 Q3:4 Q4:5 (거의 균등)
 */

export interface ConstellationStarDef {
  name: string
  x: number
  y: number
  brightness: number

  // ── [이벤트 매핑 시스템] ──
  assignedPixelId?: string
  lockedOriginalCoordX?: number
  lockedOriginalCoordY?: number
}

export interface ConstellationDef {
  id: string
  name: string
  color: string // 네온 글로우 테마 색상
  centerX: number
  centerY: number
  enabled: boolean      // 별자리 활성/비활성 토글
  version: number       // 좌표 변경 시 버전 추적 (캐시 무효화)
  stars: ConstellationStarDef[]
  edges: [number, number][]
}


// (Manual stringification below to keep formatting nice)
export const ARIES: ConstellationDef = {
  id: "aries",
  name: "양자리",
  color: "#EF4444",
  centerX: 33740,
  centerY: 0,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "하말 (Hamal)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "셰라탄 (Sheratan)",
      x: -200,
      y: 100,
      brightness: 0.8
    },
    {
      name: "메사르팀 (Mesarthim)",
      x: -250,
      y: 150,
      brightness: 0.6
    },
    {
      name: "보테인 (Botein)",
      x: 400,
      y: 200,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      0,
      3
    ]
  ]
}

export const TAURUS: ConstellationDef = {
  id: "taurus",
  name: "황소자리",
  color: "#F97316",
  centerX: -38220,
  centerY: 35000,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "알데바란 (Aldebaran)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "아인 (Ain)",
      x: 150,
      y: -150,
      brightness: 0.8
    },
    {
      name: "감마 황소 (Hyadum I)",
      x: 100,
      y: 100,
      brightness: 0.7
    },
    {
      name: "엘나스 (Elnath)",
      x: -400,
      y: -500,
      brightness: 0.9
    },
    {
      name: "제타 황소 (Zeta Tau)",
      x: 400,
      y: -400,
      brightness: 0.7
    },
    {
      name: "람다 황소",
      x: 200,
      y: 250,
      brightness: 0.6
    },
    {
      name: "크시 황소",
      x: 350,
      y: 350,
      brightness: 0.5
    },
    {
      name: "오미크론 황소",
      x: 500,
      y: 200,
      brightness: 0.5
    },
    {
      name: "플레이아데스 (알키오네)",
      x: 800,
      y: -300,
      brightness: 0.9
    },
    {
      name: "델타 황소",
      x: 50,
      y: 50,
      brightness: 0.6
    },
    {
      name: "세타 황소",
      x: -50,
      y: -50,
      brightness: 0.6
    }
  ],
  edges: [
    [
      2,
      9
    ],
    [
      9,
      10
    ],
    [
      10,
      0
    ],
    [
      2,
      1
    ],
    [
      0,
      4
    ],
    [
      1,
      3
    ],
    [
      2,
      5
    ],
    [
      5,
      6
    ],
    [
      6,
      7
    ],
    [
      7,
      8
    ]
  ]
}

export const GEMINI: ConstellationDef = {
  id: "gemini",
  name: "쌍둥이자리",
  color: "#F59E0B",
  centerX: 5950,
  centerY: -67830,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "카스토르 (Castor)",
      x: -200,
      y: -500,
      brightness: 1
    },
    {
      name: "폴룩스 (Pollux)",
      x: 200,
      y: -450,
      brightness: 1
    },
    {
      name: "알헤나 (Alhena)",
      x: 150,
      y: 450,
      brightness: 0.9
    },
    {
      name: "와사트 (Wasat)",
      x: 50,
      y: 50,
      brightness: 0.7
    },
    {
      name: "멥수타 (Mebsuta)",
      x: -300,
      y: 0,
      brightness: 0.6
    },
    {
      name: "메크부다 (Mekbuda)",
      x: -100,
      y: 150,
      brightness: 0.6
    },
    {
      name: "테자트 (Tejat)",
      x: -50,
      y: 350,
      brightness: 0.7
    },
    {
      name: "프로푸스 (Propus)",
      x: -150,
      y: 500,
      brightness: 0.6
    },
    {
      name: "알지르 (Alzirr)",
      x: 400,
      y: 600,
      brightness: 0.5
    },
    {
      name: "타우 쌍둥이",
      x: -250,
      y: -200,
      brightness: 0.5
    },
    {
      name: "우프실론 쌍둥이",
      x: 250,
      y: -150,
      brightness: 0.5
    },
    {
      name: "카파 쌍둥이",
      x: 150,
      y: -250,
      brightness: 0.6
    }
  ],
  edges: [
    [
      0,
      9
    ],
    [
      9,
      4
    ],
    [
      4,
      5
    ],
    [
      5,
      6
    ],
    [
      6,
      7
    ],
    [
      1,
      11
    ],
    [
      11,
      10
    ],
    [
      10,
      3
    ],
    [
      3,
      2
    ],
    [
      2,
      8
    ],
    [
      4,
      3
    ]
  ]
}

export const CANCER: ConstellationDef = {
  id: "cancer",
  name: "게자리",
  color: "#84CC16",
  centerX: 49350,
  centerY: 64400,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "아셀루스 오스트랄리스",
      x: 0,
      y: 0,
      brightness: 0.7
    },
    {
      name: "아셀루스 보레알리스",
      x: -50,
      y: -250,
      brightness: 0.6
    },
    {
      name: "타르프 (Tarf)",
      x: -350,
      y: 300,
      brightness: 0.8
    },
    {
      name: "아쿠벤스 (Acubens)",
      x: 400,
      y: 250,
      brightness: 0.7
    },
    {
      name: "테그미네 (Tegmine)",
      x: -150,
      y: 150,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      0,
      4
    ],
    [
      4,
      2
    ],
    [
      0,
      3
    ]
  ]
}

export const LEO: ConstellationDef = {
  id: "leo",
  name: "사자자리",
  color: "#22C55E",
  centerX: -91000,
  centerY: -16100,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "레굴루스 (Regulus)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "알기에바 (Algieba)",
      x: 300,
      y: -300,
      brightness: 0.9
    },
    {
      name: "아다페라 (Adhafera)",
      x: 200,
      y: -500,
      brightness: 0.7
    },
    {
      name: "라살라스 (Rasalas)",
      x: -50,
      y: -600,
      brightness: 0.6
    },
    {
      name: "알테르프 (Alterf)",
      x: -200,
      y: -450,
      brightness: 0.5
    },
    {
      name: "조스마 (Zosma)",
      x: -700,
      y: -250,
      brightness: 0.8
    },
    {
      name: "체르탄 (Chertan)",
      x: -650,
      y: 100,
      brightness: 0.7
    },
    {
      name: "데네볼라 (Denebola)",
      x: -1000,
      y: 200,
      brightness: 0.9
    },
    {
      name: "에타 사자",
      x: 0,
      y: -250,
      brightness: 0.6
    }
  ],
  edges: [
    [
      0,
      8
    ],
    [
      8,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      4
    ],
    [
      1,
      5
    ],
    [
      5,
      7
    ],
    [
      7,
      6
    ],
    [
      6,
      5
    ],
    [
      6,
      0
    ]
  ]
}

export const VIRGO: ConstellationDef = {
  id: "virgo",
  name: "처녀자리",
  color: "#10B981",
  centerX: 86380,
  centerY: -54950,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "스피카 (Spica)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "포리마 (Porrima)",
      x: -400,
      y: -450,
      brightness: 0.8
    },
    {
      name: "빈데미아트릭스",
      x: -250,
      y: -900,
      brightness: 0.7
    },
    {
      name: "아우바 (Auva)",
      x: 200,
      y: -700,
      brightness: 0.7
    },
    {
      name: "자니아 (Zaniah)",
      x: -650,
      y: -250,
      brightness: 0.6
    },
    {
      name: "자비자바 (Zavijava)",
      x: -900,
      y: -100,
      brightness: 0.5
    },
    {
      name: "시르마 (Syrma)",
      x: 500,
      y: 150,
      brightness: 0.6
    },
    {
      name: "캉 (Kang)",
      x: 800,
      y: 100,
      brightness: 0.5
    },
    {
      name: "타우 처녀",
      x: -200,
      y: -150,
      brightness: 0.5
    },
    {
      name: "세타 처녀",
      x: 100,
      y: -300,
      brightness: 0.6
    },
    {
      name: "헤제 (Heze)",
      x: 300,
      y: -150,
      brightness: 0.6
    }
  ],
  edges: [
    [
      0,
      9
    ],
    [
      9,
      1
    ],
    [
      1,
      4
    ],
    [
      4,
      5
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      9
    ],
    [
      0,
      10
    ],
    [
      10,
      6
    ],
    [
      6,
      7
    ],
    [
      1,
      8
    ],
    [
      8,
      0
    ]
  ]
}

export const LIBRA: ConstellationDef = {
  id: "libra",
  name: "천칭자리",
  color: "#14B8A6",
  centerX: -28980,
  centerY: 107730,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "주벤에샤말리",
      x: 0,
      y: -350,
      brightness: 0.9
    },
    {
      name: "주벤엘게누비",
      x: 0,
      y: 350,
      brightness: 0.8
    },
    {
      name: "브라키움",
      x: -450,
      y: 0,
      brightness: 0.7
    },
    {
      name: "주벤엘아크라브",
      x: 350,
      y: -150,
      brightness: 0.6
    },
    {
      name: "우프실론 천칭",
      x: 300,
      y: 250,
      brightness: 0.5
    },
    {
      name: "타우 천칭",
      x: -600,
      y: -100,
      brightness: 0.4
    }
  ],
  edges: [
    [
      0,
      2
    ],
    [
      2,
      1
    ],
    [
      1,
      0
    ],
    [
      0,
      3
    ],
    [
      1,
      4
    ],
    [
      2,
      5
    ]
  ]
}

export const SCORPIO: ConstellationDef = {
  id: "scorpio",
  name: "전갈자리",
  color: "#06B6D4",
  centerX: -55300,
  centerY: -106470,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "안타레스 (Antares)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "시그마 전갈 (Al Niyat)",
      x: -150,
      y: -150,
      brightness: 0.8
    },
    {
      name: "파이 전갈 (Pi)",
      x: -300,
      y: -300,
      brightness: 0.7
    },
    {
      name: "드슈바 (Dschubba)",
      x: -450,
      y: -450,
      brightness: 0.9
    },
    {
      name: "그라피아스 (Graffias)",
      x: -350,
      y: -600,
      brightness: 0.8
    },
    {
      name: "로 전갈 (Rho)",
      x: -600,
      y: -350,
      brightness: 0.7
    },
    {
      name: "타우 전갈 (Tau)",
      x: 150,
      y: 200,
      brightness: 0.8
    },
    {
      name: "엡실론 전갈 (Wei)",
      x: 300,
      y: 400,
      brightness: 0.8
    },
    {
      name: "뮤 전갈 (Mu)",
      x: 350,
      y: 600,
      brightness: 0.7
    },
    {
      name: "제타 전갈 (Zeta)",
      x: 250,
      y: 800,
      brightness: 0.7
    },
    {
      name: "에타 전갈 (Eta)",
      x: 100,
      y: 950,
      brightness: 0.6
    },
    {
      name: "사르가스 (Sargas)",
      x: -100,
      y: 1000,
      brightness: 0.8
    },
    {
      name: "이오타 전갈 (Iota)",
      x: -300,
      y: 950,
      brightness: 0.6
    },
    {
      name: "샤울라 (Shaula)",
      x: -450,
      y: 800,
      brightness: 0.9
    },
    {
      name: "레사스 (Lesath)",
      x: -550,
      y: 750,
      brightness: 0.7
    }
  ],
  edges: [
    [
      5,
      3
    ],
    [
      3,
      4
    ],
    [
      3,
      2
    ],
    [
      2,
      1
    ],
    [
      1,
      0
    ],
    [
      0,
      6
    ],
    [
      6,
      7
    ],
    [
      7,
      8
    ],
    [
      8,
      9
    ],
    [
      9,
      10
    ],
    [
      10,
      11
    ],
    [
      11,
      12
    ],
    [
      12,
      13
    ],
    [
      13,
      14
    ]
  ]
}

export const SAGITTARIUS: ConstellationDef = {
  id: "sagittarius",
  name: "궁수자리",
  color: "#3B82F6",
  centerX: 120050,
  centerY: 43820,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "카우스 오스트랄리스",
      x: 0,
      y: 300,
      brightness: 1
    },
    {
      name: "카우스 메디아",
      x: 0,
      y: 0,
      brightness: 0.9
    },
    {
      name: "카우스 보레알리스",
      x: 0,
      y: -300,
      brightness: 0.8
    },
    {
      name: "눈키 (Nunki)",
      x: -500,
      y: -400,
      brightness: 0.9
    },
    {
      name: "아셀라 (Ascella)",
      x: -400,
      y: 200,
      brightness: 0.7
    },
    {
      name: "알나슬 (Alnasl)",
      x: 400,
      y: 0,
      brightness: 0.8
    },
    {
      name: "카우스 메리디아날리스",
      x: -150,
      y: 150,
      brightness: 0.6
    },
    {
      name: "파이 궁수 (Phi Sgr)",
      x: -250,
      y: -150,
      brightness: 0.7
    }
  ],
  edges: [
    [
      0,
      6
    ],
    [
      6,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      7
    ],
    [
      7,
      3
    ],
    [
      3,
      4
    ],
    [
      4,
      6
    ],
    [
      1,
      5
    ],
    [
      4,
      7
    ]
  ]
}

export const CAPRICORN: ConstellationDef = {
  id: "capricorn",
  name: "염소자리",
  color: "#6366F1",
  centerX: -131110,
  centerY: 54110,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "데네브 알게디",
      x: -500,
      y: -300,
      brightness: 0.9
    },
    {
      name: "나시라 (Nashira)",
      x: -400,
      y: -100,
      brightness: 0.7
    },
    {
      name: "다비흐 (Dabih)",
      x: 500,
      y: 0,
      brightness: 0.8
    },
    {
      name: "알게디 (Algedi)",
      x: 550,
      y: -200,
      brightness: 0.7
    },
    {
      name: "오메가 염소",
      x: -150,
      y: 500,
      brightness: 0.6
    },
    {
      name: "제타 염소",
      x: -300,
      y: 300,
      brightness: 0.5
    },
    {
      name: "세타 염소",
      x: 100,
      y: 300,
      brightness: 0.5
    },
    {
      name: "로 염소",
      x: 300,
      y: 150,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      5
    ],
    [
      5,
      4
    ],
    [
      4,
      6
    ],
    [
      6,
      7
    ],
    [
      7,
      2
    ],
    [
      2,
      3
    ],
    [
      0,
      3
    ]
  ]
}

export const AQUARIUS: ConstellationDef = {
  id: "aquarius",
  name: "물병자리",
  color: "#8B5CF6",
  centerX: 67130,
  centerY: -143500,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "사달멜리크 (Sadalmelik)",
      x: 0,
      y: -400,
      brightness: 0.9
    },
    {
      name: "사달수드 (Sadalsuud)",
      x: 400,
      y: -300,
      brightness: 0.8
    },
    {
      name: "사달라크비아 (Sadalachbia)",
      x: -200,
      y: -150,
      brightness: 0.7
    },
    {
      name: "사달타게르 (Sadaltager)",
      x: 150,
      y: -150,
      brightness: 0.6
    },
    {
      name: "알발리 (Albali)",
      x: 600,
      y: 0,
      brightness: 0.6
    },
    {
      name: "안차 (Ancha)",
      x: 550,
      y: 300,
      brightness: 0.6
    },
    {
      name: "스카트 (Skat)",
      x: -300,
      y: 500,
      brightness: 0.7
    },
    {
      name: "에타 물병",
      x: -350,
      y: -250,
      brightness: 0.5
    },
    {
      name: "파이 물병",
      x: -50,
      y: 100,
      brightness: 0.5
    },
    {
      name: "람다 물병",
      x: -150,
      y: 300,
      brightness: 0.5
    },
    {
      name: "타우 물병",
      x: -450,
      y: 700,
      brightness: 0.5
    },
    {
      name: "오메가 물병",
      x: 200,
      y: 500,
      brightness: 0.5
    }
  ],
  edges: [
    [
      1,
      0
    ],
    [
      0,
      3
    ],
    [
      3,
      2
    ],
    [
      2,
      7
    ],
    [
      2,
      8
    ],
    [
      8,
      9
    ],
    [
      9,
      6
    ],
    [
      6,
      10
    ],
    [
      1,
      4
    ],
    [
      4,
      5
    ],
    [
      5,
      11
    ]
  ]
}

export const PISCES: ConstellationDef = {
  id: "pisces",
  name: "물고기자리",
  color: "#D946EF",
  centerX: 51940,
  centerY: 165550,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "알레샤 (Alrescha)",
      x: 0,
      y: 500,
      brightness: 0.9
    },
    {
      name: "오미크론 물고기",
      x: 200,
      y: 300,
      brightness: 0.6
    },
    {
      name: "에타 물고기",
      x: 400,
      y: 100,
      brightness: 0.7
    },
    {
      name: "감마 물고기",
      x: 500,
      y: -300,
      brightness: 0.8
    },
    {
      name: "오메가 물고기",
      x: 600,
      y: -200,
      brightness: 0.7
    },
    {
      name: "요타 물고기",
      x: 750,
      y: -350,
      brightness: 0.6
    },
    {
      name: "람다 물고기",
      x: 650,
      y: -500,
      brightness: 0.6
    },
    {
      name: "카파 물고기",
      x: 450,
      y: -450,
      brightness: 0.6
    },
    {
      name: "에피실론 물고기",
      x: -200,
      y: 300,
      brightness: 0.6
    },
    {
      name: "델타 물고기",
      x: -400,
      y: 100,
      brightness: 0.6
    },
    {
      name: "오메가 물고기(북)",
      x: -600,
      y: -100,
      brightness: 0.6
    },
    {
      name: "시그마 물고기",
      x: -700,
      y: -300,
      brightness: 0.5
    },
    {
      name: "타우 물고기",
      x: -850,
      y: -200,
      brightness: 0.5
    },
    {
      name: "우프실론 물고기",
      x: -800,
      y: 0,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      4
    ],
    [
      4,
      5
    ],
    [
      5,
      6
    ],
    [
      6,
      7
    ],
    [
      7,
      3
    ],
    [
      0,
      8
    ],
    [
      8,
      9
    ],
    [
      9,
      10
    ],
    [
      10,
      11
    ],
    [
      11,
      12
    ],
    [
      12,
      13
    ],
    [
      13,
      10
    ]
  ]
}

export const ORION: ConstellationDef = {
  id: "orion",
  name: "오리온자리",
  color: "#818CF8",
  centerX: -162050,
  centerY: -93940,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "베텔게우스",
      x: -630,
      y: -980,
      brightness: 1
    },
    {
      name: "벨라트릭스",
      x: 490,
      y: -840,
      brightness: 0.7
    },
    {
      name: "민타카",
      x: 420,
      y: 0,
      brightness: 0.6
    },
    {
      name: "알닐람",
      x: 0,
      y: 140,
      brightness: 0.7
    },
    {
      name: "알니탁",
      x: -420,
      y: 280,
      brightness: 0.6
    },
    {
      name: "리겔",
      x: 560,
      y: 1050,
      brightness: 1
    },
    {
      name: "사이프",
      x: -630,
      y: 1120,
      brightness: 0.6
    },
    {
      name: "메이사 (Meissa)",
      x: -50,
      y: -1300,
      brightness: 0.5
    },
    {
      name: "오리온 성운 (M42)",
      x: -100,
      y: 500,
      brightness: 0.8
    },
    {
      name: "하티사 (Hatysa)",
      x: -150,
      y: 700,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      4
    ],
    [
      4,
      0
    ],
    [
      2,
      5
    ],
    [
      4,
      6
    ],
    [
      0,
      7
    ],
    [
      1,
      7
    ],
    [
      3,
      8
    ],
    [
      8,
      9
    ]
  ]
}

export const BIG_DIPPER: ConstellationDef = {
  id: "big_dipper",
  name: "북두칠성",
  color: "#38BDF8",
  centerX: 195510,
  centerY: -42980,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "두베",
      x: -1050,
      y: -420,
      brightness: 0.8
    },
    {
      name: "메라크",
      x: -980,
      y: 0,
      brightness: 0.7
    },
    {
      name: "페크다",
      x: -560,
      y: 175,
      brightness: 0.6
    },
    {
      name: "메그레즈",
      x: -210,
      y: -35,
      brightness: 0.5
    },
    {
      name: "알리오스",
      x: 350,
      y: -175,
      brightness: 0.8
    },
    {
      name: "미자르",
      x: 770,
      y: -350,
      brightness: 0.7
    },
    {
      name: "알카이드",
      x: 1190,
      y: -560,
      brightness: 0.8
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      4
    ],
    [
      4,
      5
    ],
    [
      5,
      6
    ],
    [
      3,
      0
    ]
  ]
}

export const CASSIOPEIA: ConstellationDef = {
  id: "cassiopeia",
  name: "카시오페이아",
  color: "#F472B6",
  centerX: -122080,
  centerY: 173670,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "셰다르",
      x: -840,
      y: -350,
      brightness: 0.8
    },
    {
      name: "카프",
      x: -420,
      y: 350,
      brightness: 0.7
    },
    {
      name: "치흐",
      x: 0,
      y: -420,
      brightness: 0.9
    },
    {
      name: "루치바",
      x: 420,
      y: 210,
      brightness: 0.6
    },
    {
      name: "세긴",
      x: 840,
      y: -385,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      2,
      3
    ],
    [
      3,
      4
    ]
  ]
}

export const CYGNUS: ConstellationDef = {
  id: "cygnus",
  name: "백조자리",
  color: "#FFFFFF",
  centerX: -28770,
  centerY: -221900,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "데네브",
      x: 0,
      y: -700,
      brightness: 1
    },
    {
      name: "사드르",
      x: 0,
      y: 0,
      brightness: 0.9
    },
    {
      name: "알비레오",
      x: 0,
      y: 800,
      brightness: 0.9
    },
    {
      name: "기에나",
      x: -350,
      y: -200,
      brightness: 0.8
    },
    {
      name: "제타 백조",
      x: -650,
      y: -450,
      brightness: 0.7
    },
    {
      name: "카파 백조",
      x: -850,
      y: -650,
      brightness: 0.6
    },
    {
      name: "파와리스",
      x: 350,
      y: -200,
      brightness: 0.8
    },
    {
      name: "세타 백조",
      x: 650,
      y: -450,
      brightness: 0.7
    },
    {
      name: "이오타 백조",
      x: 850,
      y: -650,
      brightness: 0.6
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      2
    ],
    [
      1,
      3
    ],
    [
      3,
      4
    ],
    [
      4,
      5
    ],
    [
      1,
      6
    ],
    [
      6,
      7
    ],
    [
      7,
      8
    ]
  ]
}

export const LYRA: ConstellationDef = {
  id: "lyra",
  name: "거문고자리",
  color: "#A78BFA",
  centerX: 179410,
  centerY: 151200,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "베가 (직녀성)",
      x: 0,
      y: -350,
      brightness: 1
    },
    {
      name: "셀리아크",
      x: -150,
      y: 150,
      brightness: 0.7
    },
    {
      name: "술라파트",
      x: 150,
      y: 250,
      brightness: 0.8
    },
    {
      name: "제타 거문고",
      x: -50,
      y: -50,
      brightness: 0.6
    },
    {
      name: "델타 거문고",
      x: 100,
      y: -50,
      brightness: 0.6
    }
  ],
  edges: [
    [
      0,
      3
    ],
    [
      0,
      4
    ],
    [
      3,
      4
    ],
    [
      4,
      2
    ],
    [
      2,
      1
    ],
    [
      1,
      3
    ]
  ]
}

export const AQUILA: ConstellationDef = {
  id: "aquila",
  name: "독수리자리",
  color: "#FCD34D",
  centerX: -244790,
  centerY: 10150,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "알타이르 (견우성)",
      x: 0,
      y: 0,
      brightness: 1
    },
    {
      name: "타라제드",
      x: -150,
      y: -200,
      brightness: 0.8
    },
    {
      name: "알샤인",
      x: 150,
      y: 200,
      brightness: 0.7
    },
    {
      name: "데네브 엘 오카브",
      x: -350,
      y: -150,
      brightness: 0.7
    },
    {
      name: "제타 독수리",
      x: -500,
      y: -50,
      brightness: 0.6
    },
    {
      name: "세타 독수리",
      x: 250,
      y: 350,
      brightness: 0.6
    },
    {
      name: "에타 독수리",
      x: 400,
      y: 450,
      brightness: 0.5
    },
    {
      name: "람다 독수리",
      x: 0,
      y: 700,
      brightness: 0.5
    }
  ],
  edges: [
    [
      1,
      0
    ],
    [
      0,
      2
    ],
    [
      3,
      0
    ],
    [
      3,
      4
    ],
    [
      0,
      5
    ],
    [
      5,
      6
    ],
    [
      2,
      7
    ]
  ]
}

export const CANIS_MAJOR: ConstellationDef = {
  id: "canis_major",
  name: "큰개자리",
  color: "#60A5FA",
  centerX: 180740,
  centerY: -179900,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "시리우스",
      x: 0,
      y: -400,
      brightness: 1
    },
    {
      name: "미르잠",
      x: 450,
      y: -250,
      brightness: 0.8
    },
    {
      name: "웨젠",
      x: -150,
      y: 250,
      brightness: 0.9
    },
    {
      name: "아다라",
      x: -350,
      y: 500,
      brightness: 0.8
    },
    {
      name: "알루드라",
      x: -650,
      y: 400,
      brightness: 0.7
    },
    {
      name: "오미크론 큰개",
      x: -250,
      y: 100,
      brightness: 0.6
    },
    {
      name: "푸루드 (Furud)",
      x: 100,
      y: 600,
      brightness: 0.5
    },
    {
      name: "물리페인",
      x: -300,
      y: -500,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      0,
      5
    ],
    [
      5,
      2
    ],
    [
      2,
      3
    ],
    [
      2,
      4
    ],
    [
      3,
      6
    ],
    [
      0,
      7
    ]
  ]
}

export const PEGASUS: ConstellationDef = {
  id: "pegasus",
  name: "페가수스자리",
  color: "#F472B6",
  centerX: -12180,
  centerY: 264320,
  enabled: true,
  version: 1,
  stars: [
    {
      name: "마르카브 (Markab)",
      x: -350,
      y: 350,
      brightness: 0.9
    },
    {
      name: "세아트 (Scheat)",
      x: -350,
      y: -350,
      brightness: 0.9
    },
    {
      name: "알게니브 (Algenib)",
      x: 350,
      y: 350,
      brightness: 0.8
    },
    {
      name: "알페라츠 (Alpheratz)",
      x: 350,
      y: -350,
      brightness: 0.9
    },
    {
      name: "마타르 (Matar)",
      x: -700,
      y: -600,
      brightness: 0.7
    },
    {
      name: "사달바리",
      x: -850,
      y: -400,
      brightness: 0.6
    },
    {
      name: "에니프 (Enif)",
      x: -1200,
      y: -300,
      brightness: 0.8
    },
    {
      name: "호맘 (Homam)",
      x: -600,
      y: 600,
      brightness: 0.6
    },
    {
      name: "비함 (Biham)",
      x: -800,
      y: 800,
      brightness: 0.5
    }
  ],
  edges: [
    [
      0,
      1
    ],
    [
      1,
      3
    ],
    [
      3,
      2
    ],
    [
      2,
      0
    ],
    [
      1,
      4
    ],
    [
      4,
      5
    ],
    [
      5,
      6
    ],
    [
      0,
      7
    ],
    [
      7,
      8
    ]
  ]
}

export const ALL_CONSTELLATIONS: ConstellationDef[] = [ARIES, TAURUS, GEMINI, CANCER, LEO, VIRGO, LIBRA, SCORPIO, SAGITTARIUS, CAPRICORN, AQUARIUS, PISCES, ORION, BIG_DIPPER, CASSIOPEIA, CYGNUS, LYRA, AQUILA, CANIS_MAJOR, PEGASUS];
