# FastAPI 머신러닝 인퍼런스 서버 Dockerfile
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# GPU 지원이 필요한 경우 (선택적)
# FROM python:3.11-slim
# RUN apt-get update && apt-get install -y \
#     gcc g++ \
#     && rm -rf /var/lib/apt/lists/*
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt \
#     && pip install --no-cache-dir onnxruntime-gpu  # GPU 버전

# 애플리케이션 코드 복사
COPY app.py .
COPY soc_estimation.py .

# 모델 파일 복사 (있는 경우)
# COPY models/ ./models/

# 포트 노출
EXPOSE 8000

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# 서버 실행 (keep-alive 최적화 - 타임아웃 증가로 연결 재사용 시간 연장)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", \
     "--loop", "uvloop", "--workers", "1", \
     "--limit-concurrency", "100", "--timeout-keep-alive", "300"]

