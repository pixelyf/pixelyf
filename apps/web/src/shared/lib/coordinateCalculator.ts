/**
 * [Galaxy Coordinate Calculator — SSoT (Single Source of Truth)]
 *
 * 최신 동적 코어 성단(Glow Cluster) 및 하이브리드 성운 배치 알고리즘 (30만명 대규모 수용).
 * 모든 실시간 좌표 생성 코드(auth/actions.ts, api/galaxies/join)는 이 모듈을 참조합니다.
 *
 * 1. 동적 코어 한계선 (coreLimit): max(10, round(2.5 * sqrt(totalUsers)))
 * 2. 코어 존 (rank <= coreLimit):
 *    - base_radius = (2.5 * galaxy_scale) + (0.35 * rank)
 *    - sigma = 0.3 극소 편차 제어
 *    - 랭킹 위계 장벽: max(previousRadius + 0.35, baseRadius + noise)
 * 3. 성운 존 (rank > coreLimit):
 *    - 왜곡 성운: 5갈래 나선팔 Conic 왜곡 (1.0 + 0.35 * sin(5.0 * theta))
 *    - r_noise = gauss(0, sigma)
 *    - previousRadius 하한 격리 장벽 보존
 */

import geometryConfig from './galaxy_geometry.json'

export function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function gaussianFromSeed(rng: () => number, mean: number, stdev: number): number {
  // u가 극소값 1e-15 미만으로 떨어지지 않도록 수학적 안전 격벽 장치 부여 (NaN/Infinity 원천 차단)
  const u = Math.max(1e-15, 1 - rng());
  const v = 1 - rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdev + mean;
}

/**
 * 최신 동적 코어 성단 하이브리드 배치 알고리즘
 * 1위부터 rank까지 궤도 누적 시뮬레이션을 수행하여, 백엔드와 100% 동일한 격벽 반경을 도출합니다.
 */
