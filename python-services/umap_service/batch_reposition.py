import os
import math
import random
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from supabase import create_client, Client
from service.vectorizer import create_weighted_vector, create_static_vector
from service.umap_model import UMAPService

# [09-플랜] 매장 픽셀 GGS(Galaxy Gravity Score) 함수
# [QA#2] 베이지안 상수 C=5.0, m=4.0은 이 함수에서만 관리 — 프론트엔드 중복 없음
# [QA#3] max(0,...) 가드로 DB 이상 데이터 시 ValueError 크래시 방지

def _calc_bayesian_rating(review_count: int, raw_avg: float) -> float:
    """베이지안 평활화 별점 계산 — StoreDetail.average_rating에 저장할 값
    
    리뷰 수가 적을 때는 플랫폼 평균(4.0)으로 회귀, 쌓일수록 실제 평점으로 수렴
    """
    C = 5.0  # 신뢰 리뷰수 가중치 (여기서만 관리)
    m = 4.0  # 플랫폼 평균 별점
    v = max(0, review_count or 0)   # [QA#3] 음수 방어 가드
    S = max(0.0, min(5.0, raw_avg or 0.0))  # 0.0~5.0 클램핑
    return (v * S + C * m) / (v + C)


def _calc_ggs(activity_score: int, average_rating: float, review_count: int) -> float:
    """Galaxy Gravity Score: 활동 점수에 베이지안 별점 가중치를 결합
    
    average_rating = _calc_bayesian_rating이 계산한 최종값 (상수 중복 없음)
    v = max(0, ...) 가드: math.log 음수 입력 크래시 방지
    """
    v = max(0, review_count or 0)  # [QA#3] math.log 음수 입력 방어 가드
    r = max(0.0, min(5.0, average_rating or 4.0))  # 1.0~5.0 클램핑
    return activity_score * ((r / 5.0) ** 2) * (1.0 + math.log(v + 1))

# batch_reposition.py의 상위 상위 디렉토리에서 apps/web/src/shared/lib/galaxy_geometry.json 로드
current_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(current_dir, "..", "..", "apps", "web", "src", "shared", "lib", "galaxy_geometry.json")

try:
    with open(json_path, "r", encoding="utf-8") as f:
        geometry_config = json.load(f)
except Exception as e:
    print(f"[ERROR] galaxy_geometry.json 로드 실패: {e}")
    # 예외 상황 시 하드코딩 폴백 마련
    geometry_config = {
        "ZONE_1_CHAMPION": {
            "limit_rank": 10,
            "radial_increment": 0.14,
            "angle_jitter": 0.01,
            "sigma": 0.08
        },
        "ZONE_2_INFLUENCER": {
            "limit_rank": 30,
            "radial_increment": 0.55,
            "angle_jitter": 0.04,
            "sigma": 0.30
        }
    }

z1_config = geometry_config["ZONE_1_CHAMPION"]
z2_config = geometry_config["ZONE_2_INFLUENCER"]
z3_config = geometry_config.get("ZONE_3_NEBULA_DENSE", {
    "limit_rank": 100,
    "radial_increment": 0.34,
    "angle_jitter": 0.08,
    "sigma": 0.075
})

# Supabase 연결 설정 (.env 설정값)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# 🎯 PINPOINT 핀셋 필터 범위 파싱
PINPOINT_RANGE = os.environ.get("PINPOINT_RANGE")  # 예: "31-100"
pinpoint_start = None
pinpoint_end = None
if PINPOINT_RANGE:
    try:
        parts = PINPOINT_RANGE.split("-")
        pinpoint_start = int(parts[0])
        pinpoint_end = int(parts[1])
        print(f"[PINPOINT FILTER] {pinpoint_start}위 ~ {pinpoint_end}위 핀셋 업데이트 기동 가동")
    except Exception as e:
        print(f"[PINPOINT ERROR] PINPOINT_RANGE 파싱 실패: {e}")

# ── 페이지네이션 상수 ──────────────────────────────────────────────────────────
# Supabase REST API는 기본 1,000행 제한이 있으므로, 이를 넘는 유저가 있을 때
# 누락 없이 전원을 처리하기 위해 반복 페치(Pagination)를 수행합니다.
PAGE_SIZE = 1000

# ── EMA 지수이동평균 보간 상수 ──────────────────────────────────────────────────
# 랭킹 요동 및 태양계 교체(Sun Swap) 시 좌표가 즉각 텔레포트하는 현상을 방지하고,
# 부드럽고 유기적인 이동 궤도를 생성하기 위한 지수 보간 계수입니다.
EMA_ALPHA = 0.35
CORE_SCALE_MULTIPLIER = 2.5


def _rank_to_zone(rank: int) -> int:
    """Rank를 6구간 Zone으로 변환 (SettingsAccountView.tsx, evolution API와 동기화)"""
    if rank <= 10: return 1
    elif rank <= 100: return 2
    elif rank <= 700: return 3
    elif rank <= 2000: return 4
    elif rank <= 5000: return 5
    else: return 6


