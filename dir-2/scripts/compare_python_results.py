#!/usr/bin/env python3
"""
Python 스크립트 실행 결과를 JSON으로 저장하여 Next.js와 비교
"""
import pandas as pd
import numpy as np
import json
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

CSV_FILE = 'metrics.csv'
NUM_FIELDS = [
    'distance_km', 'avg_soc_per_km', 'idle_pct', 'chg_slow_pct',
    'chg_fast_pct', 'discharge_pct', 'cell_imbalance_mv', 'temp_range',
]

def load_metrics_csv(filepath: str) -> pd.DataFrame:
    df = pd.read_csv(filepath, encoding='utf-8-sig')
    numeric_df = df[NUM_FIELDS].copy()
    valid_mask = numeric_df.notna().all(axis=1) & numeric_df.isin([np.inf, -np.inf]).sum(axis=1) == 0
    return df[valid_mask].copy()

def calculate_wcss(points: np.ndarray, labels: np.ndarray, centroids: np.ndarray) -> float:
    wcss = 0.0
    for i in range(len(centroids)):
        cluster_points = points[labels == i]
        if len(cluster_points) > 0:
            wcss += np.sum((cluster_points - centroids[i]) ** 2)
    return wcss

if __name__ == '__main__':
    print("Loading CSV...")
    df = load_metrics_csv(CSV_FILE)
    print(f"Loaded {len(df)} valid rows")
    
    X = df[NUM_FIELDS].values.astype(float)
    devices = df['device'].values if 'device' in df.columns else np.array([f"device_{i}" for i in range(len(df))])
    car_types = df['car_type'].values if 'car_type' in df.columns else np.array([None] * len(df))
    
    # 정규화
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # PCA
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_scaled)
    evr = pca.explained_variance_ratio_
    
    print(f"PCA EVR: PC1={evr[0]:.3f}, PC2={evr[1]:.3f}")
    
    # K-means (k=3)
    k = 3
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_pca)
    centroids = kmeans.cluster_centers_
    
    # 결과를 JSON으로 저장
    result = {
        'k': k,
        'evr': [float(evr[0]), float(evr[1])],
        'points': X_pca.tolist(),
        'labels': labels.tolist(),
        'centroids': centroids.tolist(),
        'devices': devices.tolist() if isinstance(devices, np.ndarray) else list(devices),
        'car_types': car_types.tolist() if isinstance(car_types, np.ndarray) else [str(ct) if ct else None for ct in car_types],
        'cluster_counts': [int(np.sum(labels == i)) for i in range(k)],
    }
    
    with open('python_kmeans_result.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"\n클러스터 개수: {k}")
    print(f"클러스터별 데이터 수: {result['cluster_counts']}")
    print(f"결과를 python_kmeans_result.json에 저장했습니다.")
    print("\nNext.js 코드와 비교하려면 이 JSON 파일을 사용하세요.")

