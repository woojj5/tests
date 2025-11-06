// app/metrics-pca/page.tsx
import dynamic from 'next/dynamic';

// 클라이언트 컴포넌트는 동적 로딩 (SSR 비활성화)
const PcaKMeansChart = dynamic(() => import('@/components/PcaKMeansChart'), { 
  ssr: false,
  loading: () => <div className="p-4 text-center">차트 로딩 중...</div>,
});

export const revalidate = 300; // ISR: 5분마다 재검증

export default async function MetricsPcaPage() {
  // 클라이언트에서 직접 API 호출하도록 변경 (서버 부하 감소)
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Metrics K-Means Cluster (PCA 2D)</h1>
      <PcaKMeansChart />
    </div>
  );
}
