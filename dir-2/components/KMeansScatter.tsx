'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { MetricRow } from '@/lib/metrics';

type Props = { rows?: MetricRow[] };

const NUM_FIELDS: (keyof MetricRow)[] = [
  'distance_km','avg_soc_per_km','idle_pct','chg_slow_pct','chg_fast_pct',
  'discharge_pct','cell_imbalance_mv','temp_range'
];

// --- 유틸: 결측 제거 + 선택 피처 벡터 생성
function buildMatrix(rows: MetricRow[], features: (keyof MetricRow)[]) {
  const data: { id: string; vec: number[]; x: number; y: number; car?: string }[] = [];
  for (const r of rows) {
    const vals = features.map(f => r[f]);
    if (vals.every(v => typeof v === 'number' && Number.isFinite(v))) {
      data.push({
        id: r.device,
        vec: vals as number[],
        x: r[features[0]] as number,
        y: r[features[1]] as number,
        car: r.car_type,
      });
    }
  }
  return data;
}

function zscore2D(points: {vec:number[]}[]) {
  const n = points.length;
  if (!n) return { points, mu:[0,0], sigma:[1,1] };
  const d = points[0].vec.length;
  const mu = new Array(d).fill(0);
  for (const p of points) for (let j=0;j<d;j++) mu[j]+=p.vec[j];
  for (let j=0;j<d;j++) mu[j]/=n;

  const varr = new Array(d).fill(0);
  for (const p of points) for (let j=0;j<d;j++) { const t=p.vec[j]-mu[j]; varr[j]+=t*t; }
  const sigma = varr.map(v => Math.sqrt(v/n) || 1);

  const normed = points.map(p => ({...p, vec: p.vec.map((v,j)=>(v-mu[j])/sigma[j])}));
  return { points: normed, mu, sigma };
}

// --- 간단 KMeans (k-means++)
function kmeans(points: number[][], k: number, maxIter=100): {labels:number[]; centroids:number[][]} {
  const n = points.length, d = points[0].length;
  // k-means++ 초기화
  const centroids: number[][] = [];
  centroids.push(points[Math.floor(Math.random()*n)]);
  while (centroids.length < k) {
    const dist2 = points.map(p => {
      let m = Infinity;
      for (const c of centroids) {
        let s=0; for (let j=0;j<d;j++){ const t=p[j]-c[j]; s+=t*t; }
        if (s<m) m=s;
      }
      return m;
    });
    const sum = dist2.reduce((a,b)=>a+b,0) || 1;
    let r = Math.random()*sum;
    let idx = 0;
    for (let i=0;i<n;i++){ r-=dist2[i]; if (r<=0){ idx=i; break; } }
    centroids.push(points[idx]);
  }

  const labels = new Array(n).fill(0);
  for (let it=0; it<maxIter; it++){
    // assign
    let changed = false;
    for (let i=0;i<n;i++){
      let best = 0, bestD = Infinity;
      for (let c=0;c<k;c++){
        let s=0; for (let j=0;j<d;j++){ const t=points[i][j]-centroids[c][j]; s+=t*t; }
        if (s<bestD){ bestD=s; best=c; }
      }
      if (labels[i]!==best){ labels[i]=best; changed = true; }
    }
    // update
    const sumC = Array.from({length:k}, ()=>new Array(d).fill(0));
    const cntC = new Array(k).fill(0);
    for (let i=0;i<n;i++){ const c=labels[i]; cntC[c]++; for (let j=0;j<d;j++) sumC[c][j]+=points[i][j]; }
    for (let c=0;c<k;c++){
      if (cntC[c]===0) continue;
      for (let j=0;j<d;j++) centroids[c][j] = sumC[c][j]/cntC[c];
    }
    if (!changed) break;
  }
  return { labels, centroids };
}

