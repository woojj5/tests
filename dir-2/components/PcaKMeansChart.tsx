'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import type { MetricRow } from '@/lib/metrics';
import { Scatter, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  CategoryScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  Filler,
} from 'chart.js';
import type { ChartDataset, ChartData } from 'chart.js';
// Python에서 계산된 결과를 사용하므로 ml-matrix는 더 이상 필요 없음

ChartJS.register(LinearScale, CategoryScale, PointElement, LineElement, Tooltip, Legend, Title, Filler);

const NUM_FIELDS: (keyof MetricRow)[] = [
  'distance_km',
  'avg_soc_per_km',
  'idle_pct',
  'chg_slow_pct',
  'chg_fast_pct',
  'discharge_pct',
  'cell_imbalance_mv',
  'temp_range',
];

type ScatterPt = {
  x: number;
  y: number;
  device?: string;           // 클러스터 포인트는 채움, 센트로이드는 빈값
  car?: string | undefined;  // "
  cluster?: number;          // 센트로이드/클러스터 식별용
};

// 🎨 색상 팔레트 (보고서용: 투명도 0.8 이하)
const CLUSTER_COLORS = [
  { bg: 'rgba(99,102,241,0.6)', border: 'rgba(99,102,241,0.8)' },   // indigo
  { bg: 'rgba(16,185,129,0.6)', border: 'rgba(16,185,129,0.8)' },   // emerald
  { bg: 'rgba(239,68,68,0.6)', border: 'rgba(239,68,68,0.8)' },     // red
  { bg: 'rgba(234,179,8,0.6)', border: 'rgba(234,179,8,0.8)' },     // yellow
  { bg: 'rgba(59,130,246,0.6)', border: 'rgba(59,130,246,0.8)' },   // blue
  { bg: 'rgba(244,63,94,0.6)', border: 'rgba(244,63,94,0.8)' },     // rose
  { bg: 'rgba(20,184,166,0.6)', border: 'rgba(20,184,166,0.8)' },   // teal
  { bg: 'rgba(168,85,247,0.6)', border: 'rgba(168,85,247,0.8)' },   // purple
];

// 📊 Silhouette Score 계산
function silhouetteScore(points: number[][], labels: number[], centroids: number[][]): number {
  const n = points.length;
  if (n === 0) return 0;
  
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(i);
  }
  
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ownCluster = labels[i];
    const ownClusterPoints = clusters.get(ownCluster)!.filter(j => j !== i);
    
    // a(i): 같은 클러스터 내 평균 거리
    let a = 0;
    if (ownClusterPoints.length > 0) {
      for (const j of ownClusterPoints) {
        let dist = 0;
        for (let d = 0; d < points[0].length; d++) {
          const diff = points[i][d] - points[j][d];
          dist += diff * diff;
        }
        a += Math.sqrt(dist);
      }
      a /= ownClusterPoints.length;
    }
    
    // b(i): 가장 가까운 다른 클러스터의 평균 거리
    let b = Infinity;
    for (const [otherCluster, indices] of clusters.entries()) {
      if (otherCluster === ownCluster) continue;
      let avgDist = 0;
      for (const j of indices) {
        let dist = 0;
        for (let d = 0; d < points[0].length; d++) {
          const diff = points[i][d] - points[j][d];
          dist += diff * diff;
        }
        avgDist += Math.sqrt(dist);
      }
      avgDist /= indices.length;
      if (avgDist < b) b = avgDist;
    }
    
    // b가 Infinity면 다른 클러스터가 없으므로 0으로 설정
    if (b === Infinity) {
      b = 0;
    }
    
    // Silhouette score for point i (sklearn 방식)
    const maxVal = Math.max(a, b);
    const s = maxVal > 0 ? (b - a) / maxVal : 0;
    sum += s;
  }
  
  return sum / n;
}