export function calculatePosition(
  rank: number,
  cx: number,
  cy: number,
  totalUsers: number,
  galaxyKey: string = 'PIXELYF',
  userSeed?: string
): { x: number; y: number } {


  // 은하 고유 스케일 및 회전각 오프셋 결정론적 산출
  const gRng = seededRandom(galaxyKey);
  const galaxyAngleOffset = gRng() * 2 * Math.PI;
  const galaxyScale = 0.85 + gRng() * 0.3; // 0.85 ~ 1.15

  const CORE_SCALE_MULTIPLIER = 2.5;
  const coreLimit = Math.max(geometryConfig.ZONE_2_INFLUENCER.limit_rank, Math.round(CORE_SCALE_MULTIPLIER * Math.sqrt(totalUsers)));

  // 1위부터 대상 rank까지 순차 시뮬레이션 돌려 previousRadius를 누적 연산 (O(Rank) 복잡도 - ms단위로 극도로 빠름)
  let previousRadius = 0.0;
  let z2EndRadius = 0.0; // Zone 2 최종 반경 고정 저장용
  let z3EndRadius = 0.0; // Zone 3 최종 반경 고정 저장용
  let z4EndRadius = 0.0; // Zone 4 최종 반경 고정 저장용 (5구간 단절 차단 앵커)
  let finalOrbitX = 0.0;
  let finalOrbitY = 0.0;

  const z1 = geometryConfig.ZONE_1_CHAMPION;
  const z2 = geometryConfig.ZONE_2_INFLUENCER;
  const z3 = geometryConfig.ZONE_3_NEBULA_DENSE;

  for (let r = 1; r <= rank; r++) {
    // 해당 등수의 seed 획득 (대상 rank만 userSeed를 쓰고, 그 외는 r 인덱스를 시드로 써서 궤도 누적선 동기화)
    const seed = (r === rank && userSeed) ? userSeed : `slot_seed_${r}`;
    const rng = seededRandom(seed);

    if (r === 1) {
      finalOrbitX = 0.0;
      finalOrbitY = 0.0;
      previousRadius = 0.0;
      continue;
    }

    let theta = r * 2.39996 + galaxyAngleOffset;

    if (r <= z1.limit_rank) {
      // ── [1구간: 절대 영점 초밀집 완화 코어 (Rank 2 ~ 10)] ──
      const baseRadius = z1.radial_increment * r;
      const rNoise = gaussianFromSeed(rng, 0, z1.sigma);
      const radius = Math.max(previousRadius + z1.radial_increment, baseRadius + rNoise);
      previousRadius = radius;

      theta += gaussianFromSeed(rng, 0, z1.angle_jitter);
      finalOrbitX = radius * Math.cos(theta);
      finalOrbitY = radius * Math.sin(theta);
    } else if (r <= z2.limit_rank) {
      // ── [2구간: 인플루언서 완화 성단 고리 (Rank 11 ~ 50)] ──
      const baseRadius = previousRadius + z2.radial_increment;
      const rNoise = gaussianFromSeed(rng, 0, z2.sigma);
      const radius = Math.max(previousRadius + z2.radial_increment, baseRadius + rNoise);
      previousRadius = radius;

      if (r === z2.limit_rank) {
        z2EndRadius = radius; // Zone 2 최종 반경 고정 저장
      }

      theta += gaussianFromSeed(rng, 0, z2.angle_jitter);
      finalOrbitX = radius * Math.cos(theta);
      finalOrbitY = radius * Math.sin(theta);
    } else if (r <= z3.limit_rank) {
      // ── [3구간 (NEW): 초밀집 안쪽 성운 (Rank 51 ~ 100)] ──
      // [PERFORMANCE FIX] z2EndRadius 고정 앵커를 기준으로 선형적으로 0.34씩 증가시켜 지수 팽창 버그를 원천 격리 차단합니다.
      const baseRadius = z2EndRadius + z3.radial_increment * (r - z2.limit_rank);
      const rNoise = gaussianFromSeed(rng, 0, z3.sigma);
      
      const distortion = 1.0 + 0.10 * Math.sin(5.0 * theta);
      const radius = Math.max(previousRadius + z3.radial_increment, (baseRadius * distortion) + rNoise);
      previousRadius = radius;

      if (r === z3.limit_rank) {
        z3EndRadius = radius; // Zone 3 최종 반경 고정 저장
      }

      theta += gaussianFromSeed(rng, 0, z3.angle_jitter);
      finalOrbitX = radius * Math.cos(theta);
      finalOrbitY = radius * Math.sin(theta);
    } else {
      // ── [외곽 우주 성운 구역 (Outer Nebula Zone, Rank 101 이상)] ──
      let baseRadius = 0.0;
      let sigma = 10.0;

      const distortion = 1.0 + 0.10 * Math.sin(5.0 * theta);

      if (r <= 700) {
        // ── [4구간 (NEW): 미디엄 성운 구역 (Rank 301 ~ 700)] ──
        // [PERFORMANCE FIX] z3EndRadius 고정 앵커를 기준으로 0.68씩 선형 증가시켜 3구간과의 궤도 공백 단절을 완벽하게 차단합니다.
        const baseRadiusNebula = z3EndRadius + 0.54 * (r - z3.limit_rank);
        const organicMinRadius = (2.5 * galaxyScale) * Math.sqrt(r);
        baseRadius = Math.max(baseRadiusNebula, organicMinRadius);
        sigma = Math.max(1.0, baseRadius * 0.15);

        if (r === 700) {
          z4EndRadius = baseRadius; // 4구간의 최종 궤도 반경 기록
        }
      } else {
        const R700 = z4EndRadius > 0.0 ? z4EndRadius : 339.1;
        const R2000 = Math.sqrt(R700 * R700 + (28 * 28 / Math.PI) * 1300); // 700위부터 2000위까지 1300명 누적
        const R5000 = Math.sqrt(R2000 * R2000 + (40 * 40 / Math.PI) * 3000); // 2000위부터 5000위까지 3000명 누적
        const R50000 = Math.sqrt(R5000 * R5000 + (28 * 28 / Math.PI) * 45000);

        if (r <= 2000) {
          // ── [5구간 (NEW): 중간 성운 (Rank 701 ~ 2000)] ──
          baseRadius = Math.sqrt(R700 * R700 + (28 * 28 / Math.PI) * (r - 700));
          sigma = 15.0;
        } else if (r <= 5000) {
          // ── [6구간 (NEW): 대기 확산 (Rank 2001 ~ 5000)] ──
          baseRadius = Math.sqrt(R2000 * R2000 + (40 * 40 / Math.PI) * (r - 2000));
          sigma = 35.0;
        } else if (r <= 50000) {
          // ── [7구간 (NEW): 최외곽 확장 (Rank 5001 ~ 50000)] ──
          baseRadius = Math.sqrt(R5000 * R5000 + (28 * 28 / Math.PI) * (r - 5000));
          sigma = 30.0;
        } else {
          // ── [8구간 (NEW): 심우주 이탈 (Rank 50001 이상)] ──
          baseRadius = Math.sqrt(R50000 * R50000 + (25 * 25 / Math.PI) * (r - 50000));
          sigma = 30.0;
        }
      }

      theta += gaussianFromSeed(rng, 0, 0.08); // 3구간 이후 부드러운 각도 흔들기(Jitter) 합성
      const rNoise = gaussianFromSeed(rng, 0, sigma);
      const radius = (baseRadius * distortion) + rNoise; // 외곽 구역 겹침 격벽(Math.max)을 전면 제거하여 입체적인 흩뿌림 극대화
      
      previousRadius = radius; // 겹침 구속력 제거

      finalOrbitX = radius * Math.cos(theta);
      finalOrbitY = radius * Math.sin(theta);
    }
  }

  return {
    x: cx + finalOrbitX,
    y: cy + finalOrbitY,
  };
}



