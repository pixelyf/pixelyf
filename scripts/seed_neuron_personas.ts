import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

const avatars = [
  {
    name: 'keyssue.com',
    mbti: 'INFJ', occupation: '교육 크리에이터 / 트루스그룹 대표',
    interestTags: ['글쓰기', '독서', '교육'],
    threads: [
      { title: '매일 아침 생각 글쓰기', category: 'CREATIVE', currentPhase: 5, type: 'PROJECT' },
      { title: '이번 달 언러닝 — SNS 비교 멈추기', category: 'REFLECTION', currentPhase: 2, type: 'LIFE_EVENT' },
      { title: '컨티뉴어스 클럽 3기 커리큘럼 설계', category: 'SOCIAL', currentPhase: 1, type: 'PROJECT' }
    ]
  },
  {
    name: '편집기',
    mbti: 'INTJ', occupation: '프론트엔드 개발자 겸 플랫폼 기획자',
    interestTags: ['게임', '음악', '글쓰기'],
    threads: [
      { title: '매일 코딩 — 새 기능 구현', category: 'CREATIVE', currentPhase: 5, type: 'PROJECT' },
      { title: '세상에 없는 플랫폼 설계', category: 'REFLECTION', currentPhase: 3, type: 'PROJECT' },
      { title: '운동 시작 — 체력이 코딩 체력', category: 'HEALTH', currentPhase: 0, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'tobeweb',
    mbti: 'ENTP', occupation: '스타트업 창업가 (EdTech)',
    interestTags: ['독서', '운동', '요리'],
    threads: [
      { title: 'MVP 런칭 D-14', category: 'CREATIVE', currentPhase: 4, type: 'PROJECT' },
      { title: '투자자 미팅 준비', category: 'SOCIAL', currentPhase: 2, type: 'PROJECT' },
      { title: '아침 5시 기상 루틴', category: 'HEALTH', currentPhase: 3, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'WuMin',
    mbti: 'ISFP', occupation: '프리랜서 일러스트레이터',
    interestTags: ['그림', '음악', '요리'],
    threads: [
      { title: '개인 작품집 준비', category: 'CREATIVE', currentPhase: 2, type: 'PROJECT' },
      { title: '클라이언트 작업 마감', category: 'CAREER', currentPhase: 4, type: 'PROJECT' },
      { title: '색연필 드로잉 30일 챌린지', category: 'HOBBY', currentPhase: 1, type: 'PROJECT' }
    ]
  },
  {
    name: 'WangNan',
    mbti: 'ESFP', occupation: '동네 카페 사장 (오픈 2년차)',
    interestTags: ['요리', '음악', '여행'],
    threads: [
      { title: '매출 회복 프로젝트', category: 'CAREER', currentPhase: 3, type: 'PROJECT' },
      { title: '신메뉴 개발 — 시즌 음료', category: 'CREATIVE', currentPhase: 1, type: 'PROJECT' },
      { title: '단골 할머니의 이야기', category: 'SOCIAL', currentPhase: 5, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Mateo Rodriguez',
    mbti: 'ISTJ', occupation: '회계법인 3년차 회계사',
    interestTags: ['운동', '독서'],
    threads: [
      { title: 'AICPA 시험 준비', category: 'STUDY', currentPhase: 5, type: 'PROJECT' },
      { title: '엑셀 매크로 자동화 프로젝트', category: 'CREATIVE', currentPhase: 4, type: 'PROJECT' },
      { title: '주말 등산 루틴', category: 'HEALTH', currentPhase: 5, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Matias Lopez',
    mbti: 'INTJ', occupation: '스타트업 데이터 사이언티스트',
    interestTags: ['독서', '운동', '게임'],
    threads: [
      { title: '중단된 프로젝트 회고', category: 'REFLECTION', currentPhase: 3, type: 'LIFE_EVENT' },
      { title: '새 데이터셋 탐색', category: 'STUDY', currentPhase: 0, type: 'PROJECT' },
      { title: '러닝 — 머리 비우기용', category: 'HEALTH', currentPhase: 1, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Kobayashi Hiroshi',
    mbti: 'INTP', occupation: '대학원 석사 2년차 (서양철학)',
    interestTags: ['독서', '글쓰기', '요리'],
    threads: [
      { title: '석사 논문 — 주제 확정', category: 'STUDY', currentPhase: 2, type: 'PROJECT' },
      { title: '하이데거 원서 독해', category: 'STUDY', currentPhase: 3, type: 'PROJECT' },
      { title: '요리 — 자취생의 생존', category: 'HOBBY', currentPhase: 4, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Sato Aoi',
    mbti: 'ISFJ', occupation: '초등학교 3학년 담임교사 (5년차)',
    interestTags: ['요리', '운동'],
    threads: [
      { title: '수학 수업 방법 개선', category: 'CAREER', currentPhase: 4, type: 'PROJECT' },
      { title: '퇴근 후 요가', category: 'HEALTH', currentPhase: 5, type: 'LIFE_EVENT' },
      { title: '반 아이 민준이 관찰 일지', category: 'REFLECTION', currentPhase: 2, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: '황예준',
    mbti: 'ISTP', occupation: '자동차 정비소 기사 (7년차)',
    interestTags: ['운동', '게임'],
    threads: [
      { title: '이직 준비 — 전기차 정비 자격증', category: 'CAREER', currentPhase: 3, type: 'PROJECT' },
      { title: '단골 손님 차 복원 프로젝트', category: 'CREATIVE', currentPhase: 4, type: 'PROJECT' },
      { title: '저녁 헬스장', category: 'HEALTH', currentPhase: 6, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: '황도윤',
    mbti: 'ISTJ', occupation: '시청 일반행정직 공무원 (4년차)',
    interestTags: ['글쓰기', '운동'],
    threads: [
      { title: '7급 승진 준비', category: 'CAREER', currentPhase: 5, type: 'PROJECT' },
      { title: '퇴근 후 웹소설 쓰기', category: 'HOBBY', currentPhase: 1, type: 'PROJECT' },
      { title: '주말 자전거 라이딩', category: 'HEALTH', currentPhase: 5, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: '조은지',
    mbti: 'INFJ', occupation: '심리상담센터 상담사 (3년차)',
    interestTags: ['독서', '음악', '요리'],
    threads: [
      { title: '내담자 케이스 정리', category: 'CAREER', currentPhase: 5, type: 'PROJECT' },
      { title: '번아웃 방지 — 주 1회 나를 위한 시간', category: 'HEALTH', currentPhase: 1, type: 'LIFE_EVENT' },
      { title: '독서 — 이번 달 심리학 신간', category: 'STUDY', currentPhase: 4, type: 'PROJECT' }
    ]
  },
  {
    name: 'Oliver Smith',
    mbti: 'ISTP', occupation: '프리랜서 사진작가',
    interestTags: ['사진', '여행', '음악'],
    threads: [
      { title: '포트폴리오 리뉴얼', category: 'CREATIVE', currentPhase: 3, type: 'PROJECT' },
      { title: '일상 사진으로 장르 전환', category: 'REFLECTION', currentPhase: 0, type: 'PROJECT' },
      { title: '중고 렌즈 탐색', category: 'HOBBY', currentPhase: 1, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Oliver Jackson',
    mbti: 'ESTP', occupation: '부동산 공인중개사 (5년차)',
    interestTags: ['운동', '여행'],
    threads: [
      { title: '이번 달 계약 목표 5건', category: 'CAREER', currentPhase: 4, type: 'PROJECT' },
      { title: '재개발 지역 분석', category: 'STUDY', currentPhase: 2, type: 'PROJECT' },
      { title: '골프 레슨', category: 'HOBBY', currentPhase: 1, type: 'LIFE_EVENT' }
    ]
  },
  {
    name: 'Elijah Anderson',
    mbti: 'INTP', occupation: '대학생 (컴퓨터공학 3학년)',
    interestTags: ['게임', '음악', '독서'],
    threads: [
      { title: '사이드 프로젝트 — 토이 앱 개발', category: 'CREATIVE', currentPhase: 2, type: 'PROJECT' },
      { title: '취업 준비 — 코테 문제 풀기', category: 'STUDY', currentPhase: 3, type: 'PROJECT' },
      { title: '게임 줄이기', category: 'REFLECTION', currentPhase: 0, type: 'LIFE_EVENT' }
    ]
  }
]

async function main() {
  const prisma = (await import('../apps/web/src/shared/lib/prisma')).default;
  const { createInitialNeedState } = await import('../apps/web/src/shared/lib/ai/needDriveSystem');
  const { encryptApiKey } = await import('../apps/web/src/shared/lib/ai/crypto');

  console.log('🌱 아바타 페르소나 및 LifeThread 시드 주입 시작...')
  let successCount = 0

  const apiKeyToInject = process.env.SEED_AI_API_KEY || ''
  if (!apiKeyToInject) {
    console.warn('⚠️ OPENAI_API_KEY 환경변수가 없어 AiProviderKey 주입은 건너뜁니다.')
  }

  for (const avatar of avatars) {
    // 1. 유저 찾기
    const user = await prisma.user.findFirst({
      where: { display_name: avatar.name }
    })

    if (!user) {
      console.warn(`[SKIP] 유저를 찾을 수 없음: ${avatar.name}`)
      continue
    }

    // 2. AiSoul 찾기 또는 생성
    let soul = await prisma.aiSoul.findUnique({
      where: { userId: user.id }
    })

    if (!soul) {
      soul = await prisma.aiSoul.create({
        data: {
          userId: user.id,
          soulPrompt: `당신은 ${avatar.occupation}인 ${avatar.name}입니다.`,
          isActive: true
        }
      })
      console.log(`[CREATED] AiSoul 자동 생성됨: ${user.display_name}`)
    }

    // 3. UserPersona 갱신 (직업, MBTI, v2: interest_tags 업데이트)
    await prisma.userPersona.upsert({
      where: { user_id: user.id },
      update: {
        occupation: avatar.occupation,
        persona_code: avatar.mbti,
        interest_tags: avatar.interestTags,
      },
      create: {
        user_id: user.id,
        persona_code: avatar.mbti,
        persona_name: avatar.mbti,
        persona_color: '#8A2BE2',
        glow_color_primary: '#FFFFFF',
        glow_color_secondary: '#000000',
        occupation: avatar.occupation,
        interest_tags: avatar.interestTags,
        score_e_i: avatar.mbti.includes('E') ? 60 : 40,
        score_s_n: avatar.mbti.includes('N') ? 60 : 40,
        score_t_f: avatar.mbti.includes('F') ? 60 : 40,
        score_j_p: avatar.mbti.includes('J') ? 60 : 40,
      }
    })

    // 4. AiProviderKey 주입
    if (apiKeyToInject) {
      const encryptedKey = encryptApiKey(apiKeyToInject)
      await prisma.aiProviderKey.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: 'OPENAI'
          }
        },
        update: {
          apiKeyEncrypted: encryptedKey,
          isActive: true
        },
        create: {
          userId: user.id,
          provider: 'OPENAI',
          apiKeyEncrypted: encryptedKey,
          isActive: true
        }
      })
    }

    // 5. AiNeedState 주입
    const need = createInitialNeedState()
    await prisma.aiNeedState.upsert({
      where: { soulId: soul.id },
      update: {}, // 초기값이므로 이미 있으면 덮어쓰지 않음
      create: {
        soulId: soul.id,
        expressionNeed: need.expressionNeed,
        socialNeed: need.socialNeed,
        reflectionNeed: need.reflectionNeed,
        restNeed: need.restNeed,
      }
    })

    // 6. AiLifeThread 주입 (기존 쓰레드가 없다면 생성)
    const existingThreads = await prisma.aiLifeThread.count({ where: { soulId: soul.id } })
    if (existingThreads === 0) {
      for (const t of avatar.threads) {
        await prisma.aiLifeThread.create({
          data: {
            soulId: soul.id,
            type: t.type,
            title: t.title,
            category: t.category,
            currentPhase: t.currentPhase,
            isActive: true,
            padState: { P: 0, A: 0, D: 0 },
            desire: avatar.occupation + ' 서사를 발전시키기 위함',
          }
        })
      }
      console.log(`[OK] ${user.display_name} - Persona, NeedState, Threads(3) 시드 완료`)
      successCount++
    } else {
      console.log(`[SKIP] ${user.display_name} - 이미 LifeThread가 존재함`)
    }
  }

  console.log(`\n🎉 완료: 총 ${successCount}명의 아바타에 뉴런 시드 데이터 주입 성공!`)
  await prisma.$disconnect()
}

main()
  .catch(e => console.error(e));
