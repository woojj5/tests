# A안 구현 가이드: PCA 한 번 로드 → 클라이언트 Slice

## 개요

A안은 PCA 전체 결과를 한 번만 서버에서 로드하고, 클라이언트에서 k 값 변경 시 네트워크 호출 없이 즉시 계산하여 반영하는 방식입니다.

## 주요 변경사항

### 1. 파일 구조

```
dir/
├── scripts/
│   └── generate_pca_full.py          # 새로 추가: 전체 PCA 결과 생성
├── lib/
│   └── pca-cache.ts                   # 새로 추가: PCA 전역 캐시 관리
├── app/
│   ├── api/
│   │   └── pca/
│   │       ├── full/
│   │       │   └── route.ts           # 새로 추가: PCA 전체 결과 API
│   │       └── revalidate/
│   │           └── route.ts           # 새로 추가: 캐시 무효화
│   └── metrics-pca-a/
│       └── page.tsx                    # 새로 추가: A안 테스트 페이지
└── components/
    └── PcaKMeansChartA.tsx            # 새로 추가: A안 컴포넌트
```

### 2. 구현 단계

#### Step 1: PCA 전체 데이터 생성 스크립트

**파일**: `scripts/generate_pca_full.py`

```python
# PCA를 최대 117차원까지 계산
pca = PCA(n_components=max_components)  # max_components = min(117, n_samples, n_features)
X_pca = pca.fit_transform(X_scaled)

# 결과를 JSON으로 저장
result = {
    'version': 1,
    'max_components': max_components,
    'components': X_pca.tolist(),  # 117×n_samples
    'explained_variance_ratio': evr.tolist(),
    'explained_variance_cumsum': cumsum.tolist(),
    'devices': devices.tolist(),
    'car_types': car_types.tolist(),
}
```

**실행 방법**:
```bash
cd /mnt/hdd1/jeon/dir
python3 scripts/generate_pca_full.py
```

#### Step 2: API 엔드포인트

**파일**: `app/api/pca/full/route.ts`

- **캐시 전략**:
  - 메모리 캐시: 서버 프로세스 전역 싱글톤 (`lib/pca-cache.ts`)
  - 파일 캐시: `pca_full.json` 파일
  - HTTP 캐시: `Cache-Control: public, max-age=60, s-maxage=300`
  - ETag: 파일 내용 기반 해시

- **응답 형식**:
```json
{
  "version": 1,
  "max_components": 117,
  "n_samples": 117,
  "components": [[...], [...], ...],  // 117×n_samples
  "explained_variance_ratio": [0.374, 0.245, ...],
  "explained_variance_cumsum": [0.374, 0.619, ...],
  "devices": ["device1", "device2", ...],
  "car_types": ["car1", "car2", ...]
}
```

#### Step 3: 클라이언트 컴포넌트

**파일**: `components/PcaKMeansChartA.tsx`

**주요 특징**:
- 마운트 시 `/api/pca/full` 1회만 호출 (`cache: 'force-cache'`)
- k 변경 시 `useMemo`로 클라이언트에서 즉시 계산
- 네트워크 호출 없음 → **p95 < 50ms 달성**

**코드 흐름**:
```typescript
// 1. 마운트 시 한 번만 로드
useEffect(() => {
  fetch('/api/pca/full', { cache: 'force-cache' })
    .then(res => res.json())
    .then(data => setPcaFullData(data));
}, []); // 빈 의존성 배열

// 2. k 변경 시 클라이언트에서 계산
const { points, centroids, ... } = useMemo(() => {
  // PCA에서 2D slice (PC1, PC2)
  const pca2D = pcaFullData.components.map(comp => [comp[0], comp[1]]);
  
  // K-Means 클러스터링 (클라이언트에서 계산)
  const { labels, centroids } = kmeans(pca2D, k, 300, 42);
  
  return { points, centroids, ... };
}, [pcaFullData, k]); // k 변경 시 즉시 재계산
```

### 3. 캐시 무효화

**파일**: `app/api/pca/revalidate/route.ts`

새 PCA 데이터 배포 시:
```bash
curl -X POST http://localhost:3000/api/pca/revalidate
```

