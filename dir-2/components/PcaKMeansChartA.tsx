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
  device?: string;
  car?: string | undefined;
  cluster?: number;
};

const CLUSTER_COLORS = [
  { bg: 'rgba(99,102,241,0.6)', border: 'rgba(99,102,241,0.8)' },
  { bg: 'rgba(16,185,129,0.6)', border: 'rgba(16,185,129,0.8)' },
  { bg: 'rgba(239,68,68,0.6)', border: 'rgba(239,68,68,0.8)' },
  { bg: 'rgba(234,179,8,0.6)', border: 'rgba(234,179,8,0.8)' },
  { bg: 'rgba(59,130,246,0.6)', border: 'rgba(59,130,246,0.8)' },
  { bg: 'rgba(244,63,94,0.6)', border: 'rgba(244,63,94,0.8)' },
  { bg: 'rgba(20,184,166,0.6)', border: 'rgba(20,184,166,0.8)' },
  { bg: 'rgba(168,85,247,0.6)', border: 'rgba(168,85,247,0.8)' },
];

// K-Means 클러스터링 함수 (Python sklearn과 동일한 결과를 위해 시드 고정)
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function kmeans(points: number[][], k: number, maxIter = 100, randomSeed = 42): { labels: number[]; centroids: number[][] } {
  const n = points.length;
  const d = points[0].length;
  const rand = seededRandom(randomSeed);
  const centroids: number[][] = [];
  
  // 첫 번째 센트로이드는 랜덤 선택
  centroids.push([...points[Math.floor(rand() * n)]]);
  
  while (centroids.length < k) {
    const dist2 = points.map(p => {
      let minD = Infinity;
      for (const c of centroids) {
        let s = 0;
        for (let j = 0; j < d; j++) {
          const t = p[j] - c[j];
          s += t * t;
        }
        if (s < minD) minD = s;
      }
      return minD;
    });
    const total = dist2.reduce((a, b) => a + b, 0) || 1;
    let r = rand() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= dist2[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    centroids.push([...points[idx]]);
  }

  const labels = new Array(n).fill(0);
  for (let it = 0; it < maxIter; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let s = 0;
        for (let j = 0; j < d; j++) {
          const t = points[i][j] - centroids[c][j];
          s += t * t;
        }
        if (s < bestD) {
          bestD = s;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    const sumC = Array.from({ length: k }, () => new Array(d).fill(0));
    const cntC = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      cntC[c]++;
      for (let j = 0; j < d; j++) {
        sumC[c][j] += points[i][j];
      }
    }
    for (let c = 0; c < k; c++) {
      if (cntC[c] === 0) continue;
      for (let j = 0; j < d; j++) {
        centroids[c][j] = sumC[c][j] / cntC[c];
      }
    }
    if (!changed) break;
  }
  
  // 빈 클러스터 제거 및 라벨 재매핑
  const usedLabels = Array.from(new Set(labels)).sort((a, b) => a - b);
  const labelMap = new Map(usedLabels.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const remappedLabels = labels.map(l => labelMap.get(l) ?? 0);
  const remappedCentroids = usedLabels.map(oldIdx => centroids[oldIdx]);
  
  return { labels: remappedLabels, centroids: remappedCentroids };
}

function calculateWCSS(points: number[][], labels: number[], centroids: number[][]): number {
  let wcss = 0;
  for (let i = 0; i < centroids.length; i++) {
    const clusterPoints = points.filter((_, idx) => labels[idx] === i);
    if (clusterPoints.length > 0) {
      for (const p of clusterPoints) {
        let dist = 0;
        for (let j = 0; j < p.length; j++) {
          const diff = p[j] - centroids[i][j];
          dist += diff * diff;
        }
        wcss += dist;
      }
    }
  }
  return wcss;
}

function silhouetteScore(points: number[][], labels: number[]): number {
  const n = points.length;
  if (n === 0) return 0;
  
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = labels[i];
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(i);
  }
  
  if (clusters.size < 2) return 0;
  
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ownCluster = labels[i];
    const ownClusterPoints = clusters.get(ownCluster)!.filter(j => j !== i);
    
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
    
    if (b === Infinity) b = 0;
    if (max(a, b) > 0) {
      sum += (b - a) / max(a, b);
    }
  }
  return sum / n;
}

function max(a: number, b: number): number {
  return a > b ? a : b;
}

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
        ctx.font = 'bold 11px sans-serif';
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = '#000000';
        ctx.strokeText(label, x + 8, y - 8);
        ctx.fillText(label, x + 8, y - 8);
        ctx.restore();
      });
    });
  },
};

