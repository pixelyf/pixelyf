import numpy as np

# 10문 10답 축소 질문 매핑
QUESTION_AXIS_MAP = {
    1: "energy_ei",
    2: "perception_sn",
    3: "judgment_tf",
    4: "lifestyle_jp",
    5: "time_morning_night",
    6: "space_home_open",
    7: "consume_spend_save",
    8: "relation_depth_broad",
    9: "tone_calm_vibrant",
    10: "philosophy_yolo_future",
}

def create_static_vector(answers: dict) -> np.ndarray:
    """
    10문 10답 결과를 -1.0 ~ 1.0의 10차원 정적 벡터로 변환
    """
    vector = np.zeros(10)
    for q_no, axis in QUESTION_AXIS_MAP.items():
        raw = answers.get(q_no, 50)
        vector[q_no - 1] = (raw - 50) / 50.0
    return vector

def create_dynamic_vector(glow_score: int, max_glow_score: int = 1000) -> np.ndarray:
    """
    최근 활동 점수(glow_score)를 기반으로 10차원의 동적 벡터 생성.
    기본적으로 중심(Origin)으로 향하는 '인력(Gravity)'을 생성하기 위해 스칼라 값을 활용합니다.
    이 MVP 버전에선, 높은 활동량이 중심점(0,0,...)으로 벡터를 밀어넣는 역할을 하도록 구성합니다.
    """
    # 0.0(휴면) ~ 1.0(초활발) 구간 지정
    normalized_score = min(glow_score / max_glow_score, 1.0)
    
    # 10차원 모두 활동성을 반영하도록 설계 (단, 실제 UMAP spread 파라미터 제어가 더 핵심적인 역할)
    # 임베딩 벡터로서는 "모든 축에서 중심성을 띈다"는 의미로 0.0에 가까운 값을 반환할 수 있음
    # 여기서는 활동성 자체를 특성치로 만듭니다.
    vector = np.full(10, normalized_score)
    return vector

def create_weighted_vector(
    static_vector: np.ndarray,
    glow_score: int,
    static_weight: float = 0.6,
    dynamic_weight: float = 0.4,
) -> np.ndarray:
    """
    MBTI 정적 벡터와 활동량 기반 동적 벡터를 가중합산합니다.
    이 가중 합산된 벡터가 최종 UMAP 엔진에 입력되어 2D 좌표로 변환됩니다.
    """
    dynamic_vector = create_dynamic_vector(glow_score)
    
    # 활동량(glow_score)에 따라 중심(Origin)으로 끌어당기는 힘(Gravity) 계산.
    # 활동이 없는(0점) 유저는 100% MBTI 정향성을 띄어 외곽으로(원래 특징대로) 배치되고,
    # 활동이 극에 달한 유저는 특색이 옅어지고 '핵심 코어' 데이터로 모이게 됨.
    gravity_pull = min(glow_score / 1000.0, 1.0) * dynamic_weight
    real_static_weight = 1.0 - gravity_pull
    
    # 정적 벡터의 크기를 줄이고(중심으로 당김), 동적 벡터 특성을 더함
    final_vector = (static_vector * real_static_weight) + (dynamic_vector * gravity_pull)
    
    return final_vector
