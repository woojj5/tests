#!/usr/bin/env python3
"""
인공지능기반 배터리 모델을 이용한 SOC 추정기 설계

논문 방식 요약:
- 데이터 기반 배터리 전압 모델(딥러닝) + GRU, 그리고 UKF로 SOC 추정
- RNN(특히 GRU)로 시간의존 동역학을 학습한 뒤, UKF로 SOC를 추정하는 구조
- 본 구현은 RevIN(분포 안정화)으로 강화한 RevIN+GRU+UKF 파이프라인

출처: KSAE 2021 추계학술대회 "인공지능기반 배터리 모델을 이용한 SOC 추정기 설계"

구조:
- GRU는 전압(관측) 모델을 학습 (RevIN으로 입력 정규화)
- UKF는 상태(SOC) 추정을 담당
- GRU가 SOC를 직접 회귀하는 것이 아니라, 전압을 예측하고 UKF가 이를 관측으로 사용하여 SOC 추정
"""

import os
import sys
import argparse
import json
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # GUI 없이 사용

try:
    from influxdb_client import InfluxDBClient, QueryApi
    from influxdb_client.client.write_api import SYNCHRONOUS
except ImportError:
    print("ERROR: influxdb-client not installed. Install with: pip install influxdb-client")
    sys.exit(1)

# 시드 고정
torch.manual_seed(42)
np.random.seed(42)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(42)


# ==================== 설정 클래스 ====================
@dataclass
class Config:
    """하이퍼파라미터 및 설정"""
    # InfluxDB
    influxdb_url: str
    influxdb_token: str
    influxdb_org: str
    influxdb_bucket: str
    
    # 필드/태그명
    field_current: str = "pack_current"
    field_volt: str = "pack_volt"
    field_temp: str = "mod_avg_temp"
    tag_device: str = "device_no"
    device_value: Optional[str] = None
    
    # 시간 범위
    start: str = "-30d"
    stop: str = "now()"
    
    # 모델 하이퍼파라미터
    seq_len: int = 128
    hidden_size: int = 128
    num_layers: int = 2
    dropout: float = 0.2
    epochs: int = 50
    batch_size: int = 64
    learning_rate: float = 1e-3
    
    # UKF 파라미터
    capacity_ah: float = 72.0  # 배터리 용량 (Ah)
    coulomb_eff: float = 0.995  # 콜롬 효율
    q_proc: float = 1e-6  # 공정 잡음 공분산
    r_meas: float = 1e-3  # 관측 잡음 공분산
    extra_states: bool = False  # 추가 상태 변수 (RC 전압 등)
    
    # 기타
    use_pseudo_soc: bool = False  # 콜롬 카운팅으로 pseudo-SOC 생성
    val_split: float = 0.2  # 검증 데이터 비율
    num_workers: int = 4
    pin_memory: bool = True
    
    # 출력 경로
    model_dir: Path = Path("models")
    plot_dir: Path = Path("plots")
    metrics_file: Path = Path("metrics.json")


