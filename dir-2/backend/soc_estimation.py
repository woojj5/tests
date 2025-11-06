"""
SOC 추정 모듈 (FastAPI 통합용)
RevIN + GRU + UKF 기반 SOC 추정

논문 방식 요약:
- 데이터 기반 배터리 전압 모델(딥러닝) + GRU, 그리고 UKF로 SOC 추정
- RNN(특히 GRU)로 시간의존 동역학을 학습한 뒤, UKF로 SOC를 추정하는 구조
- 본 구현은 RevIN(분포 안정화)으로 강화한 RevIN+GRU+UKF 파이프라인

출처: KSAE 2021 추계학술대회 "인공지능기반 배터리 모델을 이용한 SOC 추정기 설계"
"""

import os
import time
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
import warnings
warnings.filterwarnings('ignore')

from sklearn.preprocessing import StandardScaler

try:
    from influxdb_client import InfluxDBClient, QueryApi
except ImportError:
    print("WARNING: influxdb-client not installed")


# ==================== 설정 ====================
@dataclass
class SOCConfig:
    """SOC 추정 설정"""
    # InfluxDB (환경 변수에서 가져옴)
    influxdb_url: str = os.getenv("INFLUXDB_URL", "")
    influxdb_token: str = os.getenv("INFLUXDB_TOKEN", "")
    influxdb_org: str = os.getenv("INFLUXDB_ORG", "")
    influxdb_bucket: str = os.getenv("INFLUXDB_BUCKET", "aicar_bms")
    
    # 필드명 (실제 InfluxDB 필드명)
    field_current: str = "pack_current"
    field_volt: str = "pack_volt"
    field_temp: str = "mod_avg_temp"
    field_soc: str = "soc"  # SOC 필드가 이미 있음!
    tag_device: str = "device_no"
    
    # 모델 파라미터
    seq_len: int = 64  # 속도 최적화: 128 -> 64
    hidden_size: int = 64  # 속도 최적화: 128 -> 64
    num_layers: int = 2
    dropout: float = 0.1  # 속도 최적화: 0.2 -> 0.1
    
    # UKF 파라미터
    capacity_ah: float = 72.0
    coulomb_eff: float = 0.995
    q_proc: float = 1e-6
    r_meas: float = 1e-3
    
    # 최적화
    batch_size: int = 32  # 속도 최적화: 64 -> 32
    use_cache: bool = True  # 데이터 캐싱
    cache_ttl: int = 300  # 캐시 TTL (초)


# ==================== RevIN ====================
class RevIN(nn.Module):
    """Reversible Instance Normalization"""
    def __init__(self, num_features: int, eps: float = 1e-5, affine: bool = True):
        super(RevIN, self).__init__()
        self.num_features = num_features
        self.eps = eps
        self.affine = affine
        
        if self.affine:
            self.gamma = nn.Parameter(torch.ones(num_features))
            self.beta = nn.Parameter(torch.zeros(num_features))
    
    def forward(self, x: torch.Tensor, mode: str = "norm") -> torch.Tensor:
        if mode == "norm":
            mean = x.mean(dim=1, keepdim=True)
            std = x.std(dim=1, keepdim=True) + self.eps
            x_norm = (x - mean) / std
            if self.affine:
                x_norm = x_norm * self.gamma + self.beta
            return x_norm
        else:
            raise ValueError(f"Unknown mode: {mode}")


# ==================== GRU 전압 모델 ====================
class GRUVoltageModel(nn.Module):
    """RevIN + GRU 기반 전압 예측 모델"""
    def __init__(
        self,
        input_size: int,
        hidden_size: int = 64,
        num_layers: int = 2,
        dropout: float = 0.1,
        use_revin: bool = True,
    ):
        super(GRUVoltageModel, self).__init__()
        self.use_revin = use_revin
        
        if use_revin:
            self.revin = RevIN(input_size, affine=True)
        
        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0,
            batch_first=True,
        )
        
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size // 2, 1),
        )
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if self.use_revin:
            x = self.revin(x, mode="norm")
        gru_out, _ = self.gru(x)
        last_hidden = gru_out[:, -1, :]
        voltage = self.fc(last_hidden)
        return voltage


