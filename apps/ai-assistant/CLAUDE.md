# ai-assistant Modülü — Enkap AI Muhasebe Asistanı

**Kod adı:** ai-assistant | **Port:** 3016 | **Teknoloji:** FastAPI 0.111.0 (Python 3.11)

---

## Genel Bakış

Türkçe muhasebe uzmanı AI asistanı. Enkap ERP platformunun AI katmanı olarak, VUK/TFRS, KDV, TDHP, e-Fatura, GİB konularında danışmanlık, fatura OCR, anomali açıklama ve tahmin yorumlama hizmetleri sunmaktadır.

**Sprint 6A hedefleri:**
- Türkçe LLM entegrasyonu (OpenAI gpt-4o)
- Belge analizi ve OCR
- Satış/stok tahmin açıklaması (SHAP → Türkçe kart)
- Muhasebe anomali deteksiyonu

---

## Mimari

```
ai-assistant/
├── src/
│   ├── main.py                      # FastAPI uygulaması, lifespan yönetimi, global handlers
│   ├── core/
│   │   ├── config.py                # Pydantic Settings — env yönetimi
│   │   └── auth.py                  # JWT token validation
│   ├── routers/
│   │   ├── chat.py                  # POST /api/v1/chat/message → Muhasebe soru-cevap
│   │   ├── document.py              # POST /api/v1/documents/upload → OCR fatura
│   │   └── forecast.py              # POST /api/v1/forecast/explain → Tahmin açıklama
│   ├── tools/
│   │   ├── invoice_reader.py        # OCR + fatura parsing (pytesseract, PIL)
│   │   ├── report_summarizer.py     # Muhasebe raporu özeti ve anomali analizi
│   │   └── anomaly_explainer.py     # Muhasebe anomalileri Türkçe açıklama
│   └── llm/
│       ├── openai_client.py         # OpenAI SDK wrapper — singleton
│       └── prompt_templates.py      # Sistem promptları (Türkçe)
├── Dockerfile
├── requirements.txt
└── package.json (monorepo integrasyon)
```

---

## Başlıca Bileşenler

### 1. main.py — Uygulama İskeleti
- **Lifespan yönetimi:** OpenAI client başlat/kapat, OpenTelemetry tracing konfigürasyonu
- **CORS middleware:** `CORS_ORIGINS` env'den oku (default: `*`)
- **Global exception handler:** Beklenmeyen exceptionları Türkçe hata mesajına dönüştür
- **Health endpoint'leri:**
  - `GET /health` → Liveness probe (200 OK her zaman)
  - `GET /health/ready` → Readiness probe (OpenAI client başlatıldı mı?)
- **Router dahil etme:**
  - `/api/v1/chat` (chat.router)
  - `/api/v1/documents` (document.router)
  - `/api/v1/forecast` (forecast.router)

**OpenTelemetry:** `OTEL_EXPORTER_OTLP_ENDPOINT` env yoksa sessizce devre dışı kalır. Aktif olursa FastAPI otomatik enstrümente edilir.

**OpenAI client singleton pattern:**
```python
_openai_client: OpenAIClient | None = None

def get_openai_client() -> OpenAIClient:
    global _openai_client
    if _openai_client is None:
        raise RuntimeError("OpenAI client henüz başlatılmadı")
    return _openai_client
```

### 2. core/config.py — Konfigürasyon
Pydantic Settings ile env yönetimi. Eksik kritik değerler startup sırasında yakalanır.

**Kritik ortam değişkenleri:**
```env
# OpenAI
OPENAI_API_KEY=sk-...                    # Boşsa dummy mode
OPENAI_MODEL=gpt-4o                      # Model adı
OPENAI_TIMEOUT=60.0                      # Saniye cinsinden istek timeout

# JWT
JWT_SECRET=dev-secret-change-in-production
JWT_ALGORITHM=HS256

# Diğer servisler
ML_INFERENCE_URL=http://ml-inference:3005          # Tahmin verileri
FINANCIAL_SERVICE_URL=http://financial-service:3003 # Muhasebe verileri

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317  # Boşsa devre dışı

# CORS
CORS_ORIGINS=*                           # Virgülle ayrılmış liste veya *

# Loglama
LOG_LEVEL=INFO
```