/**
 * A안: PCA 전체 결과를 한 번만 로드하고 클라이언트에서 k별로 slice
 */
export default function PcaKMeansChartA({ rows: rowsProp }: { rows?: MetricRow[] }) {
  const [k, setK] = useState(3);
  const [deviceCarTypes, setDeviceCarTypes] = useState<Record<string, string>>({});
  const scatterChartRef = useRef<any>(null);
  
  // PCA 전체 데이터 (한 번만 로드)
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
        console.log('[PcaKMeansChartA] Loading PCA full data...');
        const res = await fetch('/api/pca/full', {
          cache: 'force-cache', // 브라우저 캐시 활용
        });
        
        if (cancelled) return;
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to load PCA data: ${res.status} ${errorText}`);
        }
        
        const data = await res.json();
        console.log('[PcaKMeansChartA] PCA full data loaded:', {
          version: data.version,
          max_components: data.max_components,
          n_samples: data.n_samples,
          cache: res.headers.get('X-Cache'),
          etag: res.headers.get('ETag'),
        });
        
        if (!cancelled) {
          setPcaFullData(data);
          setLoading(false);
          setError(null);
        }
      } catch (e: any) {
        console.error('[PcaKMeansChartA] Failed to load PCA data:', e);
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

  // k 변경 시 클라이언트에서 K-Means 계산 (즉시 반영)
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
      const clusterMask = labels.map(l => l === clusterId);
      const clusterIndices = clusterMask.map((m, i) => m ? i : -1).filter(i => i >= 0);
      const clusterDevices = clusterIndices.map(i => pcaFullData.devices[i]);
      clusterStats.push({
        cluster: clusterId,
        count: clusterIndices.length,
        devices: clusterDevices,
        averages: {}, // 원본 데이터가 없으므로 생략
      });
    }

    // 여러 k 값에 대한 Silhouette과 Elbow 계산 (메모이제이션 고려)
    const maxK = Math.min(10, Math.floor(pca2D.length / 2));
    const kRange = Array.from({ length: maxK - 1 }, (_, i) => i + 2);
    const silhouetteScores: number[] = [];
    const wcssValues: number[] = [];

    for (const testK of kRange) {
      const { labels: testLabels, centroids: testCentroids } = kmeans(pca2D, testK, 300, 42);
      const silScore = silhouetteScore(pca2D, testLabels);
      const wcss = calculateWCSS(pca2D, testLabels, testCentroids);
      silhouetteScores.push(silScore);
      wcssValues.push(wcss);
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

  // 차종 정보 로드
  useEffect(() => {
    if (!clusterStats || clusterStats.length === 0) return;

    const allDeviceNos = clusterStats.flatMap(stat => stat.devices || []);
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

  // 차트 데이터셋 생성
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
    
    const clusterSets: ChartDataset<'scatter', ScatterPt[]>[] =
      [...groups.entries()].map(([c, pts]) => {
        const color = CLUSTER_COLORS[c % CLUSTER_COLORS.length];
        return {
          label: `cluster ${c + 1}`,
          data: pts,
          pointBackgroundColor: color.bg,
          pointBorderColor: color.border,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          pointBorderWidth: 0.5,
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
                const scale = 3;
                const originalWidth = canvas.width;
                const originalHeight = canvas.height;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = originalWidth * scale;
                tempCanvas.height = originalHeight * scale;
                const ctx = tempCanvas.getContext('2d');

                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                  ctx.imageSmoothingEnabled = true;
                  ctx.imageSmoothingQuality = 'high';

                  ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

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
            devicePixelRatio: 2,
            animation: false, // 즉시 반영을 위해 애니메이션 비활성화
            plugins: {
              title: {
                display: true,
                text: `K-means Clusters (K=${k}) - Client-side Calculation`,
                font: { size: 12, weight: 'bold' },
                color: '#000000',
                padding: { top: 10, bottom: 10 },
              },
              legend: {
                position: 'top',
                align: 'center',
                labels: {
                  color: '#000000',
                  font: { size: 11 },
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
                  font: { size: 11, weight: 'normal' },
                  padding: { top: 5, bottom: 5 },
                },
                ticks: {
                  color: '#000000',
                  font: { size: 10 },
                  padding: 2,
                },
                grid: {
                  color: '#e5e7eb',
                  lineWidth: 0.5,
                },
                backgroundColor: '#ffffff',
                min: scaleRanges.xMin,
                max: scaleRanges.xMax,
              },
              y: {
                title: {
                  display: true,
                  text: `PC2 (${(evr[1] * 100).toFixed(2)}%)`,
                  color: '#000000',
                  font: { size: 11, weight: 'normal' },
                  padding: { top: 5, bottom: 5 },
                },
                ticks: {
                  color: '#000000',
                  font: { size: 10 },
                  padding: 2,
                },
                grid: {
                  color: '#e5e7eb',
                  lineWidth: 0.5,
                },
                backgroundColor: '#ffffff',
                min: scaleRanges.yMin,
                max: scaleRanges.yMax,
              },
            },
          }}
          plugins={[centroidLabelPlugin]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Silhouette Score 그래프 */}
        <div className="rounded-2xl shadow p-4 bg-white">
          <Line
            data={{
              labels: (silhouetteData?.kValues || []).map(k => `k=${k}`),
              datasets: [
                {
                  label: 'Silhouette Score',
                  data: silhouetteData?.scores || [],
                  borderColor: 'rgb(99, 102, 241)',
                  backgroundColor: 'rgba(99, 102, 241, 0.5)',
                  tension: 0.3,
                  fill: true,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: {
                  display: true,
                  text: 'Silhouette Score (높을수록 좋음)',
                  font: { size: 12, weight: 'bold' },
                  color: '#000000',
                },
                legend: {
                  display: false,
                },
              },
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Number of Clusters (k)',
                    color: '#000000',
                    font: { size: 11, weight: 'normal' },
                  },
                  ticks: { color: '#000000', font: { size: 10 } },
                  grid: { color: '#e5e7eb', lineWidth: 0.5 },
                },
                y: {
                  title: {
                    display: true,
                    text: 'Silhouette Score',
                    color: '#000000',
                    font: { size: 11, weight: 'normal' },
                  },
                  ticks: { color: '#000000', font: { size: 10 } },
                  grid: { color: '#e5e7eb', lineWidth: 0.5 },
                  min: -1,
                  max: 1,
                },
              },
            }}
          />
        </div>

        {/* Elbow Method 그래프 */}
        <div className="rounded-2xl shadow p-4 bg-white">
          <Line
            data={{
              labels: (elbowData?.kValues || []).map(k => `k=${k}`),
              datasets: [
                {
                  label: 'WCSS',
                  data: elbowData?.wcssValues || [],
                  borderColor: 'rgb(16, 185, 129)',
                  backgroundColor: 'rgba(16, 185, 129, 0.5)',
                  tension: 0.3,
                  fill: true,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                title: {
                  display: true,
                  text: 'Elbow Method (WCSS)',
                  font: { size: 12, weight: 'bold' },
                  color: '#000000',
                },
                legend: {
                  display: false,
                },
              },
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Number of Clusters (k)',
                    color: '#000000',
                    font: { size: 11, weight: 'normal' },
                  },
                  ticks: { color: '#000000', font: { size: 10 } },
                  grid: { color: '#e5e7eb', lineWidth: 0.5 },
                },
                y: {
                  title: {
                    display: true,
                    text: 'Within-Cluster Sum of Squares (WCSS)',
                    color: '#000000',
                    font: { size: 11, weight: 'normal' },
                  },
                  ticks: { color: '#000000', font: { size: 10 } },
                  grid: { color: '#e5e7eb', lineWidth: 0.5 },
                },
              },
            }}
          />
        </div>
      </div>

      {/* 클러스터 통계 */}
      {clusterStats && clusterStats.length > 0 && (
        <div className="rounded-2xl shadow p-4 bg-white">
          <h2 className="text-xl font-semibold mb-4">클러스터 통계</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusterStats.map((stat, idx) => {
              const color = CLUSTER_COLORS[stat.cluster % CLUSTER_COLORS.length];
              return (
                <div key={stat.cluster} className="border rounded-lg p-4" style={{ borderColor: color.border }}>
                  <h3 className="text-lg font-bold mb-2" style={{ color: color.border }}>
                    클러스터 {stat.cluster + 1} ({stat.count} 디바이스)
                  </h3>
                  {stat.devices && stat.devices.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-600 mb-1">
                        디바이스 목록 ({stat.devices.length}개):
                      </p>
                      <div className="flex flex-wrap gap-1 text-xs">
                        {stat.devices.map(deviceNo => (
                          <span key={deviceNo} className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                            {deviceNo} {deviceCarTypes[deviceNo] ? `(${deviceCarTypes[deviceNo]})` : ''}
                          </span>
                        ))}
                      </div>
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

