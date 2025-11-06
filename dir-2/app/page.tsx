'use client';

import { useEffect, useState } from 'react';

export default function HomePage() {
  const [cacheStatus, setCacheStatus] = useState<{ cached: number; total: number; percentage: string } | null>(null);

  useEffect(() => {
    // 1. 먼저 캐시 상태 확인
    fetch('/api/kmeans/load-cache')
      .then(res => res.json())
      .then(data => {
        setCacheStatus(data);
        // 캐시가 모두 있으면 precompute 스킵
        if (data.cached === data.total) {
          console.log('All results already in cache');
          return;
        }
        // 2. JSON 파일을 메모리 캐시에 로드
        return fetch('/api/kmeans/load-cache', { method: 'POST' });
      })
      .then(() => {
        // 3. 캐시 상태 다시 확인
        return fetch('/api/kmeans/load-cache');
      })
      .then(res => res.json())
      .then(data => {
        setCacheStatus(data);
        // 4. 아직 없는 것이 있으면 precompute 시작
        if (data.cached < data.total) {
          fetch('/api/kmeans/precompute', {
            method: 'POST',
          }).catch((e) => {
            console.error('Failed to start precomputation:', e);
          });
        }
      })
      .catch((e) => {
        console.error('Failed to load cache:', e);
      });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">AICar Dashboard</h1>
      <p style={{ marginTop: 8 }}>상단 내비게이션에서 페이지를 선택하세요.</p>
      {cacheStatus && (
        <p style={{ marginTop: 8, fontSize: '0.9em', color: '#666' }}>
          메모리 캐시: {cacheStatus.cached}/{cacheStatus.total} ({cacheStatus.percentage}%)
          {cacheStatus.cached < cacheStatus.total && (
            <span> - K-Means 클러스터링 결과를 백그라운드에서 미리 계산 중...</span>
          )}
        </p>
      )}
    </div>
  );
}
