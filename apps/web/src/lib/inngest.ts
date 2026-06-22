import { Inngest, eventType, staticSchema } from "inngest";

// Inngest 이벤트 데이터 타입 정의
type InteractionEvent = {
  userId: string;
  characterCode: string;
  triggerType: "AI_INITIATED" | "USER_RESPONSE" | string;
  interactionId: string;
};

// [Babel Feed] 비동기 번역 이벤트 데이터 타입
type FeedTranslationEvent = {
  momentId: string;
  userId: string;
  content: string;
  sourceLang: string;
  targetLangs: string[];
};

type CommentTranslationEvent = {
  commentId: string;
  userId: string;
  content: string;
  sourceLang: string;
  targetLangs: string[];
};

// Pixelyf 비동기 이벤트를 관리하는 Inngest 클라이언트
export const inngest = new Inngest({ 
  id: process.env.INNGEST_APP_ID || "pixelyf",
  schemas: {
    "ai/interaction.triggered": eventType("ai/interaction.triggered", {
      schema: staticSchema<InteractionEvent>(),
    }),
    "feed/translation.requested": eventType("feed/translation.requested", {
      schema: staticSchema<FeedTranslationEvent>(),
    }),
    "comment/translation.requested": eventType("comment/translation.requested", {
      schema: staticSchema<CommentTranslationEvent>(),
    }),
  },
  eventKey: process.env.INNGEST_EVENT_KEY || "local_key",
  baseUrl: process.env.INNGEST_BASE_URL || "http://127.0.0.1:8288",
});
