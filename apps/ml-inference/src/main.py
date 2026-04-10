"""
Enkap ML Inference API — FastAPI
Gerçek zamanlı tahmin ve anomali tespiti için ana giriş noktası.
"""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import predictions, anomaly, health, drift

app = FastAPI(
    title="Enkap ML Inference",
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production'da servis mesh'e güvenilir
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(predictions.router, prefix="/api/v1/predictions", tags=["predictions"])
app.include_router(anomaly.router, prefix="/api/v1/anomaly", tags=["anomaly"])
app.include_router(drift.router, prefix="/api/v1", tags=["drift"])


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3005, reload=True)