def _ema_interpolate(target_val, old_val, alpha=EMA_ALPHA):
    """
    목표 좌표(target_val)와 이전 배치 좌표(old_val) 간의 지수이동평균(EMA)을 계산합니다.
    이전 좌표가 없는 경우(신규 유저 등)나 FORCE_OVERWRITE 환경변수가 true인 경우에는 목표 좌표를 그대로 반환합니다.
    """
    force_overwrite = os.environ.get("FORCE_OVERWRITE", "false").lower() == "true"
    if old_val is None or force_overwrite:
        return target_val
    return alpha * target_val + (1 - alpha) * old_val


import time

def _run_parallel_tasks(task_fn, items, chunk_size=500, max_workers=10):
    """
    대량의 아이템 리스트를 chunk_size 단위로 분할하여,
    ThreadPoolExecutor를 통해 멀티스레드로 동시 병렬 실행합니다.
    청크 실행 실패 시 지수 백오프 기반 최대 2회 재시도(Retry with backoff)를 가동하여 네트워크 유실을 차단합니다.
    """
    chunks = [items[i:i + chunk_size] for i in range(0, len(items), chunk_size)]
    results = []
    
    def _task_with_retry(chunk):
        last_err = None
        for attempt in range(1, 4):
            try:
                return task_fn(chunk)
            except Exception as e:
                last_err = e
                if attempt < 3:
                    sleep_sec = attempt * 2
                    print(f"[RETRY WARNING] 청크 실행 실패, {sleep_sec}초 후 {attempt}차 재시도: {e}")
                    time.sleep(sleep_sec)
        print(f"[PARALLEL CRITICAL] 청크 최종 실패 (3회 시도): {last_err}")
        raise last_err

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_chunk = {executor.submit(_task_with_retry, chunk): chunk for chunk in chunks}
        for future in as_completed(future_to_chunk):
            try:
                data = future.result()
                if data:
                    if isinstance(data, list):
                        results.extend(data)
                    else:
                        results.append(data)
            except Exception as e:
                pass # 이미 _task_with_retry 내에서 최종 에러 로그 출력됨
    return results


def _fetch_all_users(supabase: Client) -> list:
    """
    [페이지네이션] Supabase의 1,000행 제한을 우회하여 전체 유저 목록을 가져옵니다.
    [은하별 독립 배치 확장] 파트너 코드 필터를 전면 제거하여, 모든 유저를 안전하게 수집해 UMAP Baseline 연산에 참여시킵니다.
    """
    offset = 0
    raw_users = []

    # 1. users 순수 테이블 페이징 조회 (조인 없음 - 극도로 빠름)
    while True:
        response = supabase.table('users') \
            .select('id, activity_score') \
            .eq('is_shadow_banned', False) \
            .range(offset, offset + PAGE_SIZE - 1) \
            .execute()

        batch = response.data or []
        raw_users.extend(batch)

        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return raw_users


def _safe_score(value, default=50):
    """
    [NULL 안전 변환] DB에서 가져온 persona 점수가 None이면 기본값(중립 50)을 반환합니다.
    주의: `or` 연산자를 쓰면 정상적인 0점(극단 E 성향)이 50으로 변조되므로 반드시 `is not None` 체크를 합니다.
    """
    return value if value is not None else default


