"""
FastAPI 머신러닝 인퍼런스 서버
- 모델을 전역 싱글톤으로 로드하여 latency 최소화
- 서버 시작 시 warm-up 수행
- async 기반으로 처리량 최적화
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import time
import numpy as np
from contextlib import asynccontextmanager
import asyncio

# 모델 로드 옵션 (onnxruntime 또는 torch)
USE_ONNXRUNTIME = os.getenv("USE_ONNXRUNTIME", "false").lower() == "true"
MODEL_PATH = os.getenv("MODEL_PATH", None)

# 전역 모델 인스턴스 (싱글톤)
_model = None
_model_loaded = False


class InferenceRequest(BaseModel):
    """추론 요청 스키마"""
    inputs: List[float]


class InferenceResponse(BaseModel):
    """추론 응답 스키마"""
    outputs: List[float]
    latency_ms: float


def load_model():
    """모델 로드 (전역 싱글톤)"""
    global _model, _model_loaded
    
    if _model_loaded:
        return _model
    
    print("[MODEL] Loading model...")
    
    # 모델 파일이 있으면 실제 모델 로드
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        try:
            if USE_ONNXRUNTIME:
                import onnxruntime as ort
                _model = ort.InferenceSession(MODEL_PATH)
                print(f"[MODEL] Loaded ONNX model from {MODEL_PATH}")
            else:
                import torch
                _model = torch.jit.load(MODEL_PATH)
                _model.eval()
                print(f"[MODEL] Loaded PyTorch model from {MODEL_PATH}")
        except Exception as e:
            print(f"[MODEL] Failed to load model: {e}, using dummy model")
            _model = None
    else:
        # 모델 파일이 없으면 더미 모델 사용
        print("[MODEL] No model file found, using dummy model (x*2)")
        _model = None
    
    _model_loaded = True
    return _model


def run_inference(inputs: List[float]) -> List[float]:
    """
    실제 추론 수행
    
    Args:
        inputs: 입력 벡터
        
    Returns:
        출력 벡터
    """
    global _model
    
    input_array = np.array(inputs, dtype=np.float32)
    
    # 실제 모델이 있으면 사용
    if _model is not None:
        if USE_ONNXRUNTIME:
            # ONNX Runtime 추론
            ort_inputs = {_model.get_inputs()[0].name: input_array.reshape(1, -1)}
            ort_outputs = _model.run(None, ort_inputs)
            outputs = ort_outputs[0].flatten().tolist()
        else:
            # PyTorch 추론
            import torch
            with torch.no_grad():
                tensor_input = torch.from_numpy(input_array).unsqueeze(0)
                tensor_output = _model(tensor_input)
                outputs = tensor_output.numpy().flatten().tolist()
    else:
        # 더미 모델: 입력값 * 2
        outputs = (input_array * 2.0).tolist()
    
    return outputs


def warmup():
    """서버 시작 시 warm-up 수행"""
    print("[WARMUP] Starting warm-up...")
    dummy_input = [1.0, 2.0, 3.0, 4.0]
    
    start_time = time.time()
    _ = run_inference(dummy_input)
    elapsed_ms = (time.time() - start_time) * 1000
    
    print(f"[WARMUP] Completed in {elapsed_ms:.2f}ms")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작/종료 시 실행"""
    # 시작 시: 모델 로드 및 warm-up
    load_model()
    warmup()
    yield
    # 종료 시: 정리 작업 (필요시)


# FastAPI 앱 생성
app = FastAPI(
    title="ML Inference Server",
    description="머신러닝 모델 인퍼런스 서버",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정 (동일 네트워크 통신이므로 비활성화)
# 필요 시 아래 주석을 해제하여 활성화 가능
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


@app.get("/")
async def root():
    """헬스 체크 엔드포인트"""
    return {
        "status": "ok",
        "model_loaded": _model_loaded,
        "model_type": "onnxruntime" if USE_ONNXRUNTIME else ("pytorch" if _model is not None else "dummy"),
    }


@app.get("/health")
async def health():
    """상세 헬스 체크"""
    soc_estimator_available = False
    soc_estimator_error = None
    try:
        from soc_estimation import get_estimator
        estimator = get_estimator()
        soc_estimator_available = estimator is not None
    except Exception as e:
        soc_estimator_error = str(e)
        print(f"[HEALTH] SOC estimator initialization failed: {e}")
    
    response = {
        "status": "healthy",
        "model_loaded": _model_loaded,
        "soc_estimator_available": soc_estimator_available,
    }
    if soc_estimator_error:
        response["soc_estimator_error"] = soc_estimator_error
    
    return response


@app.post("/soc/estimate")
async def estimate_soc(
    device: str,
    start: str = "-7d",
    stop: str = "now()",
    use_label_soc: bool = False,
    background_tasks: BackgroundTasks = None,
):
    """
    SOC 추정 엔드포인트
    
    Args:
        device: 디바이스 번호
        start: 시작 시간 (Flux 시간 형식, 기본: "-7d")
        stop: 종료 시간 (기본: "now()")
        use_label_soc: 실제 SOC 라벨 사용 여부
    
    Returns:
        SOC 추정 결과
    """
    try:
        from soc_estimation import get_estimator, get_loader, SOCConfig
        
        config = SOCConfig()
        loader = get_loader(config)
        estimator = get_estimator(config)
        
        # 데이터 로드
        data = loader.load_data(device=device, start=start, stop=stop)
        
        if len(data) == 0:
            raise HTTPException(status_code=404, detail="No data found")
        
        # SOC 추정 (비동기로 실행)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: estimator.estimate_soc(data, use_label_soc=use_label_soc)
        )
        
        return {
            "device": device,
            "time_range": {"start": start, "stop": stop},
            "num_samples": len(data),
            "soc_estimates": result["soc_estimates"].tolist(),
            "voltage_predictions": result["voltage_predictions"].tolist(),
            "voltage_actual": result["voltage_actual"].tolist(),
            "metrics": result["metrics"],
        }
    
    except Exception as e:
        print(f"[ERROR] SOC estimation failed: {e}")
        raise HTTPException(status_code=500, detail=f"SOC estimation failed: {str(e)}")


@app.post("/infer", response_model=InferenceResponse)
async def infer(request: InferenceRequest):
    """
    추론 엔드포인트
    
    요청 예시:
        {
            "inputs": [1.0, 2.0, 3.0, 4.0]
        }
    
    응답 예시:
        {
            "outputs": [2.0, 4.0, 6.0, 8.0],
            "latency_ms": 1.23
        }
    """
    try:
        start_time = time.time()
        
        # 입력 검증
        if not request.inputs:
            raise HTTPException(status_code=400, detail="inputs cannot be empty")
        
        if len(request.inputs) == 0:
            raise HTTPException(status_code=400, detail="inputs must have at least one element")
        
        # 추론 수행
        outputs = run_inference(request.inputs)
        
        # 지연 시간 계산
        latency_ms = (time.time() - start_time) * 1000
        
        return InferenceResponse(
            outputs=outputs,
            latency_ms=round(latency_ms, 2),
        )
    
    except Exception as e:
        print(f"[ERROR] Inference failed: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    import os
    
    # 포트 설정 (환경 변수 또는 기본값)
    port = int(os.getenv("PORT", 8001))  # 기본값 8001 (포트 8000 충돌 방지)
    
    # 로컬 개발용 실행
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=True,  # 개발 모드
        loop="uvloop",  # 성능 향상 (uvloop 설치 필요)
        limit_concurrency=100,
        timeout_keep_alive=75,  # keep-alive 최적화
    )