# ==================== RevIN 구현 ====================
class RevIN(nn.Module):
    """
    Reversible Instance Normalization
    입력 특성별(feature-wise) 표준화/역변환, 학습가능 gamma/beta
    """
    def __init__(self, num_features: int, eps: float = 1e-5, affine: bool = True):
        super(RevIN, self).__init__()
        self.num_features = num_features
        self.eps = eps
        self.affine = affine
        
        if self.affine:
            self.gamma = nn.Parameter(torch.ones(num_features))
            self.beta = nn.Parameter(torch.zeros(num_features))
    
    def forward(self, x: torch.Tensor, mode: str = "norm") -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, num_features)
            mode: "norm" (정규화) or "denorm" (역변환)
        """
        if mode == "norm":
            # 인스턴스별 평균/표준편차 계산
            mean = x.mean(dim=1, keepdim=True)  # (batch, 1, num_features)
            std = x.std(dim=1, keepdim=True) + self.eps  # (batch, 1, num_features)
            
            x_norm = (x - mean) / std
            
            if self.affine:
                x_norm = x_norm * self.gamma + self.beta
            
            return x_norm
        
        elif mode == "denorm":
            # 역변환 (학습 시에는 사용 안 함, 필요시 구현)
            if self.affine:
                x = (x - self.beta) / (self.gamma + self.eps)
            return x
        else:
            raise ValueError(f"Unknown mode: {mode}")


# ==================== GRU 전압 모델 ====================
class GRUVoltageModel(nn.Module):
    """
    RevIN + GRU 기반 전압 예측 모델
    입력: (current, temperature, SOC) 또는 (current, voltage_prev, temperature, SOC)
    출력: 다음 스텝의 단자전압 V_k
    """
    def __init__(
        self,
        input_size: int,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.2,
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
        """
        Args:
            x: (batch, seq_len, input_size)
        Returns:
            voltage: (batch, 1)
        """
        if self.use_revin:
            x = self.revin(x, mode="norm")
        
        # GRU forward
        gru_out, _ = self.gru(x)  # (batch, seq_len, hidden_size)
        
        # 마지막 타임스텝만 사용
        last_hidden = gru_out[:, -1, :]  # (batch, hidden_size)
        
        # 전압 예측
        voltage = self.fc(last_hidden)  # (batch, 1)
        
        return voltage


# ==================== UKF 구현 ====================
class UnscentedKalmanFilter:
    """
    Unscented Kalman Filter for SOC estimation
    상태: [SOC] 또는 [SOC, V_rc1, V_rc2, ...] (extra_states=True)
    """
    def __init__(
        self,
        dim_x: int = 1,  # 상태 차원 (SOC만: 1)
        dim_z: int = 1,  # 관측 차원 (전압: 1)
        q_proc: float = 1e-6,
        r_meas: float = 1e-3,
        alpha: float = 1e-3,
        beta: float = 2.0,
        kappa: float = 0.0,
    ):
        self.dim_x = dim_x
        self.dim_z = dim_z
        
        # UKF 파라미터
        self.alpha = alpha
        self.beta = beta
        self.kappa = kappa
        self.lambda_ = alpha**2 * (dim_x + kappa) - dim_x
        
        # 시그마 포인트 개수
        self.n_sigma = 2 * dim_x + 1
        
        # 가중치 계산
        self.Wm = np.zeros(self.n_sigma)
        self.Wc = np.zeros(self.n_sigma)
        
        self.Wm[0] = self.lambda_ / (dim_x + self.lambda_)
        self.Wc[0] = self.Wm[0] + (1 - alpha**2 + beta)
        
        for i in range(1, self.n_sigma):
            self.Wm[i] = 1.0 / (2 * (dim_x + self.lambda_))
            self.Wc[i] = self.Wm[i]
        
        # 공분산 행렬
        self.Q = np.eye(dim_x) * q_proc  # 공정 잡음
        self.R = np.eye(dim_z) * r_meas  # 관측 잡음
        
        # 초기 상태
        self.x = np.zeros(dim_x)  # 상태 벡터
        self.P = np.eye(dim_x) * 0.1  # 상태 공분산
    
    def predict(self, u: np.ndarray, dt: float, capacity_ah: float, coulomb_eff: float) -> Tuple[np.ndarray, np.ndarray]:
        """
        공정 모델: 콜롬 카운팅
        SOC_{k+1} = SOC_k - (η * I_k * Δt) / C
        
        Args:
            u: 입력 벡터 [current_A]
            dt: 시간 간격 (초)
            capacity_ah: 배터리 용량 (Ah)
            coulomb_eff: 콜롬 효율
        
        Returns:
            x_pred: 예측 상태
            P_pred: 예측 공분산
        """
        current_A = u[0]  # 전류 (A)
        
        # 시그마 포인트 생성
        sigma_points = self._compute_sigma_points(self.x, self.P)
        
        # 시그마 포인트를 공정 모델에 통과
        sigma_points_pred = np.zeros_like(sigma_points)
        for i in range(self.n_sigma):
            soc = sigma_points[i, 0]
            # 콜롬 카운팅
            delta_soc = (coulomb_eff * current_A * dt) / (capacity_ah * 3600)  # Ah -> As 변환
            soc_pred = soc - delta_soc
            soc_pred = np.clip(soc_pred, 0.0, 1.0)  # SOC는 0~1 사이
            sigma_points_pred[i, 0] = soc_pred
        
        # 예측 상태 및 공분산 계산
        x_pred = np.zeros(self.dim_x)
        for i in range(self.n_sigma):
            x_pred += self.Wm[i] * sigma_points_pred[i]
        
        P_pred = self.Q.copy()
        for i in range(self.n_sigma):
            diff = sigma_points_pred[i] - x_pred
            P_pred += self.Wc[i] * np.outer(diff, diff)
        
        return x_pred, P_pred
    
    def update(self, z: np.ndarray, z_pred: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        관측 업데이트
        
        Args:
            z: 실제 관측값 (전압)
            z_pred: 예측 관측값 (GRU가 예측한 전압)
        
        Returns:
            x_updated: 업데이트된 상태
            P_updated: 업데이트된 공분산
        """
        # 예측 상태 및 공분산 (이미 predict에서 계산됨)
        x_pred = self.x
        P_pred = self.P
        
        # 시그마 포인트 생성
        sigma_points = self._compute_sigma_points(x_pred, P_pred)
        
        # 관측 공간으로 변환 (여기서는 전압이 직접 관측이므로 identity)
        z_sigma = sigma_points  # (n_sigma, dim_z)
        
        # 예측 관측값 및 공분산
        z_pred_mean = np.zeros(self.dim_z)
        for i in range(self.n_sigma):
            z_pred_mean += self.Wm[i] * z_sigma[i]
        
        Pzz = self.R.copy()
        Pxz = np.zeros((self.dim_x, self.dim_z))
        
        for i in range(self.n_sigma):
            z_diff = z_sigma[i] - z_pred_mean
            Pzz += self.Wc[i] * np.outer(z_diff, z_diff)
            
            x_diff = sigma_points[i] - x_pred
            Pxz += self.Wc[i] * np.outer(x_diff, z_diff)
        
        # 칼만 gain
        K = Pxz @ np.linalg.inv(Pzz)
        
        # 잔차 (실제 전압 - GRU 예측 전압)
        residual = z - z_pred
        
        # 상태 업데이트
        x_updated = x_pred + K @ residual
        x_updated[0] = np.clip(x_updated[0], 0.0, 1.0)  # SOC 클리핑
        
        # 공분산 업데이트
        P_updated = P_pred - K @ Pzz @ K.T
        
        # 수치 안정성: 대칭성 보장
        P_updated = (P_updated + P_updated.T) / 2
        
        return x_updated, P_updated
    
    def _compute_sigma_points(self, x: np.ndarray, P: np.ndarray) -> np.ndarray:
        """시그마 포인트 계산"""
        sigma_points = np.zeros((self.n_sigma, self.dim_x))
        sigma_points[0] = x
        
        # Cholesky 분해
        try:
            L = np.linalg.cholesky((self.dim_x + self.lambda_) * P)
        except np.linalg.LinAlgError:
            # 수치 안정성: P에 작은 대각 항 추가
            P_stable = P + np.eye(self.dim_x) * 1e-8
            L = np.linalg.cholesky((self.dim_x + self.lambda_) * P_stable)
        
        for i in range(self.dim_x):
            sigma_points[i + 1] = x + L[:, i]
            sigma_points[i + 1 + self.dim_x] = x - L[:, i]
        
        return sigma_points


