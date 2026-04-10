FROM python:3.11-slim

# Tesseract OCR — Türkçe dil paketi dahil
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-tur \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Sağlıklı çalışma durumunu K8s liveness probe ile kontrol et
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:3016/health').raise_for_status()"

EXPOSE 3016

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3016"]
