// app/api/admin/revalidate-overview/route.ts
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 관련 캐시 태그 전부 무효화
    const tags = ['overview', 'fields', 'fields-per-type'];
    tags.forEach(tag => {
      revalidateTag(tag);
      console.log(`[CACHE INVALIDATED] tag: ${tag}`);
    });

    return NextResponse.json({
      ok: true,
      message: 'overview caches invalidated',
      tags: tags,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[api] revalidate-overview error:', e?.message || e);
    return NextResponse.json(
      { error: 'failed to revalidate overview caches' },
      { status: 500 }
    );
  }
}