또는:
```typescript
// Admin 페이지에서 호출
fetch('/api/pca/revalidate', { method: 'POST' });
```

## 성능 측정

### 기대 지표

1. **첫 로딩**: 네트워크 의존 (1회)
   - 파일 크기: ~2-5MB (117×117×8 bytes + 메타데이터)
   - 네트워크 시간: 100-500ms (캐시 히트 시)

2. **k 변경**: 즉시 반영 (네트워크 호출 없음)
   - 계산 시간: < 50ms (p95)
   - UI 업데이트: < 16ms (60fps)

### 검증 시나리오

#### 시나리오 1: 슬라이더 빠르게 왕복
```javascript
// 브라우저 콘솔에서 실행
for (let i = 0; i < 10; i++) {
  // k를 1→117→1로 변경
  document.querySelector('input[type="number"]').value = i % 2 === 0 ? 1 : 117;
  document.querySelector('input[type="number"]').dispatchEvent(new Event('change'));
}

// 확인사항:
// - 네트워크 탭: /api/pca/full 호출 1회만
// - Performance 탭: paint 시간 < 50ms
```

#### 시나리오 2: 느린 네트워크 테스트
1. Chrome DevTools → Network → Throttling: "Slow 3G"
2. 페이지 새로고침
3. 첫 로딩 시간 확인 (네트워크 시간 포함)
4. k 값 변경 시 즉시 반영 확인 (네트워크 호출 없음)

## 사용 방법

### 1. PCA 데이터 생성

```bash
cd /mnt/hdd1/jeon/dir
python3 scripts/generate_pca_full.py
```

출력: `pca_full.json` 파일 생성

### 2. 개발 서버 실행

```bash
npm run dev
```

### 3. 테스트 페이지 접속

- **A안**: http://localhost:3000/metrics-pca-a
- **기존**: http://localhost:3000/metrics-pca

### 4. 성능 비교

**A안 (PcaKMeansChartA)**:
- k 변경 시: 네트워크 호출 없음, 즉시 반영
- 첫 로딩: 1회 네트워크 호출

**기존 (PcaKMeansChart)**:
- k 변경 시: 매번 `/api/kmeans?k=${k}` 호출
- 첫 로딩: 1회 네트워크 호출

## 문제 해결

### Q: `pca_full.json` 파일이 없습니다
**A**: `scripts/generate_pca_full.py`를 실행하세요.

### Q: 첫 로딩이 느립니다
**A**: 
1. 파일 캐시 확인: `ls -lh pca_full.json`
2. 메모리 캐시 확인: 브라우저 DevTools → Network → `/api/pca/full` → `X-Cache: hit`
3. ETag 확인: `If-None-Match` 헤더로 304 Not Modified 응답 확인

### Q: k 변경 시 UI가 느립니다
**A**: 
1. 브라우저 Performance 탭에서 `useMemo` 실행 시간 확인
2. K-Means 계산 최적화: `maxIter` 감소 (현재 300 → 100)
3. React DevTools Profiler로 렌더링 시간 확인

### Q: 메모리 사용량이 높습니다
**A**:
- 대안: 상위 N개 PC만 선로딩, 나머지 지연 로딩
- 또는: Float32Array 바이너리 전송 (파일 크기 50% 감소)

## 다음 단계 (선택)

1. **바이너리 전송**: JSON 대신 Float32Array 바이너리 사용
2. **지연 로딩**: 상위 10개 PC만 선로딩, 나머지 필요 시 로드
3. **Web Worker**: K-Means 계산을 Web Worker로 분리하여 메인 스레드 블로킹 방지

## 참고

- **A안**: 네트워크 호출 최소화, 클라이언트 계산 즉시 반영
- **B안**: 서버에서 k별 슬라이스 제공, 디바운스 + Abort로 중복 요청 제거

선택 기준:
- **A안**: 네트워크가 불안정하거나, k 변경이 매우 빈번한 경우
- **B안**: 서버에서 Python 계산 결과를 정확히 사용해야 하거나, 클라이언트 계산 부하를 줄이고 싶은 경우