# ==================== 데이터셋 ====================
class VoltageDataset(Dataset):
    """전압 예측을 위한 시계열 데이터셋"""
    def __init__(
        self,
        data: np.ndarray,
        target: np.ndarray,
        seq_len: int,
        feature_indices: List[int],
    ):
        """
        Args:
            data: (N, F) 전체 데이터
            target: (N,) 타깃 전압
            seq_len: 시퀀스 길이
            feature_indices: 사용할 피처 인덱스 [current_idx, temp_idx, soc_idx, ...]
        """
        self.data = data
        self.target = target
        self.seq_len = seq_len
        self.feature_indices = feature_indices
        
        # 슬라이딩 윈도우 생성
        self.sequences = []
        self.targets = []
        
        for i in range(len(data) - seq_len):
            seq = data[i:i+seq_len, feature_indices]  # (seq_len, num_features)
            tgt = target[i+seq_len-1]  # 마지막 타임스텝의 전압
            self.sequences.append(seq)
            self.targets.append(tgt)
        
        self.sequences = np.array(self.sequences)
        self.targets = np.array(self.targets)
    
    def __len__(self):
        return len(self.sequences)
    
    def __getitem__(self, idx):
        return (
            torch.FloatTensor(self.sequences[idx]),
            torch.FloatTensor([self.targets[idx]]),
        )