// 📊 WCSS (Within-Cluster Sum of Squares) 계산 (Python 방식과 동일)
function wcss(points: number[][], labels: number[], centroids: number[][]): number {
  let sum = 0;
  const k = centroids.length;
  
  // 각 클러스터별로 계산 (Python 코드와 동일한 방식)
  for (let c = 0; c < k; c++) {
    const clusterPoints = points.filter((_, i) => labels[i] === c);
    if (clusterPoints.length > 0) {
      for (const point of clusterPoints) {
        let dist = 0;
        for (let d = 0; d < point.length; d++) {
          const diff = point[d] - centroids[c][d];
          dist += diff * diff;
        }
        sum += dist;
      }
    }
  }
  return sum;
}

// 간단한 시드 기반 랜덤 생성기
// 주의: Python numpy.random과 완전히 동일하지 않을 수 있음
// 하지만 sklearn KMeans의 random_state=42와 유사한 재현성을 제공
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    // 선형 합동 생성기 (Linear Congruential Generator)
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

// ⚙️ K-means++ (Python sklearn과 동일한 결과를 위해 시드 고정)
function kmeans(points: number[][], k: number, maxIter = 100, randomSeed = 42) {
  const n = points.length, d = points[0].length;
  const rand = seededRandom(randomSeed);
  const centroids: number[][] = [];
  
  // 첫 번째 센트로이드는 랜덤 선택 (Python과 동일)
  centroids.push(points[Math.floor(rand() * n)]);
  
  while (centroids.length < k) {
    const dist2 = points.map(p => {
      let minD = Infinity;
      for (const c of centroids) {
        let s = 0;
        for (let j = 0; j < d; j++) { const t = p[j] - c[j]; s += t * t; }
        if (s < minD) minD = s;
      }
      return minD;
    });
    const total = dist2.reduce((a, b) => a + b, 0) || 1;
    let r = rand() * total; // Math.random() 대신 시드 기반 랜덤 사용
    let idx = 0;
    for (let i = 0; i < n; i++) { r -= dist2[i]; if (r <= 0) { idx = i; break; } }
    centroids.push(points[idx]);
  }

  const labels = new Array(n).fill(0);
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let s = 0;
        for (let j = 0; j < d; j++) { const t = points[i][j] - centroids[c][j]; s += t * t; }
        if (s < bestD) { bestD = s; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    const sumC = Array.from({ length: k }, () => new Array(d).fill(0));
    const cntC = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      cntC[c]++;
      for (let j = 0; j < d; j++) sumC[c][j] += points[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (cntC[c] === 0) continue; // 빈 클러스터 가드
      for (let j = 0; j < d; j++) centroids[c][j] = sumC[c][j] / cntC[c];
    }
    if (!changed) break;
  }
  return { labels, centroids };
}

// 🧩 센트로이드 번호 텍스트 표시
const centroidLabelPlugin = {
  id: 'centroidLabelPlugin',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds: any, dsIndex: number) => {
      if (ds.label !== 'centroid') return;
      const meta = chart.getDatasetMeta(dsIndex);
      meta.data.forEach((elem: any, i: number) => {
        const { x, y } = elem.getProps(['x', 'y'], true);
        const label = String((ds.data[i] as any).cluster + 1);
        ctx.save();
        ctx.font = 'bold 11px sans-serif'; // 10-12pt 범위로 조정
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; // 흰색 테두리
        ctx.lineWidth = 2.5;
        ctx.fillStyle = '#000000'; // 검은 글씨
        ctx.strokeText(label, x + 8, y - 8);
        ctx.fillText(label, x + 8, y - 8);
        ctx.restore();
      });
    });
  },
};