# ==================== UKF ====================
class UnscentedKalmanFilter:
    """Unscented Kalman Filter for SOC estimation"""
    def __init__(
        self,
        dim_x: int = 1,
        dim_z: int = 1,
        q_proc: float = 1e-6,
        r_meas: float = 1e-3,
        alpha: float = 1e-3,
        beta: float = 2.0,
        kappa: float = 0.0,
    ):
        self.dim_x = dim_x
        self.dim_z = dim_z
        self.alpha = alpha
        self.beta = beta
        self.kappa = kappa
        self.lambda_ = alpha**2 * (dim_x + kappa) - dim_x
        self.n_sigma = 2 * dim_x + 1
        
        # 가중치
        self.Wm = np.zeros(self.n_sigma)
        self.Wc = np.zeros(self.n_sigma)
        self.Wm[0] = self.lambda_ / (dim_x + self.lambda_)
        self.Wc[0] = self.Wm[0] + (1 - alpha**2 + beta)
        for i in range(1, self.n_sigma):
            self.Wm[i] = 1.0 / (2 * (dim_x + self.lambda_))
            self.Wc[i] = self.Wm[i]
        
        self.Q = np.eye(dim_x) * q_proc
        self.R = np.eye(dim_z) * r_meas
        self.x = np.zeros(dim_x)
        self.P = np.eye(dim_x) * 0.1
    
    def predict(self, u: np.ndarray, dt: float, capacity_ah: float, coulomb_eff: float) -> Tuple[np.ndarray, np.ndarray]:
        current_A = u[0]
        sigma_points = self._compute_sigma_points(self.x, self.P)
        sigma_points_pred = np.zeros_like(sigma_points)
        
        for i in range(self.n_sigma):
            soc = sigma_points[i, 0]
            delta_soc = (coulomb_eff * current_A * dt) / (capacity_ah * 3600)
            soc_pred = np.clip(soc - delta_soc, 0.0, 1.0)
            sigma_points_pred[i, 0] = soc_pred
        
        x_pred = np.sum([self.Wm[i] * sigma_points_pred[i] for i in range(self.n_sigma)], axis=0)
        P_pred = self.Q.copy()
        for i in range(self.n_sigma):
            diff = sigma_points_pred[i] - x_pred
            P_pred += self.Wc[i] * np.outer(diff, diff)
        
        return x_pred, P_pred
    
    def update(self, z: np.ndarray, z_pred: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        x_pred = self.x
        P_pred = self.P
        sigma_points = self._compute_sigma_points(x_pred, P_pred)
        z_sigma = sigma_points
        
        z_pred_mean = np.sum([self.Wm[i] * z_sigma[i] for i in range(self.n_sigma)], axis=0)
        Pzz = self.R.copy()
        Pxz = np.zeros((self.dim_x, self.dim_z))
        
        for i in range(self.n_sigma):
            z_diff = z_sigma[i] - z_pred_mean
            Pzz += self.Wc[i] * np.outer(z_diff, z_diff)
            x_diff = sigma_points[i] - x_pred
            Pxz += self.Wc[i] * np.outer(x_diff, z_diff)
        
        K = Pxz @ np.linalg.inv(Pzz)
        residual = z - z_pred
        x_updated = x_pred + K @ residual
        x_updated[0] = np.clip(x_updated[0], 0.0, 1.0)
        P_updated = P_pred - K @ Pzz @ K.T
        P_updated = (P_updated + P_updated.T) / 2
        
        return x_updated, P_updated
    
    def _compute_sigma_points(self, x: np.ndarray, P: np.ndarray) -> np.ndarray:
        sigma_points = np.zeros((self.n_sigma, self.dim_x))
        sigma_points[0] = x
        
        try:
            L = np.linalg.cholesky((self.dim_x + self.lambda_) * P)
        except np.linalg.LinAlgError:
            P_stable = P + np.eye(self.dim_x) * 1e-8
            L = np.linalg.cholesky((self.dim_x + self.lambda_) * P_stable)
        
        for i in range(self.dim_x):
            sigma_points[i + 1] = x + L[:, i]
            sigma_points[i + 1 + self.dim_x] = x - L[:, i]
        
        return sigma_points


# ==================== 데이터 로더 (최적화) ====================
class InfluxDBLoader:
    """InfluxDB 데이터 로더 (캐싱 지원)"""
    def __init__(self, config: SOCConfig):
        self.config = config
        self.client = None
        self.query_api = None
        self._cache = {}  # 간단한 메모리 캐시
    
    def _get_client(self):
        """지연 초기화"""
        if self.client is None:
            self.client = InfluxDBClient(
                url=self.config.influxdb_url,
                token=self.config.influxdb_token,
                org=self.config.influxdb_org,
            )
            self.query_api = self.client.query_api()
        return self.query_api
    
    def load_data(
        self,
        device: Optional[str] = None,
        start: str = "-7d",
        stop: str = "now()",
        downsample: str = "5s",  # 다운샘플링으로 속도 향상
    ) -> pd.DataFrame:
        """데이터 로드 (캐싱 지원)"""
        cache_key = f"{device}_{start}_{stop}_{downsample}"
        
        # 캐시 확인
        if self.config.use_cache and cache_key in self._cache:
            cached_data, cached_time = self._cache[cache_key]
            if time.time() - cached_time < self.config.cache_ttl:
                print(f"[Cache] Using cached data for {device}")
                return cached_data.copy()
        
        print(f"[InfluxDB] Loading data: device={device}, start={start}, stop={stop}")
        
        query_api = self._get_client()
        
        # 최적화된 Flux 쿼리: 필요한 필드만, 다운샘플링
        query = f'''
        from(bucket: "{self.config.influxdb_bucket}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r["_measurement"] == "aicar_bms")
        '''
        
        if device:
            query += f'  |> filter(fn: (r) => r["{self.config.tag_device}"] == "{device}")'
        
        # 필요한 필드만 필터링 (속도 향상)
        query += f'''
          |> filter(fn: (r) => r["_field"] == "{self.config.field_current}" or 
                              r["_field"] == "{self.config.field_volt}" or 
                              r["_field"] == "{self.config.field_temp}" or
                              r["_field"] == "{self.config.field_soc}")
          |> aggregateWindow(every: {downsample}, fn: mean, createEmpty: false)
          |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> keep(columns: ["_time", "{self.config.field_current}", "{self.config.field_volt}", 
                            "{self.config.field_temp}", "{self.config.field_soc}"])
          |> sort(columns: ["_time"])
        '''
        
        try:
            result = query_api.query_data_frame(query)
            
            if result is None or len(result) == 0:
                raise ValueError("No data returned from InfluxDB")
            
            # 컬럼명 정리
            result = result.rename(columns={
                self.config.field_current: "current",
                self.config.field_volt: "voltage",
                self.config.field_temp: "temperature",
                self.config.field_soc: "soc",  # SOC 필드 사용!
            })
            
            # 결측치 제거
            result = result.dropna(subset=["current", "voltage", "temperature"])
            
            # 시간 인덱스
            if "_time" in result.columns:
                result["_time"] = pd.to_datetime(result["_time"])
                result = result.set_index("_time")
            
            # SOC가 없으면 NaN으로 유지 (나중에 처리)
            if "soc" not in result.columns:
                result["soc"] = np.nan
            
            print(f"[InfluxDB] Loaded {len(result)} samples")
            
            # 캐시 저장
            if self.config.use_cache:
                self._cache[cache_key] = (result.copy(), time.time())
            
            return result
        
        except Exception as e:
            print(f"[ERROR] Failed to load data: {e}")
            raise
    
    def close(self):
        if self.client:
            self.client.close()


# ==================== SOC 추정기 ====================
class SOCEstimator:
    """SOC 추정기 (모델 로드 및 추론)"""
    def __init__(self, config: SOCConfig, model_path: Optional[str] = None):
        self.config = config
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 모델 로드
        self.model = GRUVoltageModel(
            input_size=3,  # current, temperature, SOC
            hidden_size=config.hidden_size,
            num_layers=config.num_layers,
            dropout=config.dropout,
            use_revin=True,
        ).to(self.device)
        
        if model_path and os.path.exists(model_path):
            self.model.load_state_dict(torch.load(model_path, map_location=self.device))
            self.model.eval()
            print(f"[Model] Loaded from {model_path}")
        else:
            print("[WARNING] Model file not found, using untrained model")
        
        # 스케일러 (학습 시 저장된 것 사용, 없으면 기본값)
        self.scaler_current = StandardScaler()
        self.scaler_temp = StandardScaler()
        self.scaler_volt = StandardScaler()
        self.scaler_soc = StandardScaler()
        
        # UKF
        self.ukf = UnscentedKalmanFilter(
            dim_x=1,
            dim_z=1,
            q_proc=config.q_proc,
            r_meas=config.r_meas,
        )
    
    def estimate_soc(
        self,
        data: pd.DataFrame,
        use_label_soc: bool = False,  # 실제 SOC 라벨 사용 여부
    ) -> Dict:
        """
        SOC 추정 수행
        
        Returns:
            {
                "soc_estimates": np.ndarray,
                "voltage_predictions": np.ndarray,
                "voltage_actual": np.ndarray,
                "soc_labels": np.ndarray (if available),
                "metrics": dict,
            }
        """
        print(f"[SOC Estimation] Processing {len(data)} samples")
        
        # 데이터 준비
        current = data["current"].values
        voltage = data["voltage"].values
        temperature = data["temperature"].values
        soc_label = data["soc"].values if "soc" in data.columns and use_label_soc else None
        
        # 정규화
        current_scaled = self.scaler_current.fit_transform(current.reshape(-1, 1)).flatten()
        temp_scaled = self.scaler_temp.fit_transform(temperature.reshape(-1, 1)).flatten()
        volt_scaled = self.scaler_volt.fit_transform(voltage.reshape(-1, 1)).flatten()
        
        # SOC 초기화
        if soc_label is not None and not np.isnan(soc_label[0]):
            soc = soc_label / 100.0  # 0-100% -> 0-1
            self.ukf.x[0] = soc[0]
        else:
            soc = np.ones(len(data)) * 1.0
            self.ukf.x[0] = 1.0
        
        soc_scaled = self.scaler_soc.fit_transform(soc.reshape(-1, 1)).flatten()
        
        # 추론 루프 (배치 처리로 최적화)
        self.model.eval()
        soc_estimates = [self.ukf.x[0]]
        voltage_predictions = []
        voltage_actual = []
        
        seq_len = self.config.seq_len
        dt = (data.index[1] - data.index[0]).total_seconds() if len(data) > 1 else 1.0
        
        window_buffer = []
        batch_buffer = []  # 배치 처리용
        
        with torch.no_grad():
            for i in range(1, len(data)):
                features = np.array([
                    current_scaled[i],
                    temp_scaled[i],
                    soc_scaled[i-1],
                ])
                
                window_buffer.append(features)
                
                if len(window_buffer) < seq_len:
                    soc_estimates.append(soc_estimates[-1])
                    voltage_predictions.append(voltage[i])
                    voltage_actual.append(voltage[i])
                    continue
                
                if len(window_buffer) > seq_len:
                    window_buffer.pop(0)
                
                # 배치 버퍼에 추가
                batch_buffer.append(np.array(window_buffer))
                
                # 배치 크기만큼 모으면 한 번에 추론 (속도 향상)
                if len(batch_buffer) >= self.config.batch_size or i == len(data) - 1:
                    batch_tensor = torch.FloatTensor(np.array(batch_buffer)).to(self.device)
                    batch_preds = self.model(batch_tensor).cpu().numpy()
                    
                    # 배치 결과 처리
                    for j, (pred, buf_idx) in enumerate(zip(batch_preds, range(len(batch_buffer)))):
                        actual_idx = i - len(batch_buffer) + j + 1
                        if actual_idx >= len(data):
                            continue
                        
                        # UKF Predict
                        u = np.array([current[actual_idx]])
                        x_pred, P_pred = self.ukf.predict(u, dt, self.config.capacity_ah, self.config.coulomb_eff)
                        self.ukf.x = x_pred
                        self.ukf.P = P_pred
                        
                        # GRU 관측 예측
                        v_pred_scaled = pred[0, 0]
                        v_pred = self.scaler_volt.inverse_transform([[v_pred_scaled]])[0, 0]
                        voltage_predictions.append(v_pred)
                        voltage_actual.append(voltage[actual_idx])
                        
                        # UKF Update
                        z = np.array([voltage[actual_idx]])
                        z_pred = np.array([v_pred])
                        x_updated, P_updated = self.ukf.update(z, z_pred)
                        self.ukf.x = x_updated
                        self.ukf.P = P_updated
                        
                        soc_est = x_updated[0]
                        soc_estimates.append(soc_est)
                        soc_scaled[actual_idx] = self.scaler_soc.transform([[soc_est]])[0, 0]
                    
                    batch_buffer = []
        
        # 결과 정리
        soc_estimates = np.array(soc_estimates)
        voltage_predictions = np.array(voltage_predictions)
        voltage_actual = np.array(voltage_actual)
        
        # 지표 계산
        voltage_rmse = np.sqrt(np.mean((voltage_actual - voltage_predictions)**2))
        voltage_mae = np.mean(np.abs(voltage_actual - voltage_predictions))
        
        metrics = {
            "voltage_rmse": float(voltage_rmse),
            "voltage_mae": float(voltage_mae),
            "final_soc": float(soc_estimates[-1] * 100),
            "initial_soc": float(soc_estimates[0] * 100),
        }
        
        if soc_label is not None and use_label_soc:
            soc_label_clean = soc_label[~np.isnan(soc_label)] / 100.0
            if len(soc_label_clean) > 0:
                soc_est_clean = soc_estimates[:len(soc_label_clean)]
                soc_rmse = np.sqrt(np.mean((soc_label_clean - soc_est_clean)**2))
                soc_mae = np.mean(np.abs(soc_label_clean - soc_est_clean))
                metrics["soc_rmse"] = float(soc_rmse)
                metrics["soc_mae"] = float(soc_mae)
        
        return {
            "soc_estimates": soc_estimates,
            "voltage_predictions": voltage_predictions,
            "voltage_actual": voltage_actual,
            "soc_labels": soc_label / 100.0 if soc_label is not None else None,
            "metrics": metrics,
        }


# 전역 인스턴스 (FastAPI에서 재사용)
_estimator: Optional[SOCEstimator] = None
_loader: Optional[InfluxDBLoader] = None


def get_estimator(config: Optional[SOCConfig] = None) -> Optional[SOCEstimator]:
    """싱글톤 패턴으로 추정기 가져오기"""
    global _estimator
    if _estimator is None:
        try:
            if config is None:
                config = SOCConfig()
            model_path = os.getenv("SOC_MODEL_PATH", "models/gru_voltage.pt")
            _estimator = SOCEstimator(config, model_path)
            print(f"[SOC Estimator] Initialized successfully (model_path: {model_path})")
        except Exception as e:
            print(f"[SOC Estimator] Initialization failed: {e}")
            print(f"[SOC Estimator] Model path: {os.getenv('SOC_MODEL_PATH', 'models/gru_voltage.pt')}")
            print(f"[SOC Estimator] Model file exists: {os.path.exists(os.getenv('SOC_MODEL_PATH', 'models/gru_voltage.pt'))}")
            _estimator = None  # 실패 시 None 반환
    return _estimator


def get_loader(config: Optional[SOCConfig] = None) -> InfluxDBLoader:
    """싱글톤 패턴으로 로더 가져오기"""
    global _loader
    if _loader is None:
        if config is None:
            config = SOCConfig()
        _loader = InfluxDBLoader(config)
    return _loader

