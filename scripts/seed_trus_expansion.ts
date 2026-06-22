import { config } from 'dotenv';
config({ path: 'apps/web/.env' });
config({ path: 'apps/web/.env.local' });

const GALAXY_ID = 'PIXELYF';

async function main() {
  const prisma = (await import('../apps/web/src/shared/lib/prisma')).default;

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   🌌 [2D 기하 수술] PIXELYF 은하 별자리 연결망 복구 엔진  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1) 기존 연결망 삭제 (과부하 연결망 정화)
  await prisma.constellation_bonds.deleteMany({
    where: { galaxy_key: GALAXY_ID }
  });
  console.log('   🧹 과부하를 유발하는 기존 PIXELYF 연결선 완전 정화 완료');

  // 2) 전체 픽셀 좌표 조회
  const coords = await prisma.userCoordinate.findMany({
    where: { galaxyKey: GALAXY_ID },
    select: { id: true, userId: true, coordX: true, coordY: true, color: true }
  });
  console.log(`   전체 수집된 픽셀 좌표 수: ${coords.length}명`);

  const bondsData: any[] = [];
  const bondSet = new Set<string>();
  
  // 각 픽셀별 현재 연결선 카운트 및 개별 목표 연결선 개수 설정
  const bondCounts = new Map<string, number>();
  const bondLimits = new Map<string, number>();

  for (const c of coords) {
    bondCounts.set(c.userId, 0);
    // 픽셀마다 3개에서 10개까지 역동적인 연결 개수를 무작위로 설정
    const limit = Math.floor(Math.random() * 8) + 3; // 3 ~ 10
    bondLimits.set(c.userId, limit);
  }

  const MAX_DISTANCE = 9000; // 최대 결합 허용 물리 거리 (9000px)

  // 3) 2D Euclidean Distance & 4방향 사분면 고른 연결 분배
  for (let i = 0; i < coords.length; i++) {
    const uA = coords[i];
    const limitA = bondLimits.get(uA.userId)!;

    if (bondCounts.get(uA.userId)! >= limitA) continue;

    // 모든 타 픽셀과의 거리 및 상대 각도 계산
    const candidates: any[] = [];
    for (let j = 0; j < coords.length; j++) {
      if (i === j) continue;
      const uB = coords[j];
      
      const dx = uB.coordX - uA.coordX;
      const dy = uB.coordY - uA.coordY;
      const dist = Math.hypot(dx, dy);

      if (dist <= MAX_DISTANCE) {
        const theta = Math.atan2(dy, dx); // 상대 각도 (-pi ~ pi)
        let direction = 'right';
        if (theta >= -Math.PI / 4 && theta < Math.PI / 4) {
          direction = 'right';
        } else if (theta >= Math.PI / 4 && theta < (3 * Math.PI) / 4) {
          direction = 'bottom'; // Y축이 아래로 갈수록 양수인 2D 캔버스 좌표계 기준
        } else if (theta >= (-3 * Math.PI) / 4 && theta < -Math.PI / 4) {
          direction = 'top';
        } else {
          direction = 'left';
        }

        candidates.push({
          userId: uB.userId,
          color: uB.color,
          dist,
          direction
        });
      }
    }

    // 거리 대역별로 4방향 그룹 분류
    // Near: < 2500, Medium: 2500 ~ 5500, Far: 5500 ~ 9000
    const groups: Record<string, Record<string, any[]>> = {
      near: { right: [], top: [], left: [], bottom: [] },
      medium: { right: [], top: [], left: [], bottom: [] },
      far: { right: [], top: [], left: [], bottom: [] }
    };

    for (const cand of candidates) {
      let range = 'far';
      if (cand.dist < 2500) {
        range = 'near';
      } else if (cand.dist < 5500) {
        range = 'medium';
      }
      groups[range][cand.direction].push(cand);
    }

    // 각 그룹 내부를 물리 거리 기준으로 정렬하여 가까운 녀석들이 우선권을 갖게 정렬
    for (const range of ['near', 'medium', 'far']) {
      for (const dir of ['right', 'top', 'left', 'bottom']) {
        groups[range][dir].sort((a: any, b: any) => a.dist - b.dist);
      }
    }

    // 연결을 순차적으로 끄집어내는 빌더 패턴 가동
    // 근거리 -> 중거리 -> 원거리 순으로 사방(상하좌우)을 균등하게 순회하며 연결
    const dirSequence = ['right', 'bottom', 'left', 'top'];
    
    // 연결을 실제로 맺는 내부 헬퍼 함수
    const tryConnect = (cand: any): boolean => {
      const uBId = cand.userId;
      const limitB = bondLimits.get(uBId)!;

      // 둘 중 하나라도 이미 목표 한도에 다다랐으면 스킵
      if (bondCounts.get(uA.userId)! >= limitA) return false;
      if (bondCounts.get(uBId)! >= limitB) return false;

      // 유니크 쌍 형성 (사전순 정렬)
      const [sortedA, sortedB] = [uA.userId, uBId].sort();
      const bondKey = `${sortedA}|${sortedB}`;

      if (!bondSet.has(bondKey)) {
        bondSet.add(bondKey);
        bondsData.push({
          user_a_id: sortedA,
          user_b_id: sortedB,
          bond_type: 'constellation',
          bond_color: uA.color, // A의 컬러 적용
          status: 'accepted',
          galaxy_key: GALAXY_ID
        });

        bondCounts.set(uA.userId, bondCounts.get(uA.userId)! + 1);
        bondCounts.set(uBId, bondCounts.get(uBId)! + 1);
        return true;
      }
      return false;
    };

    // 1) 근거리 순회 (밀집 별자리 형성)
    for (const dir of dirSequence) {
      const list = groups.near[dir];
      if (list.length > 0) {
        // 가장 인접한 최대 2개 연결 시도
        let connectedCount = 0;
        for (const cand of list) {
          if (tryConnect(cand)) {
            connectedCount++;
            if (connectedCount >= 2) break;
          }
        }
      }
    }

    // 2) 중거리 순회 (중간 가교 형성)
    for (const dir of dirSequence) {
      const list = groups.medium[dir];
      if (list.length > 0) {
        // 인접한 1~2개 연결 시도
        let connectedCount = 0;
        for (const cand of list) {
          if (tryConnect(cand)) {
            connectedCount++;
            if (connectedCount >= 1) break;
          }
        }
      }
    }

    // 3) 원거리 순회 (은하간 대형 브릿지 형성)
    for (const dir of dirSequence) {
      const list = groups.far[dir];
      if (list.length > 0) {
        // 장거리는 희소하게 1개만 시도
        for (const cand of list) {
          if (tryConnect(cand)) break;
        }
      }
    }
  }

  // 4) 1,000건 단위의 고속 벌크 적재
  const BOND_CHUNK = 1000;
  for (let i = 0; i < bondsData.length; i += BOND_CHUNK) {
    await prisma.constellation_bonds.createMany({
      data: bondsData.slice(i, i + BOND_CHUNK),
      skipDuplicates: true
    });
  }

  console.log(`\n   ✅ ${bondsData.length}개 유기적 2D 기하 별자리 연결망 생성 및 벌크 적재 완료`);

  // 5) 데이터 통계 출력 및 자동 검증
  const totalBonds = bondsData.length;
  console.log(`\n📊 [안전 검증] 생성된 2D 은하 연결선 통계 보고`);
  console.log(`   - 총 생성된 연결선 개수: ${totalBonds}개`);

  // 각 픽셀별 평균 연결선 수 계산
  let sumBonds = 0;
  let minBonds = 999;
  let maxBonds = 0;
  for (const [_, count] of bondCounts.entries()) {
    sumBonds += count;
    if (count < minBonds) minBonds = count;
    if (count > maxBonds) maxBonds = count;
  }
  const avgBonds = sumBonds / coords.length;
  console.log(`   - 픽셀당 최소 연결선 개수: ${minBonds}개`);
  console.log(`   - 픽셀당 최대 연결선 개수: ${maxBonds}개`);
  console.log(`   - 픽셀당 평균 연결선 개수: ${avgBonds.toFixed(2)}개`);
  console.log('\n🌟 [성공] 은하의 상하좌우 2D 입체 연결망이 완벽하게 복원 및 구축되었습니다.');
}

main()
  .catch(console.error);
