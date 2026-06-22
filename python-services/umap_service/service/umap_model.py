import umap
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import pickle
import os

class UMAPService:
    def __init__(self):
        # min_dist와 spread가 작을수록 데이터가 더욱 빽빽하게 뭉칩니다.
        # 활동성 점수가 전체 데이터 밀도에 영향을 줄 수 있도록 설정
        self.reducer = umap.UMAP(
            n_components=2,
            n_neighbors=15,          # 구조 보존
            min_dist=0.05,           # 클러스터 밀집도 상향 (원래 0.1)
            metric='euclidean',
            random_state=42,         # 재현 가능성
            spread=0.8,              # 전체 퍼짐 축소 (원래 1.0)
        )
        # 좌표 범위를 -100.0 ~ 100.0 으로 정규화
        self.scaler = MinMaxScaler(feature_range=(-100, 100))
        self._is_fitted = False
        self._load_or_initialize()

    def _load_or_initialize(self):
        """기존 모델 로드 또는 초기 앵커 강제 피팅 수행"""
        # [절대경로 변환] CronJob 등 CWD가 다른 환경에서도 모델 파일을 정확히 찾도록
        # 스크립트 자신의 위치 기준으로 절대경로를 구성합니다.
        _base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        model_path = os.path.join(_base_dir, 'models', 'umap_model.pkl')
        if os.path.exists(model_path):
            with open(model_path, 'rb') as f:
                self.reducer, self.scaler = pickle.load(f)
                self._is_fitted = True
            return

        print("기존 UMAP 모델이 없습니다. 16 MBTI 앵커 데이터로 초기 강제 피팅을 시작합니다...")
        import itertools
        from .vectorizer import create_static_vector, create_weighted_vector
        
        mbti_traits = [('E', 'I'), ('S', 'N'), ('T', 'F'), ('J', 'P')]
        anchor_data = []

        for combo in itertools.product(*mbti_traits):
            answers = {}
            # 극한 성향: 0 또는 100
            answers[1] = 0 if combo[0] == 'E' else 100
            answers[2] = 0 if combo[1] == 'S' else 100
            answers[3] = 0 if combo[2] == 'T' else 100
            answers[4] = 0 if combo[3] == 'J' else 100
            # 5번~10번 문항은 중립
            for i in range(5, 11):
                answers[i] = 50 
            
            sv = create_static_vector(answers)
            
            # 은하 외부(0점)부터 핵심 코어(1000점)까지 스케일 분산 학습
            for gs in [0, 300, 700, 1000]:
                anchor_data.append(create_weighted_vector(sv, gs))
        
        anchor_array = np.array(anchor_data)
        
        # UMAP 임베딩 축소 및 정규화기 학습
        embedding = self.reducer.fit_transform(anchor_array)
        self.scaler.fit(embedding)
        self._is_fitted = True
        
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        with open(model_path, 'wb') as f:
            pickle.dump((self.reducer, self.scaler), f)
        print("UMAP 피팅 완료. 새 모델이 저장되었습니다:", model_path)

    def calculate(self, final_vector: np.ndarray, glow_score: int) -> tuple[float, float, float]:
        """
        final_vector: vectorizer에서 생성한 10차원 가중합산 벡터
        glow_score: 사용자의 누적 활동 점수
        returns: (coord_x, coord_y, z_depth)
        """
        if not self._is_fitted:
            # MVP 초기: 더미 좌표 반환
            return float(np.random.uniform(-100, 100)), float(np.random.uniform(-100, 100)), 1.0

        # 1. UMAP 차원 축소
        embedding = self.reducer.transform([final_vector])
        
        # 2. 정규화 (-100 ~ 100)
        scaled = self.scaler.transform(embedding)
        coord_x, coord_y = float(scaled[0][0]), float(scaled[0][1])

        # 3. [핵심] 활동량(Glow Score)에 따른 Core Sinking (중심 밀착) 보정
        # 활동 점수가 높을수록 (1000점 만점 기준) 원점 (0,0)에 강제적으로 접근시킴.
        # 벡터 혼합만으로는 부족할 수 있는 '은하계 중심축 진입'을 직접 좌표 계산으로 구현.
        gravity_ratio = min(glow_score / 1000.0, 1.0)
        
        # [궤도 대역 알고리즘] 최소 궤도 반경 20% 보장 + 최대 중력 70%
        # 기존: pull_strength = 0.9 → 최소 10% 반경 (10만명 시 중앙 밀집 → GPU 과부하)
        # 개선: pull_strength = 0.7, orbit_ratio = max(0.2, ...) → 최소 20% 반경 보장
        MAX_PULL = 0.7
        MIN_ORBIT_RATIO = 0.2
        pull_strength = gravity_ratio * MAX_PULL
        orbit_ratio = max(MIN_ORBIT_RATIO, 1.0 - pull_strength)
        
        coord_x = coord_x * orbit_ratio
        coord_y = coord_y * orbit_ratio

        # 4. Z-Depth 계산 (Glow Score 연동)
        # 점수가 높을수록 크고 밝게 빛남 (Z축으로 가까이 튀어나옴)
        z_depth = self._calculate_z_depth(glow_score)

        return coord_x, coord_y, z_depth

    def _calculate_z_depth(self, glow_score: int) -> float:
        """
        활동성이 높을 수록 픽셀의 깊이감과 밝기를 줌 (최대 1.5)
        기본 깊이 1.0에서 활동 점수에 따라 50% 확대 (면적 2.25배).
        3.0x(면적 9배)에서 축소 — 이웃 픽셀 가림 현상 해소.
        """
        # score 0 -> 1.0
        # score 1000 -> 1.5
        depth = 1.0 + (glow_score / 1000.0) * 0.5
        return max(0.5, min(1.5, depth))