### 3. core/auth.py — JWT Doğrulama
- Bearer token `Authorization: Bearer <token>` header'dan oku
- `JWT_SECRET` ile `HS256` doğrulaması yap
- Token geçersizse 401 döner
- Tenant bilgisi token payload'ında (`sub`, `tenant_id`)

### 4. routers/chat.py — Muhasebe Q&A
**Endpoint:** `POST /api/v1/chat/message`

```python
{
    "message": "2025'te KDV muhasebesi nasıl yapılır?",
    "tenant_id": "uuid-string"  # Optional, token'dan okunabilir
}
```

**Yanıt:**
```python
{
    "response": "2025'te KDV muhasebesi şu şekildedir...",
    "sources": ["VUK md.123", "TFRS 15"],
    "thinking_time_ms": 2500
}
```

**Sistem promptu:** `prompt_templates.py` → MUHASEBE_DANISMANLIK şablonu
- VUK, KDV, TDHP, e-Fatura, GİB kuralları içerir
- Yanıtlar Türkçe, teknik terimler doğru
- İç referanslar (KDV oranları, asgari ücret vb.) current year temelinde

### 5. routers/document.py — Fatura OCR ve Analizi
**Endpoint:** `POST /api/v1/documents/upload`

```python
{
    "file": <binary PDF/PNG>,            # Fatura resmi
    "document_type": "invoice",          # "invoice" | "receipt" | "bill"
    "tenant_id": "uuid-string"           # Optional
}
```

**Yanıt:**
```python
{
    "document_uuid": "ettn-uuid",
    "extracted_data": {
        "invoice_number": "INV-2026-00123",
        "invoice_date": "2026-04-03",
        "seller_name": "ABC Ltd. Şti.",
        "seller_tax_id": "1234567890",
        "buyer_name": "XYZ Anonim Şirketi",
        "buyer_tax_id": "0987654321",
        "total_amount": 10500.00,          # TL cinsinden (kuruş değil)
        "tax_amount": 1750.00,
        "tax_rate": 20,
        "items": [
            {
                "description": "Yazılım Geliştirme Hizmeti",
                "unit_price": 1000.00,
                "quantity": 10,
                "line_total": 10000.00
            }
        ]
    },
    "confidence_score": 0.92,
    "anomalies": [
        {
            "type": "VAT_MISMATCH",
            "severity": "warning",
            "description": "Hesaplanan KDV ile faturadaki KDV uyumsuz"
        }
    ],
    "processing_time_ms": 3400
}
```

**Araçlar:**
- `invoice_reader.py` → `InvoiceReader` sınıfı
  - PyTesseract OCR (pytesseract + tesseract-ocr binary)
  - PIL image preprocessing (contrast, rotation detection)
  - Regex pattern matching (TCKN, VKN, sayılar, tarihler)
  - GİB ETTN UUID generation (fatura benzersiz tanımlayıcı)

### 6. routers/forecast.py — Tahmin Açıklama
**Endpoint:** `POST /api/v1/forecast/explain`

ml-inference servisinden gelen tahmin sonuçlarını (XGBoost + Prophet) Türkçe açıkla. SHAP değerleri kullanarak feature importance göster.

```python
{
    "forecast_id": "uuid-string",        # ML servisine ait tahmin UUID'si
    "forecast_type": "sales",            # "sales" | "stock" | "cash_flow"
    "metric_name": "monthly_revenue",
    "predicted_value": 150000.50,
    "confidence_interval": {
        "lower": 140000.00,
        "upper": 160000.00
    },
    "tenant_id": "uuid-string"
}
```