export default function PcaKMeansChart({ rows: rowsProp }: { rows?: MetricRow[] }) {
  const [k, setK] = useState(3);
  const [deviceCarTypes, setDeviceCarTypes] = useState<Record<string, string>>({});
  const scatterChartRef = useRef<any>(null);
  
  // PCA 전체 데이터 (A안: 한 번만 로드)
  const [pcaFullData, setPcaFullData] = useState<{
    version: number;
    max_components: number;
    n_samples: number;
    components: number[][]; // 117×n_samples
    explained_variance_ratio: number[];
    explained_variance_cumsum: number[];
    devices: string[];
    car_types: (string | null)[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 PCA 전체 데이터 한 번만 로드
  useEffect(() => {
    let cancelled = false;
    
    const loadPcaFull = async () => {
      try {
        const res = await fetch('/api/pca/full', {
          cache: 'force-cache', // 브라우저 캐시 활용
        });
        
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to load PCA data: ${res.status} ${errorText}`);
        }
        
        const data = await res.json();
        
        if (!cancelled) {
          setPcaFullData(data);
          setLoading(false);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to load PCA data');
          setLoading(false);
        }
      }
    };
    
    loadPcaFull();
    
    return () => {
      cancelled = true;
    };
  }, []); // 마운트 시 한 번만 실행

  // k 변경 시 클라이언트에서 K-Means 계산 (즉시 반영, 네트워크 호출 없음)
  const { points, centroids2D, evr, clusterStats, silhouetteData, elbowData, scaleRanges } = useMemo(() => {
    if (loading || !pcaFullData) {
      return {
        points: [] as ScatterPt[],
        centroids2D: [] as ScatterPt[],
        evr: [0, 0] as [number, number],
        clusterStats: [],
        silhouetteData: { kValues: [], scores: [] },
        elbowData: { kValues: [], wcssValues: [] },
        scaleRanges: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
      };
    }

    // PCA에서 2D slice (PC1, PC2)
    const pca2D = pcaFullData.components.map(comp => [comp[0], comp[1]]);
    const evr2D: [number, number] = [
      pcaFullData.explained_variance_ratio[0],
      pcaFullData.explained_variance_ratio[1],
    ];

    // K-Means 클러스터링 (클라이언트에서 계산)
    const { labels, centroids } = kmeans(pca2D, k, 300, 42);

    // 포인트 데이터 생성
    const points: ScatterPt[] = pca2D.map((p, i) => ({
      x: p[0],
      y: p[1],
      device: pcaFullData.devices?.[i] || '',
      car: pcaFullData.car_types?.[i] || undefined,
      cluster: labels[i] ?? 0,
    }));

    // 센트로이드 데이터 생성
    const centroids2D: ScatterPt[] = centroids.map((c, idx) => ({
      x: c[0],
      y: c[1],
      cluster: idx,
      device: '',
      car: undefined,
    }));

    // 클러스터 통계 계산
    const clusterStats = [];
    const uniqueLabels = Array.from(new Set(labels)).sort((a, b) => a - b);
    for (const clusterId of uniqueLabels) {
      const clusterIndices = labels.map((l, i) => l === clusterId ? i : -1).filter(i => i >= 0);
      const clusterDevices = clusterIndices.map(i => pcaFullData.devices[i]);
      clusterStats.push({
        cluster: clusterId,
        count: clusterIndices.length,
        devices: clusterDevices,
        deviceNos: clusterDevices,
        averages: {}, // 원본 데이터가 없으므로 빈 객체
      });
    }

    // 여러 k 값에 대한 Silhouette과 Elbow 계산
    const maxK = Math.min(10, Math.floor(pca2D.length / 2));
    const kRange = Array.from({ length: maxK - 1 }, (_, i) => i + 2);
    const silhouetteScores: number[] = [];
    const wcssValues: number[] = [];

    for (const testK of kRange) {
      const { labels: testLabels, centroids: testCentroids } = kmeans(pca2D, testK, 300, 42);
      const silScore = silhouetteScore(pca2D, testLabels, testCentroids);
      const wcssVal = wcss(pca2D, testLabels, testCentroids);
      silhouetteScores.push(silScore);
      wcssValues.push(wcssVal);
    }

    // 축 범위 계산
    const allX = points.map(p => p.x).filter(v => Number.isFinite(v));
    const allY = points.map(p => p.y).filter(v => Number.isFinite(v));
    const minX = allX.length > 0 ? Math.min(...allX) : -1;
    const maxX = allX.length > 0 ? Math.max(...allX) : 1;
    const minY = allY.length > 0 ? Math.min(...allY) : -1;
    const maxY = allY.length > 0 ? Math.max(...allY) : 1;
    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const xBuffer = xRange > 0 ? xRange * 0.02 : 0.1;
    const yBuffer = yRange > 0 ? yRange * 0.02 : 0.1;

    return {
      points,
      centroids2D,
      evr: evr2D,
      clusterStats,
      silhouetteData: { kValues: kRange, scores: silhouetteScores },
      elbowData: { kValues: kRange, wcssValues },
      scaleRanges: {
        xMin: minX - xBuffer,
        xMax: maxX + xBuffer,
        yMin: minY - yBuffer,
        yMax: maxY + yBuffer,
      },
    };
  }, [pcaFullData, k, loading]); // pcaFullData와 k 변경 시 재계산

  // 클러스터별 device_no로 car_type 조회 (모든 hooks를 조건부 return 전에 호출)
  useEffect(() => {
    if (!clusterStats || clusterStats.length === 0) return;
    
    const allDeviceNos = clusterStats.flatMap(stat => stat.deviceNos || []);
    if (allDeviceNos.length === 0) return;

    const fetchCarTypes = async () => {
      try {
        const res = await fetch('/api/cluster-car-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceNos: allDeviceNos }),
        });
        if (res.ok) {
          const carTypes = await res.json();
          setDeviceCarTypes(carTypes);
        }
      } catch (e) {
        console.error('Failed to fetch car types:', e);
      }
    };

    fetchCarTypes();
  }, [clusterStats]);

  // 차트 데이터셋 (모든 hooks를 조건부 return 전에 호출)
  const datasets: ChartDataset<'scatter', ScatterPt[]>[] = useMemo(() => {
    if (!points || points.length === 0) {
      return [];
    }
    
    const groups = new Map<number, ScatterPt[]>();
    for (const p of points) {
      const key = p.cluster ?? 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    
    // 실제 클러스터 개수 확인 (디버깅)
    const actualClusterCount = groups.size;
    if (actualClusterCount !== k && actualClusterCount > 0) {
      console.warn(`[Chart] 요청한 k=${k}, 실제 데이터셋 클러스터 수=${actualClusterCount}`);
    }
    
    // 클러스터가 없으면 빈 배열 반환
    if (actualClusterCount === 0) {
      console.warn(`[Chart] 클러스터가 없습니다 (k=${k}, points=${points.length})`);
      return [];
    }

    const clusterSets: ChartDataset<'scatter', ScatterPt[]>[] =
      [...groups.entries()].map(([c, pts]) => {
        const color = CLUSTER_COLORS[c % CLUSTER_COLORS.length];
        return {
          label: `cluster ${c + 1}`,
          data: pts,
          pointBackgroundColor: color.bg,
          pointBorderColor: color.border,
          pointRadius: 2.5, // 보고서용: 약간 확대 (20-30%)
          pointHoverRadius: 4,
          pointBorderWidth: 0.5, // 얇은 테두리
        };
      });

    const centroidSet: ChartDataset<'scatter', ScatterPt[]> = {
      label: 'centroid',
      data: centroids2D,
      pointRadius: 9,
      pointHoverRadius: 10,
      pointStyle: 'star',
      pointBackgroundColor: 'rgba(255,255,255,0.95)',
      pointBorderColor: '#111827',
      pointBorderWidth: 2,
    };

    return [...clusterSets, centroidSet];
  }, [points, centroids2D]);

  const chartData: ChartData<'scatter', ScatterPt[], unknown> = { datasets };

  // 모든 hooks 호출 후 조건부 렌더링
  if (loading) {
    return (
      <div className="p-4 text-center">
        <div>PCA 데이터 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <div>데이터를 불러올 수 없습니다: {error}</div>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            // 재시도 로직은 useEffect에서 처리
          }}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!pcaFullData) {
    return (
      <div className="p-4 text-center text-red-500">
        <div>PCA 데이터가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-400">클러스터 수 (k)</label>
          <input
            type="number"
            min={1}
            max={117}
            className="px-3 py-2 border rounded-lg w-24 bg-transparent"
            value={k}
            onChange={e => setK(Math.max(1, Math.min(117, Number(e.target.value) || 1)))}
          />
          <span className="text-xs text-gray-500">(즉시 반영, 네트워크 호출 없음)</span>
        </div>
        <button
          onClick={() => {
            if (scatterChartRef.current) {
              const chart = scatterChartRef.current;
              const canvas = chart.canvas;
              if (canvas) {
                // 고해상도로 다운로드하기 위해 더 큰 크기로 생성
                const scale = 3; // 3배 해상도로 더 선명하게
                const originalWidth = canvas.width;
                const originalHeight = canvas.height;
                
                // 임시 canvas 생성
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = originalWidth * scale;
                tempCanvas.height = originalHeight * scale;
                const ctx = tempCanvas.getContext('2d');
                
                if (ctx) {
                  // 배경을 흰색으로
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                  
                  // 고품질 이미지 스케일링
                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';
                  
                  // 원본 canvas를 확대해서 그리기
                  ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                  
                  // 다운로드
                  tempCanvas.toBlob((blob) => {
                    if (blob) {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `pca-kmeans-k${k}-${new Date().toISOString().split('T')[0]}.png`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }
                  }, 'image/png');
                }
              }
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          그래프 다운로드 (고해상도 PNG)
        </button>
      </div>

      <div className="rounded-2xl shadow p-4 bg-white">
        <Scatter
          ref={scatterChartRef}
          data={chartData}
          height={520}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            backgroundColor: '#ffffff',
            devicePixelRatio: 2, // 고해상도 디스플레이 지원
            animation: false, // 다운로드 시 애니메이션 없이
            plugins: {
              title: {
                display: true,
                text: `K-means Clusters (K=${k}) - Client-side Calculation`,
                font: { size: 12, weight: 'bold' }, // 10-12pt 범위
                color: '#000000',
                padding: { top: 10, bottom: 10 },
              },
              legend: { 
                position: 'top',
                align: 'center',
                labels: {
                  color: '#000000',
                  font: { size: 11 }, // 10-12pt 범위
                  padding: 8,
                  usePointStyle: true,
                  boxWidth: 8,
                },
                display: true,
              },
              tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#000000',
                bodyColor: '#000000',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                callbacks: {
                  label: (ctx) => {
                    const d = ctx.raw as ScatterPt;
                    // ✅ ctx.parsed 대신 raw를 사용 (우리는 항상 number로 넣음)
                    const x = Number.isFinite(d.x) ? d.x : (ctx.parsed.x ?? 0);
                    const y = Number.isFinite(d.y) ? d.y : (ctx.parsed.y ?? 0);
                    const xy = `(${x.toFixed(2)}, ${y.toFixed(2)})`;

                    if (ctx.dataset.label === 'centroid') {
                      return ` centroid ${d.cluster! + 1}: ${xy}`;
                    }
                    const meta = `${d.device ?? ''}${d.car ? ` / ${d.car}` : ''}`;
                    return ` ${ctx.dataset.label}: ${xy} ${meta}`;
                  },
                },
              },
            },
            scales: {
              x: { 
                title: { 
                  display: true, 
                  text: `PC1 (${(evr[0] * 100).toFixed(2)}%)`,
                  color: '#000000',
                  font: { size: 11, weight: 'normal' }, // 10-12pt 범위
                  padding: { top: 5, bottom: 5 },
                },
                ticks: {
                  color: '#000000',
                  font: { size: 10 }, // 10-12pt 범위
                  padding: 2, // 패딩 줄임
                },
                grid: {
                  color: '#e5e7eb',
                  lineWidth: 0.5, // 0.5pt 이하
                },
                backgroundColor: '#ffffff',
                min: scaleRanges?.xMin,
                max: scaleRanges?.xMax,
                offset: false, // 패딩 제거
              },
              y: { 
                title: { 
                  display: true, 
                  text: `PC2 (${(evr[1] * 100).toFixed(2)}%)`,
                  color: '#000000',
                  font: { size: 11, weight: 'normal' }, // 10-12pt 범위
                  padding: { top: 5, bottom: 5 },
                },
                ticks: {
                  color: '#000000',
                  font: { size: 10 }, // 10-12pt 범위
                  padding: 2, // 패딩 줄임
                  maxTicksLimit: 8, // 눈금 개수 제한으로 간격을 더 촘촘하게
                },
                grid: {
                  color: '#e5e7eb',
                  lineWidth: 0.5, // 0.5pt 이하
                },
                backgroundColor: '#ffffff',
                min: scaleRanges?.yMin,
                max: scaleRanges?.yMax,
                offset: false, // 패딩 제거
              },
            },
            layout: {
              padding: {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              },
            },
          }}
          plugins={[centroidLabelPlugin]}
        />
      </div>

      {/* Silhouette Score 그래프 */}
      <div className="rounded-2xl shadow p-4 bg-white">
        <Line
          data={{
            labels: (silhouetteData?.kValues || []).map(k => `k=${k}`),
            datasets: [{
              label: 'Silhouette Score',
              data: silhouetteData?.scores || [],
              borderColor: 'rgba(99,102,241,1)',
              backgroundColor: 'rgba(99,102,241,0.1)',
              fill: true,
              tension: 0.4,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Silhouette Score (높을수록 좋음)',
                font: { size: 16, weight: 'bold' },
                color: '#000000',
              },
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#000000',
                bodyColor: '#000000',
                borderColor: '#e5e7eb',
                borderWidth: 1,
              },
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: '클러스터 수 (k)',
                  color: '#000000',
                },
                ticks: {
                  color: '#000000',
                },
                grid: {
                  color: '#e5e7eb',
                },
                backgroundColor: '#ffffff',
              },
              y: {
                title: {
                  display: true,
                  text: 'Silhouette Score',
                  color: '#000000',
                },
                ticks: {
                  color: '#000000',
                },
                grid: {
                  color: '#e5e7eb',
                },
                backgroundColor: '#ffffff',
              },
            },
          }}
          height={300}
        />
      </div>

      {/* Elbow Method 그래프 */}
      <div className="rounded-2xl shadow p-4 bg-white">
        <Line
          data={{
            labels: (elbowData?.kValues || []).map(k => `k=${k}`),
            datasets: [{
              label: 'WCSS (Within-Cluster Sum of Squares)',
              data: elbowData?.wcssValues || [],
              borderColor: 'rgba(239,68,68,1)',
              backgroundColor: 'rgba(239,68,68,0.1)',
              fill: true,
              tension: 0.4,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: 'Elbow Method (낮을수록 좋음, "엘보우" 지점 찾기)',
                font: { size: 16, weight: 'bold' },
                color: '#000000',
              },
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#000000',
                bodyColor: '#000000',
                borderColor: '#e5e7eb',
                borderWidth: 1,
              },
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: '클러스터 수 (k)',
                  color: '#000000',
                },
                ticks: {
                  color: '#000000',
                },
                grid: {
                  color: '#e5e7eb',
                },
                backgroundColor: '#ffffff',
              },
              y: {
                title: {
                  display: true,
                  text: 'WCSS',
                  color: '#000000',
                },
                ticks: {
                  color: '#000000',
                },
                grid: {
                  color: '#e5e7eb',
                },
                backgroundColor: '#ffffff',
              },
            },
          }}
          height={300}
        />
      </div>

      {/* 클러스터별 통계 분석 */}
      {clusterStats && clusterStats.length > 0 && (
      <div className="rounded-2xl shadow p-4 bg-white">
        <h3 className="text-lg font-semibold mb-4 text-black">클러스터별 데이터 특성 분석</h3>
        <div className="space-y-6">
          {clusterStats.map((stat, idx) => {
            const color = CLUSTER_COLORS[stat.cluster % CLUSTER_COLORS.length];
            return (
              <div key={stat.cluster} className="border rounded-lg p-4" style={{ borderColor: color.border }}>
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: color.bg, border: `2px solid ${color.border}` }}
                  />
                  <h4 className="font-bold text-black">Cluster {stat.cluster + 1}</h4>
                  <span className="text-sm text-gray-600">({stat.count}개 디바이스)</span>
                </div>
                
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-bold text-black mb-2">📊 차종 분포</div>
                  {(() => {
                    const deviceNos = stat.deviceNos || [];
                    const carTypeCounts: Record<string, number> = {};
                    for (const deviceNo of deviceNos) {
                      const carType = deviceCarTypes[deviceNo] || 'unknown';
                      carTypeCounts[carType] = (carTypeCounts[carType] || 0) + 1;
                    }
                    const entries = Object.entries(carTypeCounts).sort((a, b) => b[1] - a[1]);
                    const total = stat.count;
                    
                    return entries.length > 0 ? (
                      <div className="space-y-1">
                        {entries.map(([car, count]) => {
                          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
                          return (
                            <div key={car} className="flex items-center justify-between text-sm">
                              <span className="font-medium text-black">{car}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">{count}대</span>
                                <span className="text-gray-500">({percentage}%)</span>
                                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full"
                                    style={{ 
                                      width: `${percentage}%`,
                                      backgroundColor: color.border,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">로딩 중...</span>
                    );
                  })()}
                </div>

                {Object.keys(stat.averages).length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border px-2 py-1 text-left text-black">변수</th>
                          <th className="border px-2 py-1 text-right text-black">평균값</th>
                          <th className="border px-2 py-1 text-left text-black">의미</th>
                        </tr>
                      </thead>
                      <tbody>
                        {'distance_km' in stat.averages && typeof stat.averages.distance_km === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">주행거리 (km)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.distance_km.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">총 주행거리</td>
                          </tr>
                        )}
                        {'avg_soc_per_km' in stat.averages && typeof stat.averages.avg_soc_per_km === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">km당 평균 SOC</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.avg_soc_per_km.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">주행 효율 (높을수록 효율적)</td>
                          </tr>
                        )}
                        {'idle_pct' in stat.averages && typeof stat.averages.idle_pct === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">공회전 비율 (%)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.idle_pct.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">정지 시간 비율</td>
                          </tr>
                        )}
                        {'chg_slow_pct' in stat.averages && typeof stat.averages.chg_slow_pct === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">완속 충전 비율 (%)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.chg_slow_pct.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">완속 충전 시간 비율</td>
                          </tr>
                        )}
                        {'chg_fast_pct' in stat.averages && typeof stat.averages.chg_fast_pct === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">급속 충전 비율 (%)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.chg_fast_pct.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">급속 충전 시간 비율</td>
                          </tr>
                        )}
                        {'discharge_pct' in stat.averages && typeof stat.averages.discharge_pct === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">방전 비율 (%)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.discharge_pct.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">방전 시간 비율</td>
                          </tr>
                        )}
                        {'cell_imbalance_mv' in stat.averages && typeof stat.averages.cell_imbalance_mv === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">셀 불균형 (mV)</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.cell_imbalance_mv.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">배터리 셀 간 전압 차이</td>
                          </tr>
                        )}
                        {'temp_range' in stat.averages && typeof stat.averages.temp_range === 'number' && (
                          <tr>
                            <td className="border px-2 py-1 font-medium text-black">온도 범위</td>
                            <td className="border px-2 py-1 text-right text-black">{stat.averages.temp_range.toFixed(2)}</td>
                            <td className="border px-2 py-1 text-gray-700">온도 변화 범위</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 text-center py-4">
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
