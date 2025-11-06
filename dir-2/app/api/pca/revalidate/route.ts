import 'server-only';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PCA 캐시 무효화 엔드포인트
 * 새 PCA 데이터 배포 시 호출하여 캐시를 갱신
 */
export async function POST(req: Request) {
  try {
    // Next.js ISR 태그 무효화
    revalidateTag('pca');
    
    // 메모리 캐시도 무효화
    const { clearPcaCache } = await import('@/lib/pca-cache');
    clearPcaCache();
    
    return NextResponse.json({
      message: 'PCA cache invalidated',
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[api] pca/revalidate error:', e?.message || e);
    return NextResponse.json({ error: 'failed to revalidate PCA cache' }, { status: 500 });
  }
}

