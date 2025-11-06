// app/metrics-pca-a/page.tsx (A안 테스트 페이지)
import dynamic from 'next/dynamic';

// A안 컴포넌트 동적 로딩
const PcaKMeansChartA = dynamic(() => import('@/components/PcaKMeansChartA'), { 
  ssr: false,
  loading: () => <div className="p-4 text-center">차트 로딩 중...</div>,
});

export const revalidate = 300; // ISR: 5분마다 재검증

export default async function MetricsPcaAPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-semibold">Metrics K-Means Cluster (PCA 2D) - A안</h1>
        <p className="text-sm text-gray-600 mt-2">
          한 번만 로드하고 클라이언트에서 k별로 즉시 계산 (네트워크 호출 없음)
        </p>
      </div>
      <PcaKMeansChartA />
    </div>
  );
}

