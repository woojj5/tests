# SOC 추정 API 사용 가이드

## FastAPI 엔드포인트

### POST `/soc/estimate`

SOC 추정을 수행하는 엔드포인트입니다.

#### 요청 파라미터

- `device` (필수): 디바이스 번호 (예: "12345678")
- `start` (선택): 시작 시간, Flux 시간 형식 (기본: "-7d")
- `stop` (선택): 종료 시간 (기본: "now()")
- `use_label_soc` (선택): 실제 SOC 라벨 사용 여부 (기본: false)

#### 요청 예시

```bash
curl -X POST "http://localhost:8001/soc/estimate?device=12345678&start=-7d&stop=now()" \
  -H "Content-Type: application/json"
```

또는 Python:

```python
import requests

response = requests.post(
    "http://localhost:8001/soc/estimate",
    params={
        "device": "12345678",
        "start": "-7d",
        "stop": "now()",
        "use_label_soc": False,
    }
)

result = response.json()
print(f"SOC 추정 결과: {result['metrics']}")
```

#### 응답 형식

```json
{
  "device": "12345678",
  "time_range": {
    "start": "-7d",
    "stop": "now()"
  },
  "num_samples": 1000,
  "soc_estimates": [0.95, 0.94, 0.93, ...],
  "voltage_predictions": [350.2, 349.8, 349.5, ...],
  "voltage_actual": [350.0, 349.5, 349.2, ...],
  "metrics": {
    "voltage_rmse": 0.5,
    "voltage_mae": 0.3,
    "final_soc": 93.5,
    "initial_soc": 95.0
  }
}
```

## 속도 최적화

### 적용된 최적화

1. **시퀀스 길이 감소**: 128 → 64
2. **Hidden size 감소**: 128 → 64
3. **Dropout 감소**: 0.2 → 0.1
4. **배치 처리**: 여러 샘플을 한 번에 추론
5. **데이터 캐싱**: 동일한 쿼리 결과 캐싱 (TTL: 300초)
6. **다운샘플링**: 5초 간격으로 데이터 집계
7. **비동기 처리**: FastAPI의 비동기 실행

### 성능 개선

- **데이터 로딩**: 캐싱으로 2차 요청 시 즉시 반환
- **모델 추론**: 배치 처리로 GPU 활용 최적화
- **InfluxDB 쿼리**: 필요한 필드만 선택, 다운샘플링

## 실제 필드명

스크립트는 다음 InfluxDB 필드를 사용합니다:

- `pack_current`: 전류
- `pack_volt`: 전압
- `mod_avg_temp`: 온도
- `soc`: SOC (라벨로 사용 가능)

## 환경 변수

```bash
export INFLUXDB_URL="http://localhost:8086"
export INFLUXDB_TOKEN="YOUR_TOKEN"
export INFLUXDB_ORG="YOUR_ORG"
export INFLUXDB_BUCKET="aicar_bms"
export SOC_MODEL_PATH="models/gru_voltage.pt"  # 선택
```

## 모델 학습

모델이 없으면 기본 가중치로 동작합니다. 학습하려면:

```bash
python influx_gru_revin_ukf_soc.py \
  --influxdb-url $INFLUXDB_URL \
  --influxdb-token $INFLUXDB_TOKEN \
  --influxdb-org $INFLUXDB_ORG \
  --influxdb-bucket $INFLUXDB_BUCKET \
  --device 12345678 \
  --epochs 50
```

학습된 모델은 `models/gru_voltage.pt`에 저장됩니다.