**Yanıt:**
```python
{
    "explanation": "Gelecek ay satış tahmini 150.000 TL'ye ulaşacak. Ana etkiler: ...",
    "feature_importance": [
        {
            "feature": "previous_month_sales",
            "shap_value": 25000,
            "impact": "positive",
            "interpretation": "Geçen ayın satışı tahmini olumlu yönde etkiledi"
        },
        {
            "feature": "seasonal_factor",
            "shap_value": -5000,
            "impact": "negative",
            "interpretation": "Mevsimsel faktör tahmini biraz düşürdü"
        }
    ],
    "risk_factors": [
        "Tahmin aralığı geniş (±7%), belirsizlik yüksek"
    ],
    "recommendations": [
        "Ürün stok seviyelerini %15 artırmayı düşünün"
    ],
    "thinking_time_ms": 1800
}
```

**Araçlar:**
- `anomaly_explainer.py` → `AnomalyExplainer` sınıfı
- `report_summarizer.py` → `ReportSummarizer` sınıfı

### 7. llm/openai_client.py — OpenAI Wrapper
**Singleton OpenAI client:**

```python
class OpenAIClient:
    def __init__(self, api_key: str, model: str, timeout: float):
        self.model = model
        self.timeout = timeout
        self.is_dummy = not api_key  # OPENAI_API_KEY yoksa dummy

        if not self.is_dummy:
            self.client = OpenAI(api_key=api_key, timeout=timeout)

    async def chat_completion(
        self,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        """OpenAI gpt-4o ile chat completion yapılır."""
        if self.is_dummy:
            return "[DUMMY MODE] Gerçek yanıt: " + user_message[:50]

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=temperature,
            max_tokens=max_tokens
        )
        return response.choices[0].message.content
```

**Dummy mode:** `OPENAI_API_KEY` yoksa mock yanıtlar döner (geliştirme/test için).

### 8. llm/prompt_templates.py — Sistem Promptları
Türkçe muhasebe uzmanı rolleri:

| Şablon | Rolü | Kapsam |
|--------|------|--------|
| `MUHASEBE_DANISMANLIK` | Muhasebe danışmanı | VUK, KDV, TDHP, e-Fatura, GİB |
| `FATURA_ANALIZ` | Fatura denetçi | Fatura hatası, anomali, uyum kontrolü |
| `ANOMALI_ACIKLAMA` | Risk analisti | Muhasebe anomalileri nedenlerini açıkla |
| `TAHMIN_YORUMLA` | İş analisti | Tahmin sonuçlarını İŞ açısından yorum yap |

**Kültürel özellikler:**
- Tüm param birlikleri `₺` ve `TL` ile
- Tarih formatı `dd.MM.yyyy` (GİB standardı)
- Saat dilimi `Europe/Istanbul` (UTC+3)
- Müşteri adları, VKN, TCKN vb. maske yapılır (KVKK)

---

## Bağımlılıklar (requirements.txt)

```
fastapi==0.111.0               # Web framework
uvicorn[standard]==0.29.0      # ASGI server
pydantic==2.7.1                # Data validation
pydantic-settings==2.2.1       # Env config
openai==1.30.1                 # OpenAI SDK (gpt-4o)
python-multipart==0.0.9        # File upload support
python-jose[cryptography]==3.3.0 # JWT
httpx==0.27.0                  # Async HTTP (file download)
tenacity==8.3.0                # Retry logic
pillow==10.3.0                 # Image processing (OCR)
pytesseract==0.3.10            # Tesseract wrapper
opentelemetry-sdk==1.24.0      # Distributed tracing
opentelemetry-exporter-otlp-proto-grpc==1.24.0
opentelemetry-instrumentation-fastapi==0.45b0
pypdf==4.2.0                   # PDF processing
```

---

## API Endpoint'leri

