# RevIN + GRU + UKF 기반 SOC 추정 스크립트

## 개요

인공지능 기반 배터리 모델을 이용한 SOC 추정기 설계

**논문 방식 요약:**
- 데이터 기반 배터리 전압 모델(딥러닝) + GRU, 그리고 UKF로 SOC 추정
- RNN(특히 GRU)로 시간의존 동역학을 학습한 뒤, UKF로 SOC를 추정하는 구조
- 본 구현은 RevIN(분포 안정화)으로 강화한 RevIN+GRU+UKF 파이프라인

**출처:** KSAE 2021 추계학술대회 "인공지능기반 배터리 모델을 이용한 SOC 추정기 설계"

## 구조

- **GRU**: 전압(관측) 모델을 학습 (RevIN으로 입력 정규화)
- **UKF**: 상태(SOC) 추정을 담당
- GRU가 SOC를 직접 회귀하는 것이 아니라, 전압을 예측하고 UKF가 이를 관측으로 사용하여 SOC 추정

## 설치

```bash
cd /mnt/hdd1/jeon/dir-2/backend
pip install -r requirements.txt
```

필수 패키지:
- `torch` (PyTorch)
- `influxdb-client`
- `pandas`
- `scikit-learn`
- `matplotlib`
- `numpy`

## 사용 방법

### 기본 실행

```bash
python influx_gru_revin_ukf_soc.py \
  --influxdb-url http://localhost:8086 \
  --influxdb-token YOUR_TOKEN \
  --influxdb-org YOUR_ORG \
  --influxdb-bucket aicar_bms \
  --device 12345678 \
  --start -30d \
  --stop now()
```

### 환경 변수 사용

```bash
export INFLUXDB_URL="http://localhost:8086"
export INFLUXDB_TOKEN="YOUR_TOKEN"
export INFLUXDB_ORG="YOUR_ORG"
export INFLUXDB_BUCKET="aicar_bms"

python influx_gru_revin_ukf_soc.py \
  --device 12345678 \
  --start -30d
```

### 전체 옵션 예시

```bash
python influx_gru_revin_ukf_soc.py \
  --start -30d --stop now() \
  --bucket aicar_bms \
  --current pack_current \
  --volt pack_volt \
  --temp mod_avg_temp \
  --device-tag device_no \
  --device 12345678 \
  --seq-len 128 \
  --hidden 128 \
  --layers 2 \
  --epochs 50 \
  --batch 64 \
  --capacity-ah 72.0 \
  --coulomb-eff 0.995 \
  --q-proc 1e-6 \
  --r-meas 1e-3 \
  --use-pseudo-soc false
```

## 주요 파라미터

### InfluxDB 설정
- `--influxdb-url`: InfluxDB 서버 URL
- `--influxdb-token`: 인증 토큰
- `--influxdb-org`: 조직명
- `--influxdb-bucket`: 버킷명

### 필드/태그명
- `--current`: 전류 필드명 (기본: `pack_current`)
- `--volt`: 전압 필드명 (기본: `pack_volt`)
- `--temp`: 온도 필드명 (기본: `mod_avg_temp`)
- `--device-tag`: 디바이스 태그명 (기본: `device_no`)
- `--device`: 디바이스 값 (선택)

### 시간 범위
- `--start`: 시작 시간 (기본: `-30d`)
- `--stop`: 종료 시간 (기본: `now()`)

### 모델 하이퍼파라미터
- `--seq-len`: 시퀀스 길이 (기본: 128)
- `--hidden`: GRU hidden size (기본: 128)
- `--layers`: GRU 레이어 수 (기본: 2)
- `--dropout`: Dropout 비율 (기본: 0.2)
- `--epochs`: 학습 에포크 수 (기본: 50)
- `--batch`: 배치 크기 (기본: 64)
- `--lr`: 학습률 (기본: 1e-3)

### UKF 파라미터
- `--capacity-ah`: 배터리 용량 (Ah, 기본: 72.0)
- `--coulomb-eff`: 콜롬 효율 (기본: 0.995)
- `--q-proc`: 공정 잡음 공분산 (기본: 1e-6)
- `--r-meas`: 관측 잡음 공분산 (기본: 1e-3)

### 기타
- `--use-pseudo-soc`: 콜롬 카운팅으로 pseudo-SOC 생성 (기본: false)
- `--val-split`: 검증 데이터 비율 (기본: 0.2)

## 출력

### 모델 파일
- `models/gru_voltage.pt`: 학습된 GRU 모델 가중치

### 플롯
- `plots/voltage_pred_vs_true.png`: 실측 전압 vs GRU 예측 전압
- `plots/soc_ukf_est.png`: UKF 추정 SOC
- `plots/residual_histogram.png`: 잔차 히스토그램

### 지표
- `metrics.json`: 전압 예측/SOC 지표, 하이퍼파라미터 기록

## 동작 원리

1. **데이터 로드**: InfluxDB에서 전류, 전압, 온도 데이터 로드
2. **전처리**: 정규화 및 시퀀스 윈도우 생성
3. **학습**: RevIN + GRU로 전압 예측 모델 학습
4. **추론**: 
   - UKF predict: 콜롬 카운팅으로 SOC 예측
   - GRU 관측: RevIN+GRU로 전압 예측
   - UKF update: 잔차로 SOC 보정
5. **시각화**: 결과 플롯 생성

## GPU 사용

GPU가 있으면 자동으로 사용됩니다. CPU만 사용하려면:

```bash
CUDA_VISIBLE_DEVICES="" python influx_gru_revin_ukf_soc.py ...
```

## 문제 해결

### InfluxDB 연결 실패
- URL, 토큰, 조직명, 버킷명 확인
- 네트워크 연결 확인

### 메모리 부족
- `--batch` 크기 감소
- `--seq-len` 감소
- 데이터 범위 축소 (`--start`, `--stop`)

### 학습이 느림
- GPU 사용 확인
- `--num-workers` 조정
- `--epochs` 감소

## 참고

- 논문: KSAE 2021 추계학술대회 "인공지능기반 배터리 모델을 이용한 SOC 추정기 설계"
- 구현: RevIN + GRU + UKF 파이프라인

