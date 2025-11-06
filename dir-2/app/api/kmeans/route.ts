import 'server-only';
import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { getCachedResult, setCachedResult } from '@/lib/kmeans-cache';

const execAsync = promisify(exec);

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

    const csvPath = path.join(process.cwd(), 'metrics.csv');
    const scriptPath = path.join(process.cwd(), 'scripts', 'run_kmeans.py');
    const outputPath = path.join(process.cwd(), `kmeans_result_k${k}.json`);

    // 1. 메모리 캐시 확인
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

    // 2. 파일 캐시 확인 (CSV보다 최신이면 재사용) - Python 실행 전에 빠르게 반환
    try {
      const csvModTime = await getFileModTime(csvPath);
      const resultModTime = await getFileModTime(outputPath);
      
      if (resultModTime > csvModTime) {
        // 캐시된 결과가 있으면 즉시 반환 (Python 실행 없이)
        const resultJson = await fs.readFile(outputPath, 'utf-8');
        const result = JSON.parse(resultJson);
        
        // 필수 필드 검증
        if (result.points && result.labels && result.centroids) {
          // 메모리 캐시에 저장
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
    } catch {
      // 파일이 없으면 새로 계산
    }

    // 3. Python 스크립트 실행 (캐시가 없을 때만)
    try {
      console.log(`[kmeans] Running Python script with k=${k}`);
      const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" ${k}`, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      
      if (stdout) {
        console.log('[kmeans] Python stdout:', stdout.substring(0, 500)); // 처음 500자만
      }
      
      if (stderr && !stderr.includes('warnings') && !stderr.includes('NumPy')) {
        console.warn('[kmeans] Python stderr:', stderr.substring(0, 500));
      }
    } catch (error: any) {
      console.error('[kmeans] Python execution error:', error.message);
      console.error('[kmeans] Full error:', error);
      return NextResponse.json(
        { error: 'Failed to run Python script', details: error.message, stdout: error.stdout, stderr: error.stderr },
        { status: 500 }
      );
    }

    // 4. 결과 파일 읽기
    try {
      console.log(`[kmeans] Reading result file: ${outputPath}`);
      const resultJson = await fs.readFile(outputPath, 'utf-8');
      const result = JSON.parse(resultJson);
      
      // 필수 필드 확인
      if (!result.points || !result.labels || !result.centroids) {
        console.error('[kmeans] Invalid result structure:', Object.keys(result));
        return NextResponse.json(
          { error: 'Invalid result structure', keys: Object.keys(result) },
          { status: 500 }
        );
      }
      
      console.log(`[kmeans] Successfully loaded result: ${result.points.length} points, ${result.centroids.length} centroids`);
      
      // 메모리 캐시에 저장
      setCachedResult(k, result);
      
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
          'Content-Type': 'application/json',
          'X-Cache': 'miss',
        },
      });
    } catch (error: any) {
      console.error('[kmeans] Failed to read result file:', error.message);
      console.error('[kmeans] File path:', outputPath);
      return NextResponse.json(
        { error: 'Failed to read result file', details: error.message, path: outputPath },
        { status: 500 }
      );
    }
  } catch (e: any) {
    console.error('[api] kmeans error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

