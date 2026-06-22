import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { PERSONA_MAP } from "@/shared/constants/personas";
import {
  generatePersonaFromScores,
  type PersonalityScores,
} from "@/shared/lib/ai/autoPersonaGenerator";
import { MBTI_SURVEY } from "@/shared/constants/survey";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { mbtiCode, surveyCompleted = false, answersVector = [] } = body;

    if (!mbtiCode || !(mbtiCode in PERSONA_MAP)) {
      return NextResponse.json(
        { error: "Invalid persona code" },
        { status: 400 },
      );
    }

    const personaConfig = PERSONA_MAP[mbtiCode as keyof typeof PERSONA_MAP];

    // --- 가입순 황금각 슬롯 나선형(Phyllotaxis Packing) 좌표 계산 ---
    const getColdStartCoords = (rank: number, userId: string): { x: number; y: number } => {
      if (rank === 1) {
        return { x: 0, y: 0 }
      }

      // user_id 문자열 시드 기반 LCG 의사 난수 생성기
      const seed = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      let randomVal = seed
      const lcgRandom = () => {
        randomVal = (randomVal * 1664525 + 1013904223) % 4294967296
        return randomVal / 4294967296
      }
      
      const gaussianNoise = (mean = 0, stdDev = 1) => {
        const u = 1 - lcgRandom()
        const v = lcgRandom()
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
        return z * stdDev + mean
      }

      const ZONE_1_LIMIT = 10
      const ZONE_2_LIMIT = 100
      const ZONE_3_LIMIT = 300

      const thetaBase = rank * 2.39996 // 황금각 (2.39996 라디안)

      let radius = 0
      let finalTheta = thetaBase

      // 1구간 (Rank 2 ~ 10)
      if (rank <= ZONE_1_LIMIT) {
        const radialIncrement = 0.4125
        const baseRadius = radialIncrement * rank
        const rNoise = gaussianNoise(0, 0.225)
        const prevRadiusEstimate = radialIncrement * (rank - 1)
        radius = Math.max(prevRadiusEstimate + radialIncrement, baseRadius + rNoise)
        finalTheta = thetaBase + gaussianNoise(0, 0.03)
      }
      // 2구간 (Rank 11 ~ 100)
      else if (rank <= ZONE_2_LIMIT) {
        const z1EndEstimate = 0.4125 * 10
        const radialIncrement = 0.20
        const baseRadius = z1EndEstimate + radialIncrement * (rank - 10)
        const rNoise = gaussianNoise(0, 0.20)
        const prevRadiusEstimate = z1EndEstimate + radialIncrement * (rank - 11)
        radius = Math.max(prevRadiusEstimate + radialIncrement, baseRadius + rNoise)
        finalTheta = thetaBase + gaussianNoise(0, 0.07)
      }
      // 3구간 (Rank 101 ~ 300)
      else if (rank <= ZONE_3_LIMIT) {
        const z2EndEstimate = 0.4125 * 10 + 0.20 * 90
        const radialIncrement = 0.27
        const baseRadius = z2EndEstimate + radialIncrement * (rank - 100)
        const rNoise = gaussianNoise(0, 0.15)
        const prevRadiusEstimate = z2EndEstimate + radialIncrement * (rank - 101)
        
        const distortion = 1.0 + 0.35 * Math.sin(5.0 * thetaBase)
        radius = Math.max(prevRadiusEstimate + radialIncrement, (baseRadius * distortion) + rNoise)
        finalTheta = thetaBase + gaussianNoise(0, 0.18)
      }
      // 외곽 (Rank 301 이상)
      else {
        const z3EndEstimate = 0.4125 * 10 + 0.20 * 90 + 0.27 * 200
        const baseRadius = z3EndEstimate + 0.68 * (rank - 300)
        const sigma = Math.max(1.0, baseRadius * 0.15)
        const rNoise = gaussianNoise(0, sigma)
        const distortion = 1.0 + 0.35 * Math.sin(5.0 * thetaBase)
        const prevRadiusEstimate = z3EndEstimate + 0.68 * (rank - 301)
        radius = Math.max(prevRadiusEstimate + 1.0, (baseRadius * distortion) + rNoise)
        finalTheta = thetaBase + gaussianNoise(0, 0.18)
      }

      return {
        x: radius * Math.cos(finalTheta),
        y: radius * Math.sin(finalTheta)
      }
    }

    // --- 진짜 은하(Spiral Galaxy) 모양 랜덤 좌표 계산 ---
    const randomGaussian = (mean = 0, stdDev = 1) => {
      const u = 1 - Math.random();
      const v = Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return z * stdDev + mean;
    };

    const MAX_RADIUS = 35;
    const numArms = 2;
    const spinTwist = 0.1;
    const coreRotation = Math.random() * Math.PI * 2;

    const distanceRatio = Math.pow(Math.random(), 1.5);
    const r = distanceRatio * MAX_RADIUS;
    const armIndex = Math.floor(Math.random() * numArms);
    const baseAngle = coreRotation + (armIndex * 2 * Math.PI) / numArms;
    const twistAngle = r * spinTwist;
    const scatterMagnitude = 0.5 + r * 0.1;
    const angleNoise = randomGaussian(0, scatterMagnitude / Math.max(r, 1));
    const radiusNoise = randomGaussian(0, scatterMagnitude * 0.5);

    const finalR = Math.max(0, r + radiusNoise);
    const theta = baseAngle + twistAngle + angleNoise;
    const jitterX = finalR * Math.cos(theta);
    const jitterY = finalR * Math.sin(theta);

    // --- MBTI 4축 스코어 산출 (2-Track 하이브리드 지원) ---
    let scoreEI = 50;
    let scoreSN = 50;
    let scoreTF = 50;
    let scoreJP = 50;

    if (Array.isArray(answersVector) && answersVector.length === 20) {
      // [정밀 설문 트랙] 20문항 5점 리커트 척도 연산 (-2 ~ +2)
      const rawSums: Record<"EI" | "SN" | "TF" | "JP", number> = {
        EI: 0,
        SN: 0,
        TF: 0,
        JP: 0,
      };
      const firstPoles: Record<"EI" | "SN" | "TF" | "JP", string> = {
        EI: "E",
        SN: "S",
        TF: "T",
        JP: "J",
      };

      MBTI_SURVEY.forEach((q, idx) => {
        const val = Number(answersVector[idx]) || 0; // -2 ~ +2 스펙트럼
        const dim = q.dimension;
        const isFirstPole = q.pole === firstPoles[dim];

        // 해당 질문의 대변 극성이 1차 극성이면 덧셈, 2차 극성이면 뺄셈 적용
        rawSums[dim] += isFirstPole ? val : -val;
      });

      // 각 차원당 5문항이므로 최대값 10, 최소값 -10 범위 가짐. 이를 0~100 스코어로 선형 정규화
      // score = ((rawSum + 10) / 20) * 100
      scoreEI = Math.round(((rawSums.EI + 10) / 20) * 100);
      scoreSN = Math.round(((rawSums.SN + 10) / 20) * 100);
      scoreTF = Math.round(((rawSums.TF + 10) / 20) * 100);
      scoreJP = Math.round(((rawSums.JP + 10) / 20) * 100);
    } else {
      // [직접 선택 트랙] MBTI 코드를 기반으로 극점 점수(100/0)로 보정 매핑
      const code = mbtiCode.toUpperCase();
      scoreEI = code.includes("E") ? 100 : 0;
      scoreSN = code.includes("S") ? 100 : 0;
      scoreTF = code.includes("T") ? 100 : 0;
      scoreJP = code.includes("J") ? 100 : 0;
    }

    // 10차원 정적 벡터 생성 (설계문서 04_UMAP_좌표계_설계.md 공식: (raw - 50) / 50.0 → -1.0 ~ 1.0)
    // 축 순서: [E/I, S/N, T/F, J/P, morning/night, home/open, spend/save, depth/broad, calm/vibrant, yolo/future]
    // 확장 6축은 설문 미구현 상태이므로 중립값(50) 유지
    const rawScores = [
      scoreEI,
      scoreSN,
      scoreTF,
      scoreJP,
      50,
      50,
      50,
      50,
      50,
      50,
    ];
    const staticVector = rawScores.map((raw) => (raw - 50) / 50.0);

    const googleUid = user.user_metadata?.provider_id || user.id;
    const displayName =
      user.user_metadata?.full_name || user.user_metadata?.name || "Anonymous";

    // [Phase 31] pixel_id 보존: 기존 유저의 pixel_id가 이미 존재하면 덮어쓰지 않음
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, pixel_id")
      .eq("id", user.id)
      .maybeSingle();

    const nextPixelId = existingUser?.pixel_id || crypto.randomUUID();
    const userMutation = existingUser
      ? supabase
          .from("users")
          .update({
            google_uid: googleUid,
            pixel_id: nextPixelId,
          })
          .eq("id", user.id)
      : supabase.from("users").insert({
          id: user.id,
          google_uid: googleUid,
          pixel_id: nextPixelId,
          display_name: displayName,
          avatar_image_url:
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            null,
          avatar_type: "svg",
          current_aura: "GLOW",
          activity_score: 0,
          streak_days: 1,
        });

    const { error: userError } = await userMutation;

    if (userError) throw userError;

    // [v4] autoPersonaGenerator: 성격 점수 기반 직업/관심사 자동 생성
    // 기존 유저의 occupation이 이미 있으면 덮어쓰지 않음 (lifeCycleEngine 보존)
    const { data: existingPersona } = await supabase
      .from("user_personas")
      .select("occupation, interest_tags")
      .eq("user_id", user.id)
      .maybeSingle();

    const personaScores: PersonalityScores = {
      score_e_i: scoreEI,
      score_s_n: scoreSN,
      score_t_f: scoreTF,
      score_j_p: scoreJP,
      score_morning_night: 50,
      score_home_open: 50,
      score_spend_save: 50,
      score_depth_broad: 50,
      score_calm_vibrant: 50,
      score_yolo_future: 50,
    };
    const autoPersona = generatePersonaFromScores(personaScores);

    // 기존 occupation/interest_tags가 있으면 보존, 없으면 자동 생성 값 사용
    const finalOccupation =
      existingPersona?.occupation || autoPersona.occupation;
    const finalInterestTags =
      existingPersona?.interest_tags && existingPersona.interest_tags.length > 0
        ? existingPersona.interest_tags
        : autoPersona.interestTags;

    const { error: personaError } = await supabase.from("user_personas").upsert(
      {
        user_id: user.id,
        persona_code: mbtiCode,
        persona_name: personaConfig.name,
        persona_color: personaConfig.glowColorPrimary,
        glow_color_primary: personaConfig.glowColorPrimary,
        glow_color_secondary: personaConfig.glowColorSecondary,
        survey_completed: surveyCompleted,
        survey_stage: surveyCompleted ? 3 : 1,
        // [Phase 31] 산출된 MBTI 4축 스코어를 DB에 정확히 기록
        score_e_i: scoreEI,
        score_s_n: scoreSN,
        score_t_f: scoreTF,
        score_j_p: scoreJP,
        // [v4] 기존 값 보존 or 자동 생성
        occupation: finalOccupation,
        interest_tags: finalInterestTags,
      },
      { onConflict: "user_id" },
    );

    if (personaError) throw personaError;

    // [방어 코드] 소정 은하 등 partner_code가 이미 존재하는 사용자는 좌표 덮어쓰기 방지
    // [BE-3] .single() → .limit(1).maybeSingle() — 소정 유저 5레코드 시 오류 방지
    const { data: existingCoord } = await supabase
      .from("user_coordinates")
      .select("partner_code")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingCoord?.partner_code) {
      // partner_code가 있는 유저 (소정 은하 등)는 좌표를 유지하고 페르소나만 업데이트
      console.log(
        `[Onboarding] Skipping coordinate upsert for partner user: ${user.id} (${existingCoord.partner_code})`,
      );
    } else {
      // [NEW-3] 복합 UNIQUE 도입 후 onConflict: 'user_id' 불가 → SELECT+UPDATE 전환
      const { data: existingCoordForUpdate } = await supabase
        .from("user_coordinates")
        .select("id")
        .eq("user_id", user.id)
        .eq("galaxy_key", "PIXELYF")
        .maybeSingle();

      if (existingCoordForUpdate) {
        // [버그 수정] 기존 사용자의 경우 기존 배치 좌표(coord_x, coord_y)를 그대로 보존해야 합니다.
        // 따라서 update를 수행하지 않고 좌표 및 성향 유지를 보장합니다.
        console.log(
          `[Onboarding] Skipping coordinate update for existing user to preserve galaxy grid coordinates: ${user.id}`,
        );
      } else {
        // 1. 기존 PIXELYF 은하 가입자 수 쿼리하여 신규 랭킹(rank) 결정
        const { count, error: countError } = await supabase
          .from('user_coordinates')
          .select('*', { count: 'exact', head: true })
          .eq('galaxy_key', 'PIXELYF')

        if (countError) throw countError
        const nextRank = (count || 0) + 1

        // 2. 가입순 촘촘한 정박을 위한 황금각 슬롯 나선형 좌표 계산
        const newCoords = getColdStartCoords(nextRank, user.id)

        // 최초 가입(최초 좌표 생성)일 경우에만 은하 좌표를 계산해 insert합니다.
        const { error: coordError } = await supabase
          .from("user_coordinates")
          .insert({
            user_id: user.id,
            static_vector: staticVector,
            nebula_id: null,
            coord_x: newCoords.x,
            coord_y: newCoords.y,
            z_depth: 1.0,
            glow_radius: 1.0,
            galaxy_key: "PIXELYF",
            rank: nextRank
          });
        if (coordError) throw coordError;
      }
    }

    // Final fetch to return the full profile for immediate front-end sync
    const { data: finalData } = await supabase
      .from("users")
      .select(
        `
        *,
        coordinate:user_coordinates(coord_x, coord_y, galaxy_key),
        persona:user_personas(persona_code)
      `,
      )
      .eq("id", user.id)
      .single();

    // [DAG-2] 소정 유저는 배열 반환 → 안전 처리
    const coordArr = finalData.coordinate;
    const coord = Array.isArray(coordArr)
      ? coordArr.find(
          (c: any) => c.galaxy_key === "PIXELYF" || c.galaxy_key === null,
        ) || coordArr[0]
      : coordArr;

    const fullProfile = {
      ...finalData,
      coordX: coord?.coord_x,
      coordY: coord?.coord_y,
      persona_code: finalData.persona?.persona_code,
    };

    return NextResponse.json({ success: true, user: fullProfile });
  } catch (error) {
    console.error("Onboarding API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
