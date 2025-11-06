#!/usr/bin/env python3
"""
전체 PCA 결과를 생성하는 스크립트 (A안: 한 번만 계산)
PCA를 최대 차원(117)까지 계산하여 모든 결과를 한 파일에 저장
"""
import pandas as pd
import numpy as np
import json
import sys
import os
from pathlib import Path
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

# CSV 파일 경로
CSV_FILE = 'metrics.csv'
OUTPUT_FILE = 'pca_full.json'

# 숫자 필드
NUM_FIELDS = [
    'distance_km',
    'avg_soc_per_km',
    'idle_pct',
    'chg_slow_pct',
    'chg_fast_pct',
    'discharge_pct',
    'cell_imbalance_mv',
    'temp_range',
]

def main():
    # 결과 파일이 이미 있고 CSV보다 최신이면 스킵
    csv_path = Path(CSV_FILE)
    output_path = Path(OUTPUT_FILE)
    
    if output_path.exists() and csv_path.exists():
        csv_mtime = csv_path.stat().st_mtime
        output_mtime = output_path.stat().st_mtime
        if output_mtime > csv_mtime:
            print(f"PCA full file already exists and is newer than CSV. Skipping...")
            return
    
    print(f"Loading CSV file...")
    try:
        df = pd.read_csv(CSV_FILE, encoding='utf-8-sig')
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return
    
    # 숫자 필드만 추출하고 유효한 행만 필터링
    numeric_df = df[NUM_FIELDS].copy()
    valid_mask = numeric_df.notna().all(axis=1) & numeric_df.isin([np.inf, -np.inf]).sum(axis=1) == 0
    valid_df = df[valid_mask].copy()
    
    print(f"Loaded {len(valid_df)} valid rows")
    
    if len(valid_df) == 0:
        print("No valid data found!")
        return
    
    # 데이터 추출
    X = valid_df[NUM_FIELDS].values.astype(np.float64)
    devices = valid_df['device'].values if 'device' in valid_df.columns else np.array([f"device_{i}" for i in range(len(valid_df))])
    car_types = valid_df['car_type'].values if 'car_type' in valid_df.columns else np.array([None] * len(valid_df))
    
    # Z-score 정규화
    print("Normalizing data...")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # PCA를 최대 차원까지 계산 (최대 117개 또는 데이터 포인트 수)
    max_components = min(117, len(X_scaled), len(NUM_FIELDS))
    print(f"Performing PCA with {max_components} components...")
    
    pca = PCA(n_components=max_components)
    X_pca = pca.fit_transform(X_scaled)
    
    evr = pca.explained_variance_ratio_
    explained_variance_cumsum = np.cumsum(evr)
    
    print(f"PCA Explained Variance Ratio (first 10): {evr[:10]}")
    print(f"Cumulative Variance (first 10): {explained_variance_cumsum[:10]}")
    
    # 결과를 JSON으로 저장
    result = {
        'version': 1,  # 버전 번호 (데이터 구조 변경 시 증가)
        'max_components': int(max_components),
        'n_samples': int(len(X_pca)),
        'n_features': int(len(NUM_FIELDS)),
        'components': X_pca.tolist(),  # 전체 PCA 결과 (117×n_samples)
        'explained_variance_ratio': evr.tolist(),  # 각 PC의 설명 분산 비율
        'explained_variance_cumsum': explained_variance_cumsum.tolist(),  # 누적 설명 분산
        'devices': devices.tolist() if isinstance(devices, np.ndarray) else [str(d) for d in devices],
        'car_types': car_types.tolist() if isinstance(car_types, np.ndarray) else [str(ct) if ct else None for ct in car_types],
    }
    
    output_path_full = os.path.join(os.path.dirname(CSV_FILE), OUTPUT_FILE)
    with open(output_path_full, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"\n전체 PCA 결과를 {output_path_full}에 저장했습니다.")
    print(f"총 {max_components}개 컴포넌트, {len(X_pca)}개 샘플")
    print(f"파일 크기: {os.path.getsize(output_path_full) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    main()