# ==================== InfluxDB 데이터 로더 ====================
class InfluxDBLoader:
    """InfluxDB 2.x에서 데이터 직접 로드"""
    def __init__(self, config: Config):
        self.config = config
        self.client = InfluxDBClient(
            url=config.influxdb_url,
            token=config.influxdb_token,
            org=config.influxdb_org,
        )
        self.query_api = self.client.query_api()
    
    def load_data(self) -> pd.DataFrame:
        """Flux 쿼리로 데이터 로드"""
        print(f"[InfluxDB] Loading data from bucket: {self.config.influxdb_bucket}")
        print(f"  Device: {self.config.device_value}")
        print(f"  Time range: {self.config.start} to {self.config.stop}")
        
        # Flux 쿼리 구성
        query = f'''
        from(bucket: "{self.config.influxdb_bucket}")
          |> range(start: {self.config.start}, stop: {self.config.stop})
          |> filter(fn: (r) => r["_measurement"] == "aicar_bms")
        '''
        
        if self.config.device_value:
            query += f'  |> filter(fn: (r) => r["{self.config.tag_device}"] == "{self.config.device_value}")'
        
        query += f'''
          |> filter(fn: (r) => r["_field"] == "{self.config.field_current}" or 
                              r["_field"] == "{self.config.field_volt}" or 
                              r["_field"] == "{self.config.field_temp}")
          |> aggregateWindow(every: 5s, fn: mean, createEmpty: false)
          |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> keep(columns: ["_time", "{self.config.field_current}", "{self.config.field_volt}", "{self.config.field_temp}"])
          |> sort(columns: ["_time"])
        '''
        
        try:
            result = self.query_api.query_data_frame(query)
            
            if result is None or len(result) == 0:
                raise ValueError("No data returned from InfluxDB")
            
            # 컬럼명 정리
            result = result.rename(columns={
                self.config.field_current: "current",
                self.config.field_volt: "voltage",
                self.config.field_temp: "temperature",
            })
            
            # 결측치 제거
            result = result.dropna(subset=["current", "voltage", "temperature"])
            
            # 시간 인덱스
            if "_time" in result.columns:
                result["_time"] = pd.to_datetime(result["_time"])
                result = result.set_index("_time")
            
            print(f"[InfluxDB] Loaded {len(result)} samples")
            print(f"  Columns: {result.columns.tolist()}")
            print(f"  Time range: {result.index[0]} to {result.index[-1]}")
            
            return result
        
        except Exception as e:
            print(f"[ERROR] Failed to load data from InfluxDB: {e}")
            raise
    
    def close(self):
        """연결 종료"""
        self.client.close()


