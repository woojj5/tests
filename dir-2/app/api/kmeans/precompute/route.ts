import 'server-only';
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { setCachedResult } from '@/lib/kmeans-cache';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Semaphore: 동시에 최대 3개까지만 Python 스크립트 실행
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

// 전역 Semaphore 인스턴스
const computeSemaphore = new Semaphore(3); // Python 실행은 CPU 집약적이므로 3개로 제한
const loadSemaphore = new Semaphore(5); // 파일 로드는 5개로 제한

async function getFileModTime(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

// 백그라운드 작업 실행 함수
async function runPrecomputation() {
  const csvPath = path.join(process.cwd(), 'metrics.csv');
  const scriptPath = path.join(process.cwd(), 'scripts', 'run_kmeans.py');
  
  // CSV 파일 수정 시간 확인
  const csvModTime = await getFileModTime(csvPath);
  const maxK = 117;
  
  // 1. 메모리 캐시 확인 (k=1~117 모두 있는지)
  const { getCachedResult } = await import('@/lib/kmeans-cache');
  let cachedCount = 0;
  for (let k = 1; k <= maxK; k++) {
    if (getCachedResult(k)) {
      cachedCount++;
    }
  }
  
  console.log(`[precompute] Memory cache status: ${cachedCount}/${maxK} results cached`);
  
  // 메모리 캐시가 모두 있으면 실행하지 않음
  if (cachedCount === maxK) {
    console.log(`[precompute] All results (k=1~${maxK}) already in memory cache. Skipping.`);
    return;
  }
  
  // 2. JSON 파일 확인 및 메모리 캐시에 로드 (캐시에 없는 것만)
  console.log(`[precompute] Loading JSON files into memory cache...`);
  
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
          if (k <= 10) {
            console.warn(`[precompute] File not found or invalid for k=${k}:`, error.message);
          }
          return { status: 'missing', k };
        }
      } finally {
        loadSemaphore.release();
      }
    })();
    
    loadTasks.push(loadTask);
  }
  
  // 모든 로드 작업 완료 대기 후 결과 집계
  const loadResults = await Promise.all(loadTasks);
  
  const loaded = loadResults.filter(r => r.status === 'loaded').length;
  const skipped = loadResults.filter(r => r.status === 'skipped').length;
  const missing = loadResults.filter(r => r.status === 'missing').length;
  
  console.log(`[precompute] Cache loading complete: ${loaded} loaded, ${skipped} already cached, ${missing} missing/outdated`);
  
  // 모든 파일이 메모리 캐시에 로드되었으면 종료
  if (loaded + skipped === maxK) {
    console.log(`[precompute] All available results loaded into memory cache.`);
    return;
  }
  
  // 4. JSON 파일이 없으면 백그라운드로 계산
  
  console.log(`[precompute] Starting background computation for missing k values...`);
  
  // 각 작업이 독립적으로 실행되고 결과를 반환하도록 수정
  const computeTasks = [];
  
  for (let k = 1; k <= maxK; k++) {
    const outputPath = path.join(process.cwd(), `kmeans_result_k${k}.json`);
    
    // 결과 파일이 이미 있고 CSV보다 최신이면 스킵
    try {
      const resultModTime = await getFileModTime(outputPath);
      if (resultModTime > csvModTime) {
        // 파일이 있으면 메모리 캐시에도 로드 (아직 없을 수 있음)
        const loadTask = (async (): Promise<{ status: 'skipped', k: number }> => {
          await loadSemaphore.acquire();
          try {
            const resultJson = await fs.readFile(outputPath, 'utf-8');
            const result = JSON.parse(resultJson);
            if (result.points && result.labels && result.centroids) {
              setCachedResult(k, result);
            }
          } catch {
            // 캐시 로드 실패해도 계속 진행
          } finally {
            loadSemaphore.release();
          }
          return { status: 'skipped', k };
        })();
        
        computeTasks.push(loadTask);
        continue;
      }
    } catch {
      // 파일이 없으면 계산
    }
    
    // Semaphore를 사용하여 동시 Python 실행 제한
    const computeTask = (async (): Promise<{ status: 'computed' | 'error', k: number }> => {
      await computeSemaphore.acquire();
      try {
        // Python 스크립트 실행 (백그라운드)
        // Python 스크립트 내부에서도 캐시 체크하므로 중복 체크는 안전
        await execAsync(`python3 "${scriptPath}" ${k}`, {
          cwd: process.cwd(),
          maxBuffer: 10 * 1024 * 1024,
        });
        
        // 계산 완료 후 메모리 캐시에 로드
        await loadSemaphore.acquire();
        try {
          const resultJson = await fs.readFile(outputPath, 'utf-8');
          const result = JSON.parse(resultJson);
          if (result.points && result.labels && result.centroids) {
            setCachedResult(k, result);
          }
        } catch {
          // 캐시 로드 실패해도 계속 진행
        } finally {
          loadSemaphore.release();
        }
        
        return { status: 'computed', k };
      } catch (error: any) {
        // stderr에 NumPy 경고가 있어도 무시 (실제 오류만 로깅)
        if (!error.stderr?.includes('NumPy')) {
          console.error(`[precompute] Error computing k=${k}:`, error.message);
        }
        return { status: 'error', k };
      } finally {
        computeSemaphore.release();
      }
    })();
    
    computeTasks.push(computeTask);
  }
  
  // 모든 계산 작업 완료 대기 후 결과 집계
  const computeResults = await Promise.all(computeTasks);
  
  const computed = computeResults.filter(r => r.status === 'computed').length;
  const computedSkipped = computeResults.filter(r => r.status === 'skipped').length;
  const errors = computeResults.filter(r => r.status === 'error').length;
  
  // 진행 상황 로깅
  if (computed > 0 || computedSkipped > 0) {
    console.log(`[precompute] Progress update: ${computed} computed, ${computedSkipped} skipped, ${errors} errors`);
  }
  
  console.log(`[precompute] Finished: ${computed} computed, ${computedSkipped} skipped, ${errors} errors out of ${maxK} total`);
}

export async function POST() {
  try {
    // 즉시 응답을 보내고 백그라운드에서 실행
    // Promise를 await하지 않아서 응답이 블로킹되지 않음
    runPrecomputation().catch((e) => {
      console.error('[precompute] Background task error:', e);
    });
    
    return NextResponse.json({
      message: 'Precomputation started in background',
      total: 117,
      status: 'running',
    });
  } catch (e: any) {
    console.error('[precompute] error:', e?.message || e);
    return NextResponse.json({ error: 'failed to start precomputation' }, { status: 500 });
  }
}