### Chat
```
POST /api/v1/chat/message
Content-Type: application/json

{
    "message": "Muhasebe sorusu",
    "tenant_id": "uuid"  # Optional
}
```

### Document Processing
```
POST /api/v1/documents/upload
Content-Type: multipart/form-data

file: <binary PDF/PNG>
document_type: "invoice"
tenant_id: "uuid"  # Optional
```

### Forecast Explanation
```
POST /api/v1/forecast/explain
Content-Type: application/json

{
    "forecast_id": "uuid",
    "forecast_type": "sales",
    "predicted_value": 150000.50,
    "confidence_interval": {...}
}
```

### Health
```
GET /health           → 200 OK (always)
GET /health/ready     → 200 OK if OpenAI client ready, else 503
```

---

## Çalıştırma

### Docker
```bash
docker build -f apps/ai-assistant/Dockerfile -t enkap-ai-assistant:latest .
docker run -p 3016:3016 \
  -e OPENAI_API_KEY=sk-... \
  -e ML_INFERENCE_URL=http://ml-inference:3005 \
  -e FINANCIAL_SERVICE_URL=http://financial-service:3003 \
  enkap-ai-assistant:latest
```

### Local geliştirme
```bash
cd apps/ai-assistant
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn src.main:app --reload --port 3016
```

---

## Kritik Kurallar

1. **OpenAI client singleton:** Uygulama boyunca tek örnek (`_openai_client`)
2. **JWT validation:** Her endpoint'te `Authorization: Bearer <token>` kontrol et
3. **Dummy mode:** `OPENAI_API_KEY` yoksa mock yanıtlar döner — test için kullanışlı
4. **Timeout:** OpenAI istekleri 60s timeout'a sahip
5. **Tenant isolation:** Token payload'ından `tenant_id` oku, yanıtlarda gizli veriler maske yap
6. **OCR confidence:** `confidence_score < 0.7` ise kullanıcıyı manuel kontrol etmesi yönlendir
7. **SHAP açıklaması:** Tahmin feature'larını İŞ terimlerine çevir (örn. `previous_month_sales` → "Geçen ayın satışı")

---

## Gelecek Geliştirmeler (Backlog)

- [ ] Türkçe LLM (Mistral, LLaMA vb.) yerel deployment
- [ ] Uzun belge işleme (bölümleme + summarization)
- [ ] Real-time fatura stream (WebSocket)
- [ ] Muhasebe yönergesi fine-tuning (RAG)
- [ ] Caching katmanı (Redis) — tekrarlanan sorular
- [ ] Batch işleme — toplu OCR/tahmin

---

## Troubleshooting

| Hata | Sebep | Çözüm |
|------|-------|-------|
| 503 Service Unavailable | OpenAI client başlatılmadı | `/health/ready` kontrol et |
| 401 Unauthorized | JWT token geçersiz/eksik | Bearer token ekle |
| 504 Gateway Timeout | OpenAI yanıt 60s aşıyor | Timeout uzat veya OPENAI_TIMEOUT env'i değiştir |
| OCR accuracy düşük | Kötü kalite resim | DPI ≥ 300, renkli fatura öner |
| "Dummy mode" yanıtı | OPENAI_API_KEY eksik | .env'e API key ekle |
| CORS hatası | CORS_ORIGINS uyumsuz | CORS_ORIGINS=https://frontend.com ekle |

---

## Test Verileri

**Dummy modda test çalıştırma (API key olmadan):**
```bash
# .env dosyası oluşturma (OPENAI_API_KEY yok)
OPENAI_MODEL=gpt-4o
OTEL_DISABLED=true

# Chat testi
curl -X POST http://localhost:3016/api/v1/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "KDV hesaplama örneği"}'

# Health check
curl http://localhost:3016/health/ready
```

---

## Performance Targets

- Chat completion: <3s (OpenAI API dependency)
- OCR processing: <5s (image size < 5MB)
- Forecast explanation: <2s (local processing)
- Health check: <100ms