def run_batch_reposition():
    print("=== 시작: 일간 UMAP 다이내믹 좌표 재배치 ===")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("에러: Supabase 환경 변수가 설정되지 않았습니다.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    skip_mbti = os.environ.get("SKIP_MBTI", "false").lower() == "true"

    # ── [Phase 1] 전체 유저 페이지네이션 조회 (경량 메타데이터만) ─────────────
    users = _fetch_all_users(supabase)
    
    if not users:
        print("대상 유저가 없습니다.")
        return

    if not skip_mbti:
        umap_service = UMAPService()
        print(f"총 {len(users)} 명의 UMAP 좌표 재계산을 시작합니다.")

        # [Phase 2] 개별 유저 벡터 계산 (MBTI 은하) ─────────────────────────────
        # [P-08 OPTIMIZATION] 기존 좌표 사전 로드 (멀티스레드 병렬화로 Latency 1/10 감축)
        existing_coords_map = {}
        mbti_user_ids = [u['id'] for u in users]
        
        def _fetch_existing_coords_chunk(chunk_ids):
            coord_resp = supabase.table('user_coordinates') \
                .select('id, user_id, coord_x, coord_y, z_depth') \
                .in_('user_id', chunk_ids) \
                .eq('galaxy_key', 'MBTI') \
                .execute()
            return coord_resp.data or []
            
        existing_coords_list = _run_parallel_tasks(_fetch_existing_coords_chunk, mbti_user_ids, chunk_size=80, max_workers=10)
        for c in existing_coords_list:
            existing_coords_map[c['user_id']] = c
        print(f"[Phase 2 사전 로드] 기존 좌표 {len(existing_coords_map)}건 로드 완료 (병렬 처리)")

        # [JIT 페르소나 조회] 페르소나 데이터 멀티스레드 병렬 사전 로드 (OOM 및 API Latency 동시 해결)
        personas_map = {}
        def _fetch_personas_chunk(chunk_ids):
            resp = supabase.table('user_personas') \
                .select('user_id, score_e_i, score_s_n, score_t_f, score_j_p, score_morning_night, score_home_open, score_spend_save, score_depth_broad, score_calm_vibrant, score_yolo_future') \
                .in_('user_id', chunk_ids) \
                .execute()
            return resp.data or []
            
        personas_list = _run_parallel_tasks(_fetch_personas_chunk, mbti_user_ids, chunk_size=80, max_workers=10)
        for p in personas_list:
            personas_map[p['user_id']] = p
        print(f"[Phase 2 페르소나 로드] 페르소나 {len(personas_map)}건 로드 완료 (병렬 처리)")

        success_count = 0
        error_count = 0
        skipped_count = 0
        updates_buffer = []
        DELTA_THRESHOLD = 1.0

        # [EVOLUTION] Phase 2 유저를 activity_score 내림차순 정렬하여 rank 부여
        users_sorted = sorted(users, key=lambda u: (u.get('activity_score') or 0), reverse=True)
        user_rank_map = {u['id']: rank for rank, u in enumerate(users_sorted, start=1)}

        for u in users:
            user_id = u['id']

            try:
                glow_score = u.get('activity_score') or 0
                
                # [JIT 데이터 매핑] 사전 로드된 페르소나 맵에서 취득
                persona_data = personas_map.get(user_id)
                if not persona_data:
                    continue  # 페르소나 정보가 없으면 UMAP 연산 제외 (소정 봇 등)
                    
                # DB 컬럼을 10문 10답 dictionary 포맷으로 변환
                # [NULL 안전 변환] 점수가 NULL이면 중립(50)으로 폴백하여 크래시 방지
                answers = {
                    1: _safe_score(persona_data.get('score_e_i')),
                    2: _safe_score(persona_data.get('score_s_n')),
                    3: _safe_score(persona_data.get('score_t_f')),
                    4: _safe_score(persona_data.get('score_j_p')),
                    5: _safe_score(persona_data.get('score_morning_night')),
                    6: _safe_score(persona_data.get('score_home_open')),
                    7: _safe_score(persona_data.get('score_spend_save')),
                    8: _safe_score(persona_data.get('score_depth_broad')),
                    9: _safe_score(persona_data.get('score_calm_vibrant')),
                    10: _safe_score(persona_data.get('score_yolo_future')),
                }
                
                # 정적 벡터 생성 및 동적 가중합산
                static_vector = create_static_vector(answers)
                weighted_vector = create_weighted_vector(
                    static_vector=static_vector,
                    glow_score=glow_score,
                    static_weight=0.6,
                    dynamic_weight=0.4
                )
                
                # UMAP을 이용한 베이스 2D 좌표 산출 및 Z-Depth 부여
                base_x, base_y, final_z = umap_service.calculate(
                    final_vector=weighted_vector, 
                    glow_score=glow_score
                )
                
                # [유기적 궤도 대역 산란] - MBTI 성향(방향)은 유지하되 부채꼴 형태로 노이즈 부여
                # user_id를 시드로 사용하여 매 배치마다 픽셀 좌표가 무작위로 텔레포트하는 버그 차단
                user_rand = random.Random(user_id)
                current_radius = math.hypot(base_x, base_y)
                current_angle = math.atan2(base_y, base_x)
                
                # 각도: ±0.35 라디안 (약 ±20도) 랜덤 흩뿌림 (포도송이 클러스터 형성)
                noise_angle = current_angle + user_rand.uniform(-0.35, 0.35)
                # 거리: 85% ~ 115% 대역폭 궤도에 배치하여 자연스러운 볼륨감 형성
                noise_radius = current_radius * user_rand.uniform(0.85, 1.15)
                
                target_x = noise_radius * math.cos(noise_angle)
                target_y = noise_radius * math.sin(noise_angle)
                target_z = final_z
                
                # [EMA 지수 보간 필터 적용]
                old_coord = existing_coords_map.get(user_id, {})
                old_x = old_coord.get('coord_x')
                old_y = old_coord.get('coord_y')
                old_z = old_coord.get('z_depth')
                
                final_x = _ema_interpolate(target_x, old_x)
                final_y = _ema_interpolate(target_y, old_y)
                final_z = _ema_interpolate(target_z, old_z)
                
                # 델타 계산 시 이전 좌표가 없을 경우(None)를 대비하여 폴백 처리
                delta_x = abs(final_x - (old_x if old_x is not None else 0.0))
                delta_y = abs(final_y - (old_y if old_y is not None else 0.0))
                delta_z = abs(final_z - (old_z if old_z is not None else 1.0))
                
                if delta_x > DELTA_THRESHOLD or delta_y > DELTA_THRESHOLD or delta_z > 0.05:
                    update_payload = {
                        'user_id': user_id,
                        'galaxy_key': 'MBTI', # Baseline UMAP 고유 격리 키 지정 (PIXELYF 은하 오염 원천 차단)
                        'coord_x': float(final_x),
                        'coord_y': float(final_y),
                        'z_depth': float(final_z),
                        'static_vector': static_vector.tolist(),
                        'dynamic_vector': weighted_vector.tolist(),
                        'rank': user_rank_map.get(user_id, len(users)),
                    }
                    if old_coord and old_coord.get('id'):
                        update_payload['id'] = old_coord.get('id')
                    else:
                        import uuid
                        update_payload['id'] = str(uuid.uuid4())
                    updates_buffer.append(update_payload)
                    success_count += 1
                else:
                    skipped_count += 1

                if (success_count + skipped_count) <= 5 or (success_count + skipped_count) % 1000 == 0:
                    action = "변동" if (delta_x > DELTA_THRESHOLD or delta_y > DELTA_THRESHOLD or delta_z > 0.05) else "스킵"
                    print(f"[{user_id[:8]}] {action}: X={final_x:.2f}, Y={final_y:.2f}, Z={final_z:.2f} (Glow={glow_score})")

            except Exception as e:
                error_count += 1
                print(f"[ERROR] 유저 {user_id} 처리 실패: {e}")
                continue  # 한 명의 에러가 전체 배치를 중단시키지 않도록 보호

        # [P-08 OPTIMIZATION] Bulk Upsert (1000건씩 일괄 업데이트)
        # 1,000건 Upsert 실패 시 대량 데이터 유실을 방어하기 위해 100건 단위 소청크로 분할하여 복원을 시도하는 격리적 복원 회로 탑재.
        print(f"\n[Phase 2 Delta Update] 전체 중 {len(updates_buffer)}명 변동 / {skipped_count}명 스킵 / {error_count}명 에러")
        chunk_size = 1000
        bulk_success = 0
        for i in range(0, len(updates_buffer), chunk_size):
            chunk = updates_buffer[i:i + chunk_size]
            try:
                supabase.table('user_coordinates').upsert(chunk).execute()
                bulk_success += len(chunk)
                print(f"[Phase 2 Bulk Upsert] {i + len(chunk)} / {len(updates_buffer)} 완료")
            except Exception as e:
                print(f"[RECOVER WARNING] Phase 2 Bulk Upsert 1,000건 청크 실패 ({i}~{i+len(chunk)}): {e}. 100건 소청크 분할 적재 복원을 시작합니다.")
                sub_chunk_size = 100
                for j in range(0, len(chunk), sub_chunk_size):
                    sub_chunk = chunk[j:j + sub_chunk_size]
                    try:
                        supabase.table('user_coordinates').upsert(sub_chunk).execute()
                        bulk_success += len(sub_chunk)
                    except Exception as sub_e:
                        error_count += len(sub_chunk)
                        print(f"[RECOVER CRITICAL] Phase 2 소청크 Upsert 실패 ({i+j}~{i+j+len(sub_chunk)}): {sub_e}")

        print(f"\n--- MBTI 은하 처리 완료: 업데이트 {bulk_success} / 스킵 {skipped_count} / 실패 {error_count} ---")
    else:
        print("[SKIP MBTI] MBTI 은하 UMAP 계산 및 UMAPService 로딩을 스킵합니다. (피클 호환 에러 우회)")

    # ── [Phase 5] 은하별 독립 7구간 중력 재배치 ───────────────────────────────
    # [동적 은하 로드] 데이터베이스의 galaxies 테이블을 직접 조회하여 활성화된 모든 은하 목록과 중심 좌표를 동적으로 가져옵니다.
    galaxies_resp = supabase.table('galaxies').select('key, center_x, center_y, partner_code').eq('is_active', True).execute()
    db_galaxies = galaxies_resp.data or []
    
    if not db_galaxies:
        print("에러: 활성화된 은하 정보가 데이터베이스에 존재하지 않습니다.")
        return
        
    galaxy_keys = [g['key'] for g in db_galaxies]
    print(f"[동적 은하] 활성화된 은하 목록 취득 성공: {galaxy_keys}")
    
    # ── [DB 정규화] 실제 은하 중심 좌표 동적 매핑 ──────
    ACTIVE_GALAXIES = [
        {'id': g['key'], 'x': g['center_x'] or 0.0, 'y': g['center_y'] or 0.0, 'partner_code': g['partner_code']} 
        for g in db_galaxies
    ]

    # [페이지네이션] Supabase 1,000행 제한 우회
    # 데이터베이스에서 활성화된 모든 은하(galaxy_keys)에 속해 있는 전체 유저 좌표 데이터를 쿼리합니다.
    galaxy_users = []
    galaxy_offset = 0
    while True:
        galaxy_response = supabase.table('user_coordinates') \
            .select('id, user_id, galaxy_key, coord_x, coord_y, z_depth') \
            .in_('galaxy_key', galaxy_keys) \
            .range(galaxy_offset, galaxy_offset + PAGE_SIZE - 1) \
            .execute()
        batch = galaxy_response.data or []
        galaxy_users.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        galaxy_offset += PAGE_SIZE

    if galaxy_users:
        print(f"\n=== 은하별 독립 7구간 중력 재배치 시작 (대상: {len(galaxy_users)} 명) ===")
        
        # [N+1 쿼리 최적화] 개별 쿼리 대신 500건씩 청크로 벌크 병렬 조회하여 성능 최적화
        galaxy_user_ids = [su['user_id'] for su in galaxy_users]
        users_map = {}
        
        def _fetch_galaxy_users_chunk(chunk_ids):
            chunk_resp = supabase.table('users') \
                .select('id, activity_score, is_store, created_at, user_personas(id, persona_code), store_details(review_count, average_rating)') \
                .in_('id', chunk_ids) \
                .execute()
            return chunk_resp.data or []
        galaxy_users_details = _run_parallel_tasks(_fetch_galaxy_users_chunk, galaxy_user_ids, chunk_size=80, max_workers=10)
        for ud in galaxy_users_details:
            users_map[ud['id']] = ud
        
        galaxy_success = 0
        galaxy_skip = 0
        galaxy_error = 0
        
        # ───────── [새로운 군집 로직 (Honeycomb & Scatter)] ─────────
        # 1. 대상 유저를 은하별로 그룹화 및 활동지수 기반 정렬 (Tiering)
        grouped_by_galaxy = { g['id']: [] for g in ACTIVE_GALAXIES }
        
        for su in galaxy_users:
            user_id = su['user_id']
            user_data = users_map.get(user_id)
            if not user_data: continue
            
            personas = user_data.get('user_personas') or []
            if isinstance(personas, list) and len(personas) > 0:
                persona_code = personas[0].get('persona_code', 'STARTER')
            elif isinstance(personas, dict):
                persona_code = personas.get('persona_code', 'STARTER')
            else:
                persona_code = 'STARTER'
            
            galaxy_key = su.get('galaxy_key')
            if not galaxy_key or galaxy_key not in grouped_by_galaxy:
                continue
                
            glow_score = user_data.get('activity_score') or 0
            
            # [09-플랜] 매장 픽셀에 한해 GGS 적용
            is_store_val = user_data.get('is_store', False)
            if is_store_val:
                store_detail_raw = user_data.get('store_details') or {}
                store_detail = store_detail_raw[0] if isinstance(store_detail_raw, list) else store_detail_raw
                review_count = max(0, (store_detail or {}).get('review_count', 0))  # [QA#3] 가드
                average_rating = (store_detail or {}).get('average_rating', 4.0)
                glow_score = _calc_ggs(activity_score=glow_score, average_rating=average_rating, review_count=review_count)
            
            grouped_by_galaxy[galaxy_key].append({
                'id': su.get('id'),
                'user_id': user_id,
                'glow_score': glow_score,
                'persona_code': persona_code,
                'created_at': user_data.get('created_at'),
                'old_x': su.get('coord_x', 0.0) or 0.0,
                'old_y': su.get('coord_y', 0.0) or 0.0,
                'old_z': su.get('z_depth', 1.0) or 1.0
            })
            
        updates_buffer = []
        # [로컬 챔피언 태양계] 4대 성향 매핑 테이블
        TEMPERAMENTS = {
            'INTJ': 'NT', 'INTP': 'NT', 'ENTJ': 'NT', 'ENTP': 'NT',
            'INFJ': 'NF', 'INFP': 'NF', 'ENFJ': 'NF', 'ENFP': 'NF',
            'ISTJ': 'SJ', 'ISFJ': 'SJ', 'ESTJ': 'SJ', 'ESFJ': 'SJ',
            'ISTP': 'SP', 'ISFP': 'SP', 'ESTP': 'SP', 'ESFP': 'SP',
        }

        for g in ACTIVE_GALAXIES:
            g_id = g['id']
            
            # [기하학적 은하별 고유성 부여] 은하 Key(g_id)를 시드로 하여 고유 회전각 오프셋 및 고유 반경 스케일 배율 배정
            galaxy_rand = random.Random(g_id)
            galaxy_angle_offset = galaxy_rand.uniform(0, 2 * math.pi)
            galaxy_scale = galaxy_rand.uniform(0.85, 1.15)
            
            # [One in, One out] 활동지수 내림차순 정렬. 동점자는 가입 일시(created_at) 과거 순(선착순)으로 정렬하여 촘촘한 정박 보장
            # 1단계: 가입 일시 오름차순(과거 순) 정렬
            sorted_users = sorted(grouped_by_galaxy[g_id], key=lambda x: x['created_at'] or '')
            # 2단계: 활동지수 내림차순(역순) 정렬 (파이썬의 안정 정렬로 인해 가입순서 유지)
            sorted_users = sorted(sorted_users, key=lambda x: x['glow_score'], reverse=True)
            
            # 은하별 로컬 챔피언 상태 머신 초기화 (은하 간 독립 보장)
            group_counters = { 'NT': 0, 'NF': 0, 'SJ': 0, 'SP': 0 }
            active_anchors = { 'NT': None, 'NF': None, 'SJ': None, 'SP': None }
            anchor_members = { 'NT': 0, 'NF': 0, 'SJ': 0, 'SP': 0 }
            
            previous_radius = 0.0
            z1_end_radius = 0.0  # Zone 1 최종 반경 고정 저장용
            z2_end_radius = 0.0  # Zone 2 최종 반경 고정 저장용
            z3_end_radius = 0.0  # Zone 3 최종 반경 고정 저장용
            
            for rank, u in enumerate(sorted_users, start=1):
                user_id = u['user_id']
                coord_id = u.get('id')
                glow_score = u['glow_score']
                persona = u.get('persona_code', 'STARTER')
                user_rand = random.Random(user_id)
                
                # ── 황금각 슬롯 시스템 (Rank-based Slot) ──
                if rank == 1:
                    # 구간 1 [Safe]: 최상위 1위는 정중앙을 100% 영구 고정 점유 (난수 오차 배제)
                    orbit_x = 0.0
                    orbit_y = 0.0
                    previous_radius = 0.0
                elif rank <= z1_config["limit_rank"]:
                    # ── [1구간: 절대 영점 초밀집 완화 코어 (Rank 2 ~ 10)] ──
                    base_radius = z1_config["radial_increment"] * rank
                    theta = rank * 2.39996 + galaxy_angle_offset
                    sigma = z1_config["sigma"]
                    r_noise = user_rand.gauss(0, sigma)
                    radius = max(previous_radius + z1_config["radial_increment"], base_radius + r_noise)
                    previous_radius = radius
                    if rank == z1_config["limit_rank"]:
                        z1_end_radius = radius  # Zone 1 최종 반경 고정 저장
                    theta = theta + user_rand.gauss(0, z1_config["angle_jitter"])
                    orbit_x = radius * math.cos(theta)
                    orbit_y = radius * math.sin(theta)
                elif rank <= z2_config["limit_rank"]:
                    # ── [2구간: 인플루언서 완화 성단 고리 (Rank 11 ~ 50)] ──
                    base_radius = previous_radius + z2_config["radial_increment"]
                    theta = rank * 2.39996 + galaxy_angle_offset
                    sigma = z2_config["sigma"]
                    r_noise = user_rand.gauss(0, sigma)
                    radius = max(previous_radius + z2_config["radial_increment"], base_radius + r_noise)
                    previous_radius = radius
                    if rank == z2_config["limit_rank"]:
                        z2_end_radius = radius  # Zone 2 최종 반경 고정 저장
                    theta = theta + user_rand.gauss(0, z2_config["angle_jitter"])
                    orbit_x = radius * math.cos(theta)
                    orbit_y = radius * math.sin(theta)
                elif rank <= z3_config["limit_rank"]:
                    # ── [3구간 (NEW): 초밀집 안쪽 성운 (Rank 51 ~ 100)] ──
                    # [PERFORMANCE FIX] z2_end_radius 고정 앵커를 기준으로 선형적으로 0.34씩 증가시켜 지수 팽창 버그를 원천 격리 차단합니다.
                    base_radius = z2_end_radius + z3_config["radial_increment"] * (rank - z2_config["limit_rank"])
                    theta = rank * 2.39996 + galaxy_angle_offset
                    sigma = z3_config["sigma"]
                    r_noise = user_rand.gauss(0, sigma)
                    
                    distortion = 1.0 + 0.35 * math.sin(5.0 * theta)
                    radius = max(previous_radius + z3_config["radial_increment"], (base_radius * distortion) + r_noise)
                    previous_radius = radius
                    if rank == z3_config["limit_rank"]:
                        z3_end_radius = radius  # Zone 3 최종 반경 고정 저장
                    
                    theta = theta + user_rand.gauss(0, z3_config["angle_jitter"])
                    orbit_x = radius * math.cos(theta)
                    orbit_y = radius * math.sin(theta)
                else:
                    # ── [외곽 우주 성운 구역 (Outer Nebula Zone, Rank 101 이상)] ──
                    theta = rank * 2.39996 + galaxy_angle_offset
                    distortion = 1.0 + 0.35 * math.sin(5.0 * theta)
                    
                    if rank <= 700:
                        # ── [4구간 (NEW): 미디엄 성운 구역 (Rank 301 ~ 700)] ──
                        # [PERFORMANCE FIX] z3_end_radius 고정 앵커를 기준으로 0.68씩 선형 증가시켜 3구간과의 궤도 공백 단절을 완벽하게 차단합니다.
                        base_radius_nebula = z3_end_radius + 0.68 * (rank - z3_config["limit_rank"])
                        organic_min_radius = (2.5 * galaxy_scale) * math.sqrt(rank)
                        base_radius = max(base_radius_nebula, organic_min_radius)
                        sigma = max(1.0, base_radius * 0.15)
                    else:
                        R700 = 339.1
                        R2000 = math.sqrt(R700 * R700 + (35 * 35 / math.pi) * 1300) # 700위부터 2000위까지 1300명 누적
                        R5000 = math.sqrt(R2000 * R2000 + (50 * 50 / math.pi) * 3000) # 2000위부터 5000위까지 3000명 누적
                        R50000 = math.sqrt(R5000 * R5000 + (35 * 35 / math.pi) * 45000)
                        
                        if rank <= 2000:
                            # ── [5구간: 중간 성운 (Rank 701 ~ 2000)] ──
                            base_radius = math.sqrt(R700 * R700 + (35 * 35 / math.pi) * (rank - 700))
                            sigma = 15.0
                        elif rank <= 5000:
                            # ── [6구간: 대기 확산 (Rank 2001 ~ 5000)] ──
                            base_radius = math.sqrt(R2000 * R2000 + (50 * 50 / math.pi) * (rank - 2000))
                            sigma = 35.0
                        elif rank <= 50000:
                            # ── [7구간: 최외곽 확장 (Rank 5001 ~ 50000)] ──
                            base_radius = math.sqrt(R5000 * R5000 + (35 * 35 / math.pi) * (rank - 5000))
                            sigma = 30.0
                        else:
                            # ── [8구간: 심우주 이탈 (Rank 50001 이상)] ──
                            base_radius = math.sqrt(R50000 * R50000 + (25 * 25 / math.pi) * (rank - 50000))
                            sigma = 30.0
                    
                    theta = theta + user_rand.gauss(0, 0.18) # 3구간 이후 2.2배 대폭 상향 통일!
                    r_noise = user_rand.gauss(0, sigma)
                    radius = max(previous_radius + 1.0, (base_radius * distortion) + r_noise)
                    
                    previous_radius = max(previous_radius, radius)
                    
                    orbit_x = radius * math.cos(theta)
                    orbit_y = radius * math.sin(theta)
                
                # 최종 우주 절대 좌표 목표값 (Base Target Position)
                target_x = g['x'] + orbit_x
                target_y = g['y'] + orbit_y
                
                # ── [로컬 챔피언 태양계 군집 로직] ──
                group = TEMPERAMENTS.get(persona)
                if group and rank > 500:
                    pos = group_counters[group] % 40
                    
                    if pos == 0:
                        # [태양(Sun) 각성]
                        max_planets = (sum(ord(c) for c in user_id) % 8) + 2
                        active_anchors[group] = {'x': target_x, 'y': target_y, 'max_planets': max_planets}
                        anchor_members[group] = 0
                    else:
                        # [위성(Planet) 포획 시도]
                        anchor = active_anchors[group]
                        if anchor and anchor_members[group] < anchor['max_planets']:
                            anchor_members[group] += 1
                            sub_rank = anchor_members[group]
                            sub_theta = sub_rank * 2.39996
                            sub_radius = 2.0
                            
                            # 태양 위성 궤도로 목표값 치환
                            target_x = anchor['x'] + sub_radius * math.cos(sub_theta)
                            target_y = anchor['y'] + sub_radius * math.sin(sub_theta)
                    
                    group_counters[group] += 1
                
                # Z-Depth 목표값
                target_z = max(0.5, min(1.5, 1.0 + (glow_score / 1000.0) * 0.5))
                
                # [EMA 지수 보간 필터 적용 (태양계 텔레포트 및 랭킹 스왑 워프 완벽 방지)]
                final_x = _ema_interpolate(target_x, u['old_x'])
                final_y = _ema_interpolate(target_y, u['old_y'])
                final_z = _ema_interpolate(target_z, u['old_z'])
                
                # [PERFORMANCE FIX] 델타 업데이트 (Delta Update)
                delta_x = abs(final_x - u['old_x'])
                delta_y = abs(final_y - u['old_y'])
                delta_z = abs(final_z - u['old_z'])
                
                # [DELTA BYPASS] 100명 이하 소규모 은하의 경우 델타 임계값을 우회하여 100% 강제 갱신 (Baseline UMAP 오염 오버라이트 차단)
                if len(sorted_users) <= 100 or delta_x > 1.0 or delta_y > 1.0 or delta_z > 0.05:
                    # 🎯 PINPOINT 핀셋 필터 적용 (지정된 등수 범위 이외의 유저는 갱신 스킵)
                    if pinpoint_start is not None and pinpoint_end is not None:
                        if not (pinpoint_start <= rank <= pinpoint_end):
                            continue

                    # [비즈니스 격리 수칙] 이전 레거시 코드를 완전 소거하고
                    # 은하 ID에 부합하는 파트너 코드를 정교하게 격리 할당합니다.
                    final_partner_code = g.get('partner_code')
                    updates_buffer.append({
                        'id': coord_id,
                        'user_id': user_id,
                        'galaxy_key': g_id,
                        'coord_x': float(final_x),
                        'coord_y': float(final_y),
                        'z_depth': float(final_z),
                        'partner_code': final_partner_code,
                        'rank': rank,
                    })

        # [PERFORMANCE FIX] Bulk Upsert (일괄 업데이트)
        # 1,000건 Upsert 실패 시 대량 데이터 유실을 방어하기 위해 100건 단위 소청크로 분할하여 복원을 시도하는 격리적 복원 회로 탑재.
        print(f"\n[Delta Update] 전체 유저 중 {len(updates_buffer)} 명의 위치 변동 감지됨.")
        
        chunk_size = 1000
        for i in range(0, len(updates_buffer), chunk_size):
            chunk = updates_buffer[i:i + chunk_size]
            try:
                supabase.table('user_coordinates').upsert(chunk).execute()
                galaxy_success += len(chunk)
                print(f"[Bulk Upsert] {i + len(chunk)} / {len(updates_buffer)} 완료")
            except Exception as e:
                print(f"[RECOVER WARNING] Phase 5 Bulk Upsert 1,000건 청크 실패 ({i}~{i+len(chunk)}): {e}. 100건 소청크 분할 적재 복원을 시작합니다.")
                sub_chunk_size = 100
                for j in range(0, len(chunk), sub_chunk_size):
                    sub_chunk = chunk[j:j + sub_chunk_size]
                    try:
                        supabase.table('user_coordinates').upsert(sub_chunk).execute()
                        galaxy_success += len(sub_chunk)
                    except Exception as sub_e:
                        galaxy_error += len(sub_chunk)
                        print(f"[RECOVER CRITICAL] Phase 5 소청크 Upsert 실패 ({i+j}~{i+j+len(sub_chunk)}): {sub_e}")
        
        print(f"=== 은하 재배치 완료: 성공 {galaxy_success} / 스킵 {len(galaxy_users) - len(updates_buffer)} / 실패 {galaxy_error} ===")

    print("\n=== 완료: 좌표 재배치 성공 ===")

    # ── [Phase 6] 좌표 히스토리 스냅샷 저장 ────────────────────────────────────
    print("\n=== Phase 6: 좌표 히스토리 스냅샷 저장 ===")
    try:
        from datetime import date
        today = date.today().isoformat()
        
        # 전체 좌표 조회 (히스토리 저장용)
        all_coords = []
        coord_offset = 0
        while True:
            coord_resp = supabase.table('user_coordinates') \
                .select('user_id, galaxy_key, coord_x, coord_y, z_depth, rank') \
                .range(coord_offset, coord_offset + PAGE_SIZE - 1) \
                .execute()
            batch = coord_resp.data or []
            all_coords.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            coord_offset += PAGE_SIZE
        
        # 히스토리 레코드 조립
        history_records = []
        user_score_map = {u['id']: (u.get('activity_score') or 0) for u in users}
        
        for c in all_coords:
            uid = c.get('user_id')
            r = c.get('rank')
            if not uid or r is None:
                continue
            
            history_records.append({
                'user_id': uid,
                'galaxy_key': c.get('galaxy_key'),
                'coord_x': c.get('coord_x', 0),
                'coord_y': c.get('coord_y', 0),
                'z_depth': c.get('z_depth', 1.0),
                'rank': r,
                'zone': _rank_to_zone(r),
                'activity_score': user_score_map.get(uid, 0),
                'snapshot_date': today,
            })
        
        # Bulk Upsert (날짜 중복 시 덮어쓰기)
        history_chunk_size = 500
        history_success = 0
        for i in range(0, len(history_records), history_chunk_size):
            chunk = history_records[i:i + history_chunk_size]
            try:
                supabase.table('coordinate_history').upsert(
                    chunk, 
                    on_conflict='user_id,galaxy_key,snapshot_date'
                ).execute()
                history_success += len(chunk)
            except Exception as e:
                print(f"[WARNING] History upsert 실패 ({i}~{i+history_chunk_size}): {e}")
        
        print(f"[Phase 6] 히스토리 스냅샷 {history_success} / {len(history_records)}건 저장 완료")
        
        # 90일 이전 데이터 정리
        try:
            supabase.rpc('cleanup_old_coordinate_history').execute()
            print("[Phase 6] 90일 이전 히스토리 정리 완료")
        except Exception as e:
            print(f"[Phase 6] 히스토리 정리 스킵 (함수 미존재 가능): {e}")
    
    except Exception as e:
        print(f"[WARNING] Phase 6 히스토리 스냅샷 실패 (비치명적 — 좌표 재배치 성공에 영향 없음): {e}")

    print("\n=== 전체 배치 처리 완료 ===")

if __name__ == "__main__":
    run_batch_reposition()
