import 'server-only';
import { NextResponse } from 'next/server';
import { loadPcaFull, checkPcaFullFile } from '@/lib/pca-cache';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'node:path';
import { stat } from 'node:fs/promises';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PCA 전체 결과를 반환하는 엔드포인트 (A안)
 * 한 번만 로드하고 클라이언트에서 k별로 slice
 */
export async function GET(req: Request) {
  try {
    // 1. 메모리 캐시 또는 파일에서 로드
    const cached = await loadPcaFull();
    
    if (!cached) {
      // 파일이 없으면 생성 스크립트 실행
      const csvPath = path.join(process.cwd(), 'metrics.csv');
      const scriptPath = path.join(process.cwd(), 'scripts', 'generate_pca_full.py');
      
      try {
        const csvStats = await stat(csvPath);
        const scriptStats = await stat(scriptPath);
        
        // CSV 파일이 있고 스크립트가 있으면 실행
        if (csvStats && scriptStats) {
          console.log('[pca/full] Generating pca_full.json...');
          const { stdout, stderr } = await execAsync(`python3 "${scriptPath}"`, {
            cwd: process.cwd(),
            maxBuffer: 50 * 1024 * 1024, // 50MB
          });
          
          if (stdout) {
            console.log('[pca/full] Script output:', stdout.substring(0, 500));
          }
          
          if (stderr && !stderr.includes('warnings') && !stderr.includes('NumPy')) {
            console.warn('[pca/full] Script stderr:', stderr.substring(0, 500));
          }
          
          // 다시 로드 시도
          const retryCached = await loadPcaFull();
          if (retryCached) {
            return NextResponse.json(retryCached.data, {
              headers: {
                'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
                'Content-Type': 'application/json',
                'ETag': retryCached.etag,
                'X-Cache': 'generated',
              },
            });
          }
        }
      } catch (error: any) {
        console.error('[pca/full] Failed to generate pca_full.json:', error.message);
      }
      
      return NextResponse.json(
        { error: 'PCA full data not found. Please run scripts/generate_pca_full.py first.' },
        { status: 404 }
      );
    }

    // 2. ETag 검증 (If-None-Match 헤더 확인)
    const ifNoneMatch = req.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      return new NextResponse(null, { status: 304 }); // Not Modified
    }

    // 3. 응답 반환
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
        'Content-Type': 'application/json',
        'ETag': cached.etag,
        'X-Cache': 'hit',
      },
    });
  } catch (e: any) {
    console.error('[api] pca/full error:', e?.message || e);
    return NextResponse.json({ error: 'failed to load PCA full data' }, { status: 500 });
  }
}