# ==================== 학습 함수 ====================
def train_model(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    config: Config,
    device: torch.device,
) -> Dict:
    """모델 학습"""
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=config.learning_rate)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='min', factor=0.5, patience=5, verbose=True
    )
    
    best_val_loss = float('inf')
    train_losses = []
    val_losses = []
    
    print(f"\n[Training] Starting training on {device}")
    print(f"  Epochs: {config.epochs}")
    print(f"  Batch size: {config.batch_size}")
    print(f"  Learning rate: {config.learning_rate}")
    
    for epoch in range(config.epochs):
        # 학습
        model.train()
        train_loss = 0.0
        for batch_x, batch_y in train_loader:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            
            optimizer.zero_grad()
            pred = model(batch_x)
            loss = criterion(pred, batch_y)
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
        
        train_loss /= len(train_loader)
        train_losses.append(train_loss)
        
        # 검증
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x = batch_x.to(device)
                batch_y = batch_y.to(device)
                
                pred = model(batch_x)
                loss = criterion(pred, batch_y)
                val_loss += loss.item()
        
        val_loss /= len(val_loader)
        val_losses.append(val_loss)
        
        scheduler.step(val_loss)
        
        # 최적 모델 저장
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            config.model_dir.mkdir(parents=True, exist_ok=True)
            torch.save(model.state_dict(), config.model_dir / "gru_voltage.pt")
            print(f"  [Epoch {epoch+1}/{config.epochs}] Train Loss: {train_loss:.6f}, Val Loss: {val_loss:.6f} *")
        else:
            print(f"  [Epoch {epoch+1}/{config.epochs}] Train Loss: {train_loss:.6f}, Val Loss: {val_loss:.6f}")
        
        # 조기 종료 (간단 버전)
        if epoch > 10 and val_loss > best_val_loss * 1.5:
            print("  Early stopping triggered")
            break
    
    return {
        "train_losses": train_losses,
        "val_losses": val_losses,
        "best_val_loss": best_val_loss,
    }


