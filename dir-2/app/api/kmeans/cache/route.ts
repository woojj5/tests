import 'server-only';
import { NextResponse } from 'next/server';
import { getCachedResult, setCachedResult } from '@/lib/kmeans-cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stat } from 'node:fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getFileModTime(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const k = parseInt(searchParams.get('k') || '3', 10);
    
    if (k < 1 || k > 117) {
      return NextResponse.json({ error: 'k must be between 1 and 117' }, { status: 400 });
    }

    // 1. 메모리 캐시에서 직접 가져오기 (가장 빠름)
    const cached = getCachedResult(k);
    
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
          'Content-Type': 'application/json',
          'X-Cache': 'memory',
        },
      });
    }
    
    // 2. 메모리 캐시에 없으면 파일 캐시에서 로드 (빠른 폴백)
    const csvPath = path.join(process.cwd(), 'metrics.csv');
    const outputPath = path.join(process.cwd(), `kmeans_result_k${k}.json`);
    
    try {
      const csvModTime = await getFileModTime(csvPath);
      const resultModTime = await getFileModTime(outputPath);
      
      if (resultModTime > csvModTime) {
        // 파일 캐시가 있으면 메모리 캐시에 로드하고 반환
        const resultJson = await fs.readFile(outputPath, 'utf-8');
        const result = JSON.parse(resultJson);
        
        if (result.points && result.labels && result.centroids) {
          // 메모리 캐시에 저장 (다음 요청을 위해)
          setCachedResult(k, result);
          
          return NextResponse.json(result, {
            headers: {
              'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
              'Content-Type': 'application/json',
              'X-Cache': 'file',
            },
          });
        }
      }
    } catch (error: any) {
      // 파일이 없거나 읽기 실패
    }
    
    // 파일 캐시도 없으면 404 (다른 API로 폴백)
    return NextResponse.json({ error: 'Not in cache', fallback: true }, { status: 404 });
  } catch (e: any) {
    console.error('[api] kmeans/cache error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

