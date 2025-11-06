import 'server-only';
export const runtime = 'nodejs';
// 동적 렌더링: 빌드 타임 정적 생성 제외 (데이터 로딩 시간이 길어서 타임아웃 방지)
export const dynamic = 'force-dynamic';
// ISR 대신 런타임 캐싱 사용 (서버 컴포넌트 캐시 활용)

import { getDistanceRankingExactIncludingZeroCached } from '@/lib/database';
import RankingTable from '@/components/RankingTable';

export default async function RankingPage() {
  const rows = await getDistanceRankingExactIncludingZeroCached(500); // 0km 포함, 캐싱 적용
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">
        주행거리 랭킹 (2022-12-01 ~ 2023-08-31, KST)
      </h1>
      <RankingTable rows={rows} />
    </div>
  );
}
