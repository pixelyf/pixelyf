import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { processAiInteraction } from "@/inngest/functions";
import { notificationCleanupCron } from "@/inngest/notificationCleanup";
import { 
  feedTranslationFunction, 
  commentTranslationFunction 
} from "@/inngest/babelTranslation";

export const dynamic = "force-dynamic";

// Inngest 엔드포인트 노출 (Vercel/Next.js 워커 연결용)
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processAiInteraction, // AI 상호작용 트리거 함수 등록
    notificationCleanupCron, // 알림 자동 정리 주간 배치
    feedTranslationFunction, // [Babel Feed] 피드 다국어 번역 비동기 워커
    commentTranslationFunction, // [Babel Comment] 댓글 다국어 번역 비동기 워커
  ],
});

