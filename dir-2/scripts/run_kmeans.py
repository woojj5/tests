#!/usr/bin/env python3
"""
K-Means 클러스터링 결과를 JSON으로 저장하는 Python 스크립트
Next.js에서 사용할 수 있도록 결과를 저장
"""
import pandas as pd
import numpy as np
import json
import sys
import os
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

# CSV 파일 경로
CSV_FILE = 'metrics.csv'
# k 값별로 결과 파일 저장 (캐싱을 위해)

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

def calculate_wcss(points: np.ndarray, labels: np.ndarray, centroids: np.ndarray) -> float:
    """Within-Cluster Sum of Squares 계산"""
    wcss = 0.0
    for i in range(len(centroids)):
        cluster_points = points[labels == i]
        if len(cluster_points) > 0:
            wcss += np.sum((cluster_points - centroids[i]) ** 2)
    return wcss

def main():
    # k 값 받기 (기본값 3)
    k = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    
    # k 값별로 결과 파일 저장
    OUTPUT_FILE = f'kmeans_result_k{k}.json'
    
    # 결과 파일이 이미 있고 CSV보다 최신이면 스킵
    import os
    from pathlib import Path
    
    csv_path = Path(CSV_FILE)
    output_path = Path(OUTPUT_FILE)
    
    if output_path.exists() and csv_path.exists():
        csv_mtime = csv_path.stat().st_mtime
        output_mtime = output_path.stat().st_mtime
        if output_mtime > csv_mtime:
            print(f"Result file for k={k} already exists and is newer than CSV. Skipping...")
            return
    
    print(f"Loading CSV file...")
    # pandas 최적화: dtype 지정은 선택적으로 (컬럼이 없을 수 있음)
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
    
    # 데이터 추출 (float64로 안정성 확보, 필요시 float32로 변경 가능)
    X = valid_df[NUM_FIELDS].values.astype(np.float64)
    devices = valid_df['device'].values if 'device' in valid_df.columns else np.array([f"device_{i}" for i in range(len(valid_df))])
    car_types = valid_df['car_type'].values if 'car_type' in valid_df.columns else np.array([None] * len(valid_df))
    
    # Z-score 정규화
    print("Normalizing data...")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # PCA (2D)
    print("Performing PCA...")
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_scaled)
    
    evr = pca.explained_variance_ratio_
    print(f"PCA Explained Variance Ratio: PC1={evr[0]:.3f}, PC2={evr[1]:.3f}")
    
    # K-means 클러스터링
    print(f"Performing K-means clustering with k={k}...")
    try:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10, n_jobs=-1, max_iter=300)
    except TypeError:
        # n_jobs 파라미터가 없는 경우 (구버전 sklearn)
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10, max_iter=300)
    labels = kmeans.fit_predict(X_pca)
    centroids = kmeans.cluster_centers_
    
    # 실제 사용된 클러스터 확인
    unique_labels = np.unique(labels)
    actual_k = len(unique_labels)
    print(f"Actual clusters used: {actual_k}")
    
    # 여러 k 값에 대한 Silhouette과 Elbow 계산
    print("Calculating metrics for different k values...")
    max_k = min(10, len(X_pca) // 2)
    k_range = range(2, max_k + 1)
    
    silhouette_scores = []
    wcss_values = []
    
    for test_k in k_range:
        try:
            kmeans_test = KMeans(n_clusters=test_k, random_state=42, n_init=10, n_jobs=-1, max_iter=300)
        except TypeError:
            kmeans_test = KMeans(n_clusters=test_k, random_state=42, n_init=10, max_iter=300)
        labels_test = kmeans_test.fit_predict(X_pca)
        centroids_test = kmeans_test.cluster_centers_
        
        try:
            sil_score = silhouette_score(X_pca, labels_test, n_jobs=-1)
        except TypeError:
            sil_score = silhouette_score(X_pca, labels_test)
        silhouette_scores.append(float(sil_score))
        
        wcss_val = calculate_wcss(X_pca, labels_test, centroids_test)
        wcss_values.append(float(wcss_val))
        
        print(f"  k={test_k}: Silhouette={sil_score:.4f}, WCSS={wcss_val:.2f}")
    
    # 클러스터별 통계 계산
    print("\nCalculating cluster statistics...")
    cluster_stats = []
    for cluster_id in range(actual_k):
        cluster_mask = labels == unique_labels[cluster_id]
        cluster_indices = np.where(cluster_mask)[0]
        
        cluster_devices = devices[cluster_mask].tolist() if isinstance(devices, np.ndarray) else [devices[i] for i in cluster_indices]
        cluster_car_types = car_types[cluster_mask] if isinstance(car_types, np.ndarray) else [car_types[i] for i in cluster_indices]
        
        # 차종 분포
        car_type_counts = {}
        if cluster_car_types is not None:
            for ct in cluster_car_types:
                if pd.notna(ct) and ct:
                    car_type_counts[str(ct)] = car_type_counts.get(str(ct), 0) + 1
        
        # 평균값 계산
        cluster_data = X[cluster_mask]
        averages = {field: float(np.mean(cluster_data[:, i])) for i, field in enumerate(NUM_FIELDS)}
        
        cluster_stats.append({
            'cluster': int(cluster_id),
            'count': int(len(cluster_indices)),
            'devices': [str(d) for d in cluster_devices],
            'car_types': car_type_counts,
            'averages': averages,
        })
    
    # 결과를 JSON으로 저장
    result = {
        'k': k,
        'actual_k': int(actual_k),
        'evr': [float(evr[0]), float(evr[1])],
        'points': X_pca.tolist(),
        'labels': labels.tolist(),
        'centroids': centroids.tolist(),
        'devices': devices.tolist() if isinstance(devices, np.ndarray) else [str(d) for d in devices],
        'car_types': car_types.tolist() if isinstance(car_types, np.ndarray) else [str(ct) if ct else None for ct in car_types],
        'cluster_counts': [int(np.sum(labels == unique_labels[i])) for i in range(actual_k)],
        'cluster_stats': cluster_stats,
        'silhouette_data': {
            'kValues': list(k_range),
            'scores': silhouette_scores,
        },
        'elbow_data': {
            'kValues': list(k_range),
            'wcssValues': wcss_values,
        },
    }
    
    output_path = os.path.join(os.path.dirname(CSV_FILE), OUTPUT_FILE)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    
    print(f"\n결과를 {output_path}에 저장했습니다.")
    print(f"클러스터 개수: {actual_k}")
    print(f"클러스터별 데이터 수: {result['cluster_counts']}")

if __name__ == '__main__':
    main()

