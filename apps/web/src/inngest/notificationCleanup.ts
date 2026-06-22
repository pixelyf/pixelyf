import { inngest } from "@/lib/inngest";
import { purgeOldNotifications } from '@/shared/services/notificationService'

/**
 * Inngest Cron Function: 알림 자동 정리
 * 매주 일요일 03:00 UTC (한국 12:00) 실행
 * 업계 표준: 90일 이상 지난 읽은 알림을 자동 삭제하여 DB 비대화 방지
 */
export const notificationCleanupCron = inngest.createFunction(
  {
    id: "notification-cleanup-cron",
    name: "Notification Cleanup Cron",
    triggers: [{ cron: "0 3 * * 0" }], // 매주 일요일 03:00 UTC
  },
  async ({ step }: { step: any }) => {
    const result = await step.run("purge-old-notifications", async () => {
      const deleted = await purgeOldNotifications(90) // 90일 기준
      return { deletedCount: deleted.count }
    })

    return {
      ...result,
      timestamp: new Date().toISOString(),
    }
  }
)
