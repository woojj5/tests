import dynamic from 'next/dynamic';

const KMeansScatter = dynamic(() => import('@/components/KMeansScatter'), { 
  ssr: false,
  loading: () => <div className="p-4 text-center">차트 로딩 중...</div>,
});

export const revalidate = 300; // ISR: 5분마다 재검증

export default async function MetricsClusterPage() {
  // 클라이언트에서 직접 API 호출하도록 변경 (서버 부하 감소)
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Metrics K-Means Cluster</h1>
      <KMeansScatter />
    </div>
  );
}
