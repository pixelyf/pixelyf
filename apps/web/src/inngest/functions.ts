import { inngest } from "@/lib/inngest";
import prisma from "@/shared/lib/prisma";
import { generateCharacterResponse } from "@/shared/lib/ai/gemini";
import { getTranslations } from "next-intl/server";

// 캐릭터 상호작용 및 유대감 처리 비동기 워커
export const processAiInteraction = inngest.createFunction(
  { 
    id: "process-ai-interaction",
    name: "Process AI Interaction",
    triggers: [{ event: "ai/interaction.triggered" }] 
  },
  async ({ event, step }) => {
    type InteractionEvent = {
      userId: string;
      characterCode: string;
      triggerType: "AI_INITIATED" | "USER_RESPONSE" | string;
      interactionId: string; // API에서 생성된 ID 필수 포함
    };
    const { userId, characterCode: rawCharacterCode, triggerType, interactionId } = event.data as InteractionEvent;

    // 0. 가드 클로저 (4차 정밀 감사 재검토: 문자열 연산 전 유효성 검증 우선 실행)
    if (!interactionId || !userId || !rawCharacterCode) {
      console.error("[Inngest] Missing essential IDs", { interactionId, userId, rawCharacterCode });
      return; // 재시도 없이 중단 (Bad Data로 간주)
    }

    const characterCode = rawCharacterCode.toUpperCase(); // 가드 통과 후 안전하게 호출

    // 1. 초기 데이터 및 중복 처리 확인 (Idempotency & Data Fetching)
    const contextData = await step.run("fetch-interaction-context", async () => {
      const existing = await prisma.aiInteraction.findUnique({
        where: { id: interactionId },
        select: { status: true, message: true }
      });
      
      if (!existing) throw new Error(`Interaction ${interactionId} not found`);
      if (existing.status === "completed") return { isCompleted: true, message: existing.message };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          display_name: true,
          country: true,
          language: true,
          current_aura: true
        }
      });

      // 최근 대화 이력 3건 가져오기 (Memory Buffer)
      const history = await prisma.aiInteraction.findMany({
        where: { 
          user_id: userId, 
          character_code: characterCode, 
          status: "completed",
          message: { not: null }
        },
        orderBy: { created_at: "desc" },
        take: 3,
        select: { message: true }
      });

      const locale = user?.language || "ko";
      const t = await getTranslations({ locale, namespace: "Common" });

      return {
        isCompleted: false,
        userName: user?.display_name || t("pixelier"),
        country: user?.country || "KR",
        language: user?.language || "ko",
        userAura: user?.current_aura || "GLOW",
        recentHistory: history.map(h => h.message!).reverse()
      };
    });

    if (contextData.isCompleted) return { success: true, message: (contextData as any).message as string };

    const { userName, country, language, userAura, recentHistory } = contextData as any;

    // 2. 반응 메시지 생성 (Aura & Memory 반영)
    const message = await step.run("generate-dynamic-reaction", async () => {
      return await generateCharacterResponse({
        userName: userName as string,
        characterCode,
        triggerType,
        country: country as string,
        language: language as string,
        userAura: userAura as string,
        recentHistory: recentHistory as string[]
      });
    });

    // 3. 유대감 및 데이터 업데이트 (Atomic Transaction)
    const isAiInitiated = triggerType === "AI_INITIATED";
    const points = isAiInitiated ? 5 : 20;
    const stardustReward = isAiInitiated ? 1 : 2; 

    const affinity = await step.run("process-affinity-and-reward", async () => {
      const [newAffinity] = await prisma.$transaction([
        prisma.userAiAffinity.upsert({
          where: {
            user_id_character_code: { user_id: userId, character_code: characterCode },
          },
          update: {
            affinity_score: { increment: points },
            interaction_count: { increment: 1 },
            last_interacted_at: new Date(),
          },
          create: {
            user_id: userId,
            character_code: characterCode,
            affinity_score: points,
            interaction_count: 1,
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { stardust_balance: { increment: stardustReward } },
        }),
        prisma.aiInteraction.update({ 
          where: { id: interactionId },
          data: {
            status: "completed",
            action_type: "REPLY",
            message: message,
            processed_at: new Date(),
          },
        }),
      ]);
      return newAffinity;
    });

    // 3. 공명 단계 상승 판정 (비선형 수식 적용)
    // 5차 정밀 감사: 한 번에 여러 단계 상승이 가능하도록 수식(Math.floor) 기반 업데이트 도입
    const targetStage = Math.floor(affinity.affinity_score / 100) + 1;
    
    if (targetStage > affinity.resonance_stage) {
      await step.run("update-resonance-stage", async () => {
        try {
          return await prisma.userAiAffinity.update({
            where: { 
              id: affinity.id,
              resonance_stage: affinity.resonance_stage // 낙관적 락 유지
            },
            data: { resonance_stage: targetStage }, // 계산된 목표 단계로 직접 점프
          });
        } catch (error: any) {
          if (error.code === "P2025") {
            console.log("[Inngest] Stage already updated by concurrent process.");
            return null;
          }
          throw error;
        }
      });
    }

    return { 
      success: true, 
      newScore: affinity.affinity_score,
      newStage: targetStage
    };
  }
);