# ==================== 추론 함수 ====================
def run_ukf_inference(
    model: nn.Module,
    data: pd.DataFrame,
    config: Config,
    device: torch.device,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    UKF × GRU 결합 추론 루프
    
    Returns:
        soc_estimates: 추정된 SOC 시계열
        voltage_predictions: GRU 예측 전압
        voltage_actual: 실제 전압
    """
    print("\n[Inference] Running UKF + GRU inference...")
    
    # 데이터 준비
    current = data["current"].values
    voltage = data["voltage"].values
    temperature = data["temperature"].values
    
    # SOC 초기화 (pseudo-SOC 또는 콜롬 카운팅)
    if config.use_pseudo_soc:
        # 콜롬 카운팅으로 pseudo-SOC 생성
        soc = np.zeros(len(data))
        soc[0] = 1.0  # 초기 SOC = 100%
        dt = (data.index[1] - data.index[0]).total_seconds()
        
        for i in range(1, len(data)):
            delta_soc = (config.coulomb_eff * current[i-1] * dt) / (config.capacity_ah * 3600)
            soc[i] = soc[i-1] - delta_soc
            soc[i] = np.clip(soc[i], 0.0, 1.0)
    else:
        # SOC가 데이터에 없으면 초기값 1.0 사용
        soc = np.ones(len(data)) * 1.0
    
    # 정규화 (학습 시와 동일한 스케일러 필요)
    # 여기서는 간단히 사용 (실제로는 학습 시 스케일러 저장/로드 필요)
    scaler_current = StandardScaler()
    scaler_temp = StandardScaler()
    scaler_soc = StandardScaler()
    
    current_scaled = scaler_current.fit_transform(current.reshape(-1, 1)).flatten()
    temp_scaled = scaler_temp.fit_transform(temperature.reshape(-1, 1)).flatten()
    soc_scaled = scaler_soc.fit_transform(soc.reshape(-1, 1)).flatten()
    
    # UKF 초기화
    ukf = UnscentedKalmanFilter(
        dim_x=1,
        dim_z=1,
        q_proc=config.q_proc,
        r_meas=config.r_meas,
    )
    ukf.x[0] = soc[0]  # 초기 SOC
    
    # 추론 루프
    model.eval()
    soc_estimates = [soc[0]]
    voltage_predictions = []
    voltage_actual = []
    
    seq_len = config.seq_len
    dt = (data.index[1] - data.index[0]).total_seconds() if len(data) > 1 else 1.0
    
    # 슬라이딩 윈도우 버퍼
    window_buffer = []
    
    with torch.no_grad():
        for i in range(1, len(data)):
            # 입력 피처: [current, temperature, SOC]
            features = np.array([
                current_scaled[i],
                temp_scaled[i],
                soc_scaled[i-1],  # 이전 SOC 사용
            ])
            
            window_buffer.append(features)
            
            if len(window_buffer) < seq_len:
                # 초기 윈도우 채우기
                soc_estimates.append(soc_estimates[-1])
                voltage_predictions.append(voltage[i])
                voltage_actual.append(voltage[i])
                continue
            
            # 윈도우 유지
            if len(window_buffer) > seq_len:
                window_buffer.pop(0)
            
            # UKF Predict
            u = np.array([current[i]])  # 입력: 전류
            x_pred, P_pred = ukf.predict(u, dt, config.capacity_ah, config.coulomb_eff)
            ukf.x = x_pred
            ukf.P = P_pred
            
            # GRU 관측 예측
            window_tensor = torch.FloatTensor(np.array(window_buffer)).unsqueeze(0).to(device)
            v_pred = model(window_tensor).cpu().numpy()[0, 0]
            voltage_predictions.append(v_pred)
            voltage_actual.append(voltage[i])
            
            # UKF Update
            z = np.array([voltage[i]])  # 실제 전압
            z_pred = np.array([v_pred])  # GRU 예측 전압
            x_updated, P_updated = ukf.update(z, z_pred)
            ukf.x = x_updated
            ukf.P = P_updated
            
            # SOC 업데이트
            soc_est = x_updated[0]
            soc_estimates.append(soc_est)
            
            # 다음 스텝을 위한 SOC 업데이트
            soc_scaled[i] = scaler_soc.transform([[soc_est]])[0, 0]
    
    return (
        np.array(soc_estimates),
        np.array(voltage_predictions),
        np.array(voltage_actual),
    )


# ==================== 시각화 ====================
def plot_results(
    voltage_actual: np.ndarray,
    voltage_pred: np.ndarray,
    soc_estimates: np.ndarray,
    config: Config,
    soc_labels: Optional[np.ndarray] = None,
):
    """결과 시각화"""
    config.plot_dir.mkdir(parents=True, exist_ok=True)
    
    # 플롯 ①: 실측 전압 vs GRU 예측 전압
    plt.figure(figsize=(12, 6))
    plt.plot(voltage_actual, label="Actual Voltage", alpha=0.7)
    plt.plot(voltage_pred, label="GRU Predicted Voltage", alpha=0.7)
    plt.xlabel("Time Step")
    plt.ylabel("Voltage (V)")
    plt.title("Voltage Prediction: Actual vs GRU")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(config.plot_dir / "voltage_pred_vs_true.png", dpi=150)
    plt.close()
    
    # 플롯 ②: UKF 추정 SOC vs (있다면) 실측/라벨 SOC
    plt.figure(figsize=(12, 6))
    plt.plot(soc_estimates * 100, label="UKF Estimated SOC (%)", alpha=0.7)
    if soc_labels is not None:
        plt.plot(soc_labels * 100, label="Label SOC (%)", alpha=0.7)
    plt.xlabel("Time Step")
    plt.ylabel("SOC (%)")
    plt.title("SOC Estimation: UKF vs Label")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(config.plot_dir / "soc_ukf_est.png", dpi=150)
    plt.close()
    
    # 플롯 ③: 잔차 히스토그램
    residuals = voltage_actual - voltage_pred
    plt.figure(figsize=(10, 6))
    plt.hist(residuals, bins=50, alpha=0.7, edgecolor='black')
    plt.xlabel("Residual (Actual - Predicted Voltage)")
    plt.ylabel("Frequency")
    plt.title("Voltage Prediction Residual Histogram")
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(config.plot_dir / "residual_histogram.png", dpi=150)
    plt.close()
    
    print(f"[Plot] Saved plots to {config.plot_dir}")


# ==================== 메인 함수 ====================
def main():
    parser = argparse.ArgumentParser(description="RevIN+GRU+UKF SOC Estimation")
    
    # InfluxDB 설정
    parser.add_argument("--influxdb-url", type=str, default=os.getenv("INFLUXDB_URL"))
    parser.add_argument("--influxdb-token", type=str, default=os.getenv("INFLUXDB_TOKEN"))
    parser.add_argument("--influxdb-org", type=str, default=os.getenv("INFLUXDB_ORG"))
    parser.add_argument("--influxdb-bucket", type=str, default=os.getenv("INFLUXDB_BUCKET"))
    
    # 필드/태그
    parser.add_argument("--current", type=str, default="pack_current")
    parser.add_argument("--volt", type=str, default="pack_volt")
    parser.add_argument("--temp", type=str, default="mod_avg_temp")
    parser.add_argument("--device-tag", type=str, default="device_no")
    parser.add_argument("--device", type=str, default=None)
    
    # 시간 범위
    parser.add_argument("--start", type=str, default="-30d")
    parser.add_argument("--stop", type=str, default="now()")
    
    # 모델 하이퍼파라미터
    parser.add_argument("--seq-len", type=int, default=128)
    parser.add_argument("--hidden", type=int, default=128)
    parser.add_argument("--layers", type=int, default=2)
    parser.add_argument("--dropout", type=float, default=0.2)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    
    # UKF 파라미터
    parser.add_argument("--capacity-ah", type=float, default=72.0)
    parser.add_argument("--coulomb-eff", type=float, default=0.995)
    parser.add_argument("--q-proc", type=float, default=1e-6)
    parser.add_argument("--r-meas", type=float, default=1e-3)
    parser.add_argument("--extra-states", action="store_true")
    
    # 기타
    parser.add_argument("--use-pseudo-soc", action="store_true")
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--num-workers", type=int, default=4)
    
    args = parser.parse_args()
    
    # Config 생성
    config = Config(
        influxdb_url=args.influxdb_url or "",
        influxdb_token=args.influxdb_token or "",
        influxdb_org=args.influxdb_org or "",
        influxdb_bucket=args.influxdb_bucket or "",
        field_current=args.current,
        field_volt=args.volt,
        field_temp=args.temp,
        tag_device=args.device_tag,
        device_value=args.device,
        start=args.start,
        stop=args.stop,
        seq_len=args.seq_len,
        hidden_size=args.hidden,
        num_layers=args.layers,
        dropout=args.dropout,
        epochs=args.epochs,
        batch_size=args.batch,
        learning_rate=args.lr,
        capacity_ah=args.capacity_ah,
        coulomb_eff=args.coulomb_eff,
        q_proc=args.q_proc,
        r_meas=args.r_meas,
        extra_states=args.extra_states,
        use_pseudo_soc=args.use_pseudo_soc,
        val_split=args.val_split,
        num_workers=args.num_workers,
    )
    
    # 필수 파라미터 확인
    if not all([config.influxdb_url, config.influxdb_token, config.influxdb_org, config.influxdb_bucket]):
        print("ERROR: InfluxDB credentials required (--influxdb-url, --influxdb-token, --influxdb-org, --influxdb-bucket)")
        sys.exit(1)
    
    # 디바이스 설정
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Device] Using {device}")
    
    # 데이터 로드
    loader = InfluxDBLoader(config)
    try:
        data = loader.load_data()
    finally:
        loader.close()
    
    # 데이터 전처리
    print("\n[Preprocessing] Preparing data...")
    current = data["current"].values
    voltage = data["voltage"].values
    temperature = data["temperature"].values
    
    # 정규화
    scaler_current = StandardScaler()
    scaler_volt = StandardScaler()
    scaler_temp = StandardScaler()
    
    current_scaled = scaler_current.fit_transform(current.reshape(-1, 1)).flatten()
    voltage_scaled = scaler_volt.fit_transform(voltage.reshape(-1, 1)).flatten()
    temp_scaled = scaler_temp.fit_transform(temperature.reshape(-1, 1)).flatten()
    
    # SOC 생성 (pseudo 또는 초기값)
    if config.use_pseudo_soc:
        soc = np.zeros(len(data))
        soc[0] = 1.0
        dt = (data.index[1] - data.index[0]).total_seconds() if len(data) > 1 else 1.0
        for i in range(1, len(data)):
            delta_soc = (config.coulomb_eff * current[i-1] * dt) / (config.capacity_ah * 3600)
            soc[i] = soc[i-1] - delta_soc
            soc[i] = np.clip(soc[i], 0.0, 1.0)
    else:
        soc = np.ones(len(data)) * 1.0  # 초기값
    
    scaler_soc = StandardScaler()
    soc_scaled = scaler_soc.fit_transform(soc.reshape(-1, 1)).flatten()
    
    # 피처 결합: [current, temperature, SOC]
    features = np.column_stack([current_scaled, temp_scaled, soc_scaled])
    targets = voltage_scaled
    
    # 학습/검증 분리 (시간 기반)
    split_idx = int(len(features) * (1 - config.val_split))
    train_features = features[:split_idx]
    train_targets = targets[:split_idx]
    val_features = features[split_idx:]
    val_targets = targets[split_idx:]
    
    # 데이터셋 생성
    train_dataset = VoltageDataset(train_features, train_targets, config.seq_len, [0, 1, 2])
    val_dataset = VoltageDataset(val_features, val_targets, config.seq_len, [0, 1, 2])
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=config.batch_size,
        shuffle=True,
        num_workers=config.num_workers,
        pin_memory=config.pin_memory,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=config.batch_size,
        shuffle=False,
        num_workers=config.num_workers,
        pin_memory=config.pin_memory,
    )
    
    print(f"  Train samples: {len(train_dataset)}")
    print(f"  Val samples: {len(val_dataset)}")
    
    # 모델 생성
    model = GRUVoltageModel(
        input_size=3,  # current, temperature, SOC
        hidden_size=config.hidden_size,
        num_layers=config.num_layers,
        dropout=config.dropout,
        use_revin=True,
    ).to(device)
    
    print(f"\n[Model] GRU Voltage Model")
    print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")
    
    # 학습
    train_history = train_model(model, train_loader, val_loader, config, device)
    
    # 최적 모델 로드
    model.load_state_dict(torch.load(config.model_dir / "gru_voltage.pt"))
    
    # 검증 데이터로 평가
    model.eval()
    val_preds = []
    val_actuals = []
    with torch.no_grad():
        for batch_x, batch_y in val_loader:
            batch_x = batch_x.to(device)
            pred = model(batch_x).cpu().numpy()
            val_preds.extend(pred.flatten())
            val_actuals.extend(batch_y.numpy().flatten())
    
    val_preds = np.array(val_preds)
    val_actuals = np.array(val_actuals)
    
    # 역정규화
    val_preds_volt = scaler_volt.inverse_transform(val_preds.reshape(-1, 1)).flatten()
    val_actuals_volt = scaler_volt.inverse_transform(val_actuals.reshape(-1, 1)).flatten()
    
    # 전압 예측 지표
    voltage_rmse = np.sqrt(mean_squared_error(val_actuals_volt, val_preds_volt))
    voltage_mae = mean_absolute_error(val_actuals_volt, val_preds_volt)
    
    print(f"\n[Evaluation] Voltage Prediction Metrics")
    print(f"  RMSE: {voltage_rmse:.4f} V")
    print(f"  MAE: {voltage_mae:.4f} V")
    
    # UKF 추론
    soc_estimates, voltage_predictions, voltage_actual = run_ukf_inference(
        model, data, config, device
    )
    
    # 역정규화
    voltage_predictions_volt = scaler_volt.inverse_transform(
        voltage_predictions.reshape(-1, 1)
    ).flatten()
    
    # 시각화
    plot_results(
        voltage_actual,
        voltage_predictions_volt,
        soc_estimates,
        config=config,
        soc_labels=None,  # 라벨이 있으면 추가
    )
    
    # 최종 지표 저장
    metrics = {
        "voltage_prediction": {
            "rmse": float(voltage_rmse),
            "mae": float(voltage_mae),
        },
        "soc_estimation": {
            "final_soc": float(soc_estimates[-1] * 100),
            "initial_soc": float(soc_estimates[0] * 100),
        },
        "hyperparameters": {
            "seq_len": config.seq_len,
            "hidden_size": config.hidden_size,
            "num_layers": config.num_layers,
            "epochs": config.epochs,
            "batch_size": config.batch_size,
            "learning_rate": config.learning_rate,
            "capacity_ah": config.capacity_ah,
            "coulomb_eff": config.coulomb_eff,
            "q_proc": config.q_proc,
            "r_meas": config.r_meas,
        },
        "training": {
            "best_val_loss": float(train_history["best_val_loss"]),
        },
    }
    
    with open(config.metrics_file, "w") as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\n[Metrics] Saved to {config.metrics_file}")
    print("\n[Done] Training and inference completed!")


if __name__ == "__main__":
    main()

