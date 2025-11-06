import 'server-only';
import { NextResponse } from 'next/server';
import { getCachedResult, setCachedResult } from '@/lib/kmeans-cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stat } from 'node:fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Semaphore: 동시에 최대 5개까지만 파일 로드
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

// 전역 Semaphore 인스턴스 (동시 로드 제한)
const loadSemaphore = new Semaphore(5);

async function getFileModTime(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

export async function POST() {
  try {
    const csvPath = path.join(process.cwd(), 'metrics.csv');
    const csvModTime = await getFileModTime(csvPath);
    const maxK = 117;
    
    // 각 작업이 독립적으로 실행되고 결과를 반환하도록 수정
    const loadTasks = [];
    
    for (let k = 1; k <= maxK; k++) {
      // 이미 메모리 캐시에 있으면 스킵
      if (getCachedResult(k)) {
        loadTasks.push(Promise.resolve({ status: 'skipped', k }));
        continue;
      }
      
      // Semaphore를 사용하여 동시 로드 제한
      const loadTask = (async (): Promise<{ status: 'loaded' | 'missing' | 'skipped', k: number }> => {
        await loadSemaphore.acquire();
        try {
          const outputPath = path.join(process.cwd(), `kmeans_result_k${k}.json`);
          
          try {
            const resultModTime = await getFileModTime(outputPath);
            
            // 파일이 있고 CSV보다 최신이면 메모리 캐시에 로드
            if (resultModTime > csvModTime) {
              const resultJson = await fs.readFile(outputPath, 'utf-8');
              const result = JSON.parse(resultJson);
              
              // 필수 필드 검증
              if (result.points && result.labels && result.centroids) {
                setCachedResult(k, result);
                return { status: 'loaded', k };
              } else {
                return { status: 'missing', k };
              }
            } else {
              return { status: 'missing', k };
            }
          } catch (error: any) {
            return { status: 'missing', k };
          }
        } finally {
          loadSemaphore.release();
        }
      })();
      
      loadTasks.push(loadTask);
    }
    
    // 모든 로드 작업 완료 대기 후 결과 집계
    const results = await Promise.all(loadTasks);
    
    const loaded = results.filter(r => r.status === 'loaded').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const missing = results.filter(r => r.status === 'missing').length;
    
    return NextResponse.json({
      message: 'Cache loading completed',
      loaded,
      skipped,
      missing,
      total: maxK,
      cached: loaded + skipped,
    });
  } catch (e: any) {
    console.error('[api] kmeans/load-cache error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const maxK = 117;
    let cachedCount = 0;
    
    for (let k = 1; k <= maxK; k++) {
      if (getCachedResult(k)) {
        cachedCount++;
      }
    }
    
    return NextResponse.json({
      cached: cachedCount,
      total: maxK,
      percentage: ((cachedCount / maxK) * 100).toFixed(1),
    });
  } catch (e: any) {
    console.error('[api] kmeans/load-cache error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

