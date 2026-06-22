import { NextResponse } from "next/server";
import prisma from "@/shared/lib/prisma";

export const forceDynamic = 'force-dynamic';

/**
 * GET /api/weather/status
 * 은하계의 현재 우주 기상 상태를 조회합니다.
 */
export async function GET() {
  try {
    const now = new Date();

    // 현재 시각 기준 활성화된 기상 로그 조회 (가장 최근에 생성된 것 우선)
    const activeWeather = await prisma.cosmicWeatherLog.findFirst({
      where: {
        start_time: { lte: now },
        end_time: { gte: now },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // 활성 기상이 없을 경우 기본값(CALM) 반환
    if (!activeWeather) {
      return NextResponse.json({
        weather_type: 'CALM',
        stardust_multiplier: 1.0,
        start_time: null,
        end_time: null,
        is_active: false
      });
    }

    return NextResponse.json({
      weather_type: activeWeather.weather_type,
      stardust_multiplier: activeWeather.stardust_multiplier,
      start_time: activeWeather.start_time,
      end_time: activeWeather.end_time,
      is_active: true
    });
  } catch (error) {
    console.error("[Weather Update Error]:", error);
    return NextResponse.json({ 
      error: "Failed to fetch cosmic weather status",
      weather_type: 'CALM',
      stardust_multiplier: 1.0
    }, { status: 500 });
  }
}