export default function KMeansScatter({ rows: rowsProp }: Props) {
  // rows prop이 없으면 API에서 로드
  const [rows, setRows] = useState<MetricRow[]>(rowsProp || []);
  const [loading, setLoading] = useState(!rowsProp);
  const [k, setK] = useState(3);
  const [xField, setXField] = useState<keyof MetricRow>('distance_km');
  const [yField, setYField] = useState<keyof MetricRow>('avg_soc_per_km');
  const [normalize, setNormalize] = useState(true);

  useEffect(() => {
    if (rowsProp) return; // prop이 있으면 API 호출 불필요
    const load = async () => {
      try {
        const res = await fetch('/api/metrics', { cache: 'default' });
        if (res.ok) {
          const json = await res.json();
          setRows(json.rows || []);
        }
      } catch (e) {
        console.error('Failed to load metrics:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [rowsProp]);

  // 모든 hooks를 먼저 호출한 후 조건부 렌더링
  if (loading) {
    return <div className="p-4 text-center">데이터 로딩 중...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-4 text-center text-gray-500">데이터가 없습니다.</div>;
  }

  const { clusters, centroids2D } = useMemo(()=>{
    const feats: (keyof MetricRow)[] = [xField, yField];
    const filtered = buildMatrix(rows, feats);
    if (filtered.length === 0) return { clusters: [] as any[], centroids2D: [] as any[] };

    // 정규화 선택
    const basePoints = filtered.map(f => ({ vec:[f.x, f.y] }));
    const normed = normalize ? zscore2D(basePoints).points.map(p=>p.vec) : basePoints.map(p=>p.vec);

    // kmeans 실행
    const kk = Math.max(1, Math.min(k, filtered.length));
    const { labels, centroids } = kmeans(normed, kk, 100);

    // 시각화용 데이터 분리
    const out: { name: string; data: { x:number; y:number; device:string; car?:string }[] }[] = [];
    for (let c=0;c<kk;c++) out.push({ name:`Cluster ${c+1}`, data: []});
    for (let i=0;i<filtered.length;i++){
      const c = labels[i];
      out[c].data.push({ x: filtered[i].x, y: filtered[i].y, device: filtered[i].id, car: filtered[i].car });
    }

    const centroids2D = centroids.map(v => ({ x: normalize ? v[0] : v[0], y: normalize ? v[1] : v[1] }));
    return { clusters: out, centroids2D };
  }, [rows, k, xField, yField, normalize]);

  // 툴팁
  const tooltipFmt = (v: number) => Number.isFinite(v) ? v.toFixed(3) : String(v);

  return (
    <div className="space-y-3">
      {/* 컨트롤 */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">클러스터 수 (k)</label>
          <input
            type="number" min={1} className="px-3 py-2 border rounded-lg w-28"
            value={k} onChange={(e)=>setK(Math.max(1, Number(e.target.value)||1))}
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">X 축</label>
          <select className="px-3 py-2 border rounded-lg"
                  value={xField} onChange={e=>setXField(e.target.value as keyof MetricRow)}>
            {NUM_FIELDS.map(f=> <option key={String(f)} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-zinc-500">Y 축</label>
          <select className="px-3 py-2 border rounded-lg"
                  value={yField} onChange={e=>setYField(e.target.value as keyof MetricRow)}>
            {NUM_FIELDS.map(f=> <option key={String(f)} value={f}>{f}</option>)}
          </select>
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={normalize} onChange={e=>setNormalize(e.target.checked)} />
          <span className="text-sm">표준화(z-score)</span>
        </label>
      </div>

      {/* 산점도 */}
      <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
        <div className="text-sm text-zinc-700 dark:text-zinc-200 mb-2">
          K-Means Scatter ({String(xField)} vs {String(yField)})
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name={String(xField)} />
              <YAxis dataKey="y" name={String(yField)} />
              <Tooltip
                formatter={(v:any)=>tooltipFmt(v)}
                labelFormatter={() => ''}
                contentStyle={{ whiteSpace: 'pre' }}
              />
              <Legend />
              {clusters.map((c, idx) => (
                <Scatter key={idx} name={c.name} data={c.data} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-zinc-500 mt-2">
          점 위에 마우스를 올리면 <b>device</b> / <b>car_type</b> 정보를 툴팁으로 확인할 수 있어요.
        </div>
      </div>
    </div>
  );
}
