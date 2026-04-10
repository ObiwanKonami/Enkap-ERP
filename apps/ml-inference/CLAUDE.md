# ML Inference Service — CLAUDE.md

FastAPI tabanlı, gerçek zamanlı tahmin ve anomali tespiti servisi. Port **3005**.

---

## Genel Yapı

```
apps/ml-inference/
├── src/
│   ├── main.py                      # FastAPI app, routers, CORS
│   ├── routers/
│   │   ├── predictions.py           # POST /api/v1/predictions/{sales|cashflow}
│   │   ├── anomaly.py               # POST /api/v1/anomaly/detect
│   │   ├── drift.py                 # GET /api/v1/drift/status
│   │   └── health.py                # GET /health
│   ├── models/
│   │   ├── sales_forecast.py        # XGBoostSalesForecaster
│   │   ├── cashflow_forecast.py     # ProphetCashflowForecaster
│   │   ├── anomaly_detector.py      # IsolationForestAnomalyDetector
│   │   └── schemas.py               # Pydantic request/response modelleri
│   ├── services/
│   │   ├── feature_engineering.py   # build_sales_features, build_cashflow_features
│   │   ├── shap_explainer.py        # SHAP model açıklanabilirliği
│   │   ├── drift_detector.py        # Veri dağılımı değişimi tespit
│   │   └── model_registry.py        # BentoML model yönetimi
│   ├── core/
│   │   ├── redis_client.py          # Önbellek, oturum yönetimi
│   │   ├── feature_store.py         # Feast entegrasyonu (online/offline)
│   │   └── tenant_auth.py           # JWT tenant doğrulaması, feature gate
│   ├── dags/
│   │   ├── sales_forecast_dag.py    # Airflow — satış modeli eğitimi
│   │   ├── cashflow_dag.py          # Airflow — nakit akışı modeli eğitimi
│   │   ├── anomaly_training_dag.py  # Airflow — anomali detector eğitimi
│   │   └── drift_detection_dag.py   # Airflow — drift monitoring
│   └── __init__.py
└── pyproject.toml                   # Python bağımlılıkları (Poetry)
```

---

## Teknoloji Yığını

| Bileşen | Paket | Açıklama |
|---------|-------|---------|
| Framework | FastAPI 0.110 | Async web framework |
| Server | Uvicorn 0.29 | ASGI server |
| ML — Tabular | XGBoost 2.0.3 | Satış tahmini (sparse veri) |
| ML — Zaman Serisi | Prophet 1.1.5 | Nakit akışı tahmini (seasonality) |
| ML — Anomali | scikit-learn 1.4.0 | Isolation Forest anomali deteksiyonu |
| Açıklanabilirlik | SHAP 0.45 | Model kararlarının açıklanması (Türkçe kart) |
| Önbellek | Redis 5.0.3 | Tahmin sonuçları, feature cache |
| Model Registry | BentoML 1.2.0 | Model versiyonlama, serving |
| Validation | Pydantic 2.6.0 | Request/response şemaları |
| Auth | python-jose 3.3.0 | JWT doğrulaması (tenant context) |
| Orchestration | Apache Airflow 2.8 | Model eğitimi scheduling (harici) |

---

## API Endpoint'leri

### `/api/v1/predictions` — Satış & Nakit Akışı Tahminleri

#### POST `/api/v1/predictions/sales`
Satış tahmini.

**Request:**
```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "horizon": "30d",        // "7d", "14d", "30d", "90d", "180d"
  "confidence": 0.95       // İsteğe bağlı
}
```

**Response:**
```json
{
  "productId": "uuid",
  "warehouseId": "uuid",
  "horizon": "30d",
  "points": [
    {
      "date": "2026-04-03",
      "forecast": 150.5,
      "lower": 120.0,
      "upper": 180.0
    }
  ],
  "modelUsed": "xgboost",  // veya "prophet"
  "explanation": {
    "topFeatures": [
      { "name": "previous_30d_sales", "shap_value": 45.2 }
    ]
  },
  "confidence": 0.95,
  "generatedAt": "2026-04-03T10:30:00Z"
}
```

**Mantık:**
- Tarihsel veri < 90 gün → **XGBoost** (sparse veri için)
- Tarihsel veri ≥ 180 gün → **Prophet** (seasonality + trend)
- Arada (90–180 gün) → **XGBoost** (Prophet henüz güvenilir değil)
- Sonuçlar **Redis** → 1 saat TTL

**Feature'lar (XGBoost):**
- `previous_7d_sales`, `previous_30d_sales`, `previous_90d_sales`
- `seasonal_index` (yıl içinde benzer günler)
- `day_of_week`, `month_of_year`
- `price_avg_7d`, `promotion_active`

#### POST `/api/v1/predictions/cashflow`
Nakit akışı tahmini (Prophet).

**Request:**
```json
{
  "horizon": "90d",
  "includeArPayments": true,    // AR (satın alma) ödemelerini dahil et
  "confidence": 0.90
}
```

**Response:**
```json
{
  "horizon": "90d",
  "points": [
    {
      "date": "2026-04-03",
      "inflow": 50000.00,        // Kur: kuruş (× 100 TL)
      "outflow": 30000.00,
      "netCashflow": 20000.00,
      "lower": 10000.00,
      "upper": 30000.00
    }
  ],
  "modelUsed": "prophet",
  "confidence": 0.90,
  "generatedAt": "2026-04-03T10:30:00Z"
}
```

**Feature'lar (Prophet):**
- İstatistiksel decomposition: trend + seasonality + residuals
- Tarihi gelir/gider ortalamaları
- Yıl içi desen (ay sonu ödemeleri, bordro, KDV)

---

### `/api/v1/anomaly` — Anomali Tespiti

#### POST `/api/v1/anomaly/detect`
Veri anormalliği tespiti (Isolation Forest).

**Request:**
```json
{
  "entityType": "invoice",          // "invoice", "stock_movement", "transaction"
  "entityId": "uuid",
  "features": {
    "amount": 15000.00,
    "item_count": 5,
    "supplier_id": "uuid",
    "frequency": 0.7                // [0, 1] — bu supplier'dan alışveriş sıklığı
  }
}
```

**Response:**
```json
{
  "entityType": "invoice",
  "entityId": "uuid",
  "isAnomaly": true,               // true = anormal
  "anomalyScore": 0.85,            // [0, 1] — ne kadar anormal?
  "threshold": 0.7,
  "explanation": {
    "flaggedFeatures": ["amount is 3σ above mean"],
    "baselineExpected": 5000.00,
    "observedValue": 15000.00
  },
  "timestamp": "2026-04-03T10:30:00Z"
}
```

**Kullanım senaryoları:**
- Muhasebe: Anormal fatura tutarları → doğrulama için flag
- Stok: Beklenmedik hareket miktarları → hata kontrolü
- Kasa: Anormal transferler → şüpheli aktivite

---

### `/api/v1/drift` — Model Drift Monitoring

#### GET `/api/v1/drift/status`
Veri dağılımı değişimi durumu.

**Response:**
```json
{
  "status": "healthy",             // "healthy", "warning", "critical"
  "lastCheckAt": "2026-04-03T10:30:00Z",
  "checksPerformed": {
    "sales_forecast_xgboost": {
      "status": "healthy",
      "driftScore": 0.15,          // [0, 1]
      "threshold": 0.5,
      "failedTests": []
    },
    "cashflow_forecast_prophet": {
      "status": "warning",
      "driftScore": 0.55,
      "threshold": 0.5,
      "failedTests": ["mean_shift_detected"]
    }
  },
  "actions": [
    "Consider retraining cashflow_forecast_prophet model"
  ]
}
```

**Drift tesitı yöntemleri:**
1. **Kolmogorov–Smirnov testi** — dağılım değişikliği
2. **Population Stability Index (PSI)** — feature dağılımı
3. **Residual analizi** — tahmin hataları artan mı?

#### POST `/api/v1/drift/retrain`
Drift tespitlendiyse manuel model yeniden eğitimi tetikleme.

---

### `/health` — Sistem Sağlığı

#### GET `/health`
Liveness & readiness probe.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "redis": "ok",
    "feature_store": "ok",
    "models_loaded": "ok"
  },
  "uptime": "2h 30m"
}
```

---

## Tenant İzolasyonu & Feature Gate

### `tenant_auth.py`
Her istekte JWT token'dan tenant ID'si çıkarılır.

```python
from .core.tenant_auth import TenantDep, require_ml_feature

@router.post("/api/v1/predictions/sales", dependencies=[require_ml_feature("sales_forecast")])
async def predict_sales(req: SalesForecastRequest, tenant: TenantDep):
    # tenant.id, tenant.plan, tenant.features mevcuttur
```

**Feature Gate Kuralları:**
| Feature | Plans | Açıklama |
|---------|-------|---------|
| `sales_forecast` | Business+ | Satış tahmini |
| `cashflow_forecast` | Business+ | Nakit akışı tahmini |
| `anomaly_detection` | Pro+ | Anomali tespiti |
| `drift_monitoring` | Enterprise | Model drift monitoring |

Unauthorized → **403 Forbidden**

---

## Model Eğitimi (Airflow DAGs)

Modeller **Apache Airflow** ile gün, hafta, ayda bir eğitilir.

### `sales_forecast_dag.py`
```
XGBoost satış modeli günlük eğitimi (UTC 02:00)
1. Tarihsel satış verilerini al (financial-service DB'den)
2. Feature'ları oluştur (rolling avg, seasonal indices)
3. Veri bölü: train (85%) / test (15%)
4. Model eğit (XGBoost) → cross-validation
5. Performance metrikleri (MAE, RMSE, R²) → MLflow
6. BentoML model registry'ye yaz
7. Eski model'i archive et
```

### `cashflow_dag.py`
```
Prophet nakit akışı modeli haftalık eğitimi (UTC 03:00 Pazartesi)
1. Tarihsel gelir/gider verilerini al
2. Prophet modeli eğit (seasonality + trend)
3. Hata metriklerini kaydet
4. Model registry'ye yaz
```

### `anomaly_training_dag.py`
```
Isolation Forest anomali detector haftalık eğitimi
1. Tüm transaksiyon/hareket verilerini örnek al
2. Feature'ları standardize et
3. Isolation Forest eğit (n_estimators=100, contamination=0.05)
4. Model registry'ye yaz
```

### `drift_detection_dag.py`
```
Günlük drift monitoring (UTC 01:00)
1. Son 7 gün test verilerini al
2. Her model için drift testi yap (KS, PSI)
3. Drift score'ları hesapla
4. Eğer drift > threshold → alert RabbitMQ'ya gönder
5. MLflow'da kaydet
```

---

## Veri Akışı & Özellik Deposu (Feast)

### Online Feature Store
Redis'te cached → <100ms latency
```
Key: f"sales:{product_id}:{warehouse_id}:7d_sum"
Value: 1500.5
TTL: 3600 (1 saat)
```

### Offline Feature Store
MinIO'da parquet formatı → batch serving
```
s3://enkap-ml/features/sales/2026-04-03/
  ├── products.parquet
  ├── warehouse_7d_rolling_avg.parquet
  └── seasonal_indices.parquet
```

### Feature Catalog (Feast `feature_store.yaml`)
```yaml
entities:
  - name: product
    join_keys: [product_id]
  - name: warehouse
    join_keys: [warehouse_id]

feature_views:
  - name: sales_7d_statistics
    entities: [product, warehouse]
    features: [sales_sum_7d, sales_avg_7d, sales_std_7d]
    batch_source: minio_parquet
    online_store: redis

  - name: transaction_features
    entities: [transaction]
    features: [amount, item_count, frequency]
    online_store: redis
```

---

## Pydantic Şemaları (`models/schemas.py`)

```python
class SalesForecastRequest(BaseModel):
    productId: UUID
    warehouseId: UUID
    horizon: str  # "7d", "14d", "30d", "90d", "180d"
    confidence: float = 0.95

class DailyForecastPoint(BaseModel):
    date: date
    forecast: float
    lower: float  # CI alt sınır
    upper: float  # CI üst sınır

class SalesForecastResponse(BaseModel):
    productId: UUID
    warehouseId: UUID
    horizon: str
    points: list[DailyForecastPoint]
    modelUsed: str  # "xgboost" | "prophet"
    explanation: ExplanationOutput  # SHAP top features
    confidence: float
    generatedAt: datetime

class AnomalyDetectionRequest(BaseModel):
    entityType: str  # "invoice", "stock_movement", "transaction"
    entityId: UUID
    features: dict[str, float]

class AnomalyDetectionResponse(BaseModel):
    isAnomaly: bool
    anomalyScore: float  # [0, 1]
    threshold: float
    explanation: dict
    timestamp: datetime
```

---

## SHAP Açıklanabilirlik

### `services/shap_explainer.py`
```python
class ShapExplainer:
    """Model karar açıklaması — Türkçe kartlar ile."""

    def explain_prediction(self, model, X, instance_idx):
        # SHAP values hesapla
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X)

        # Türkçe feature adları ile kart oluştur
        top_features = [
            {"name": self._translate_feature(f), "shap_value": v}
            for f, v in sorted_features[:5]
        ]

        return {
            "topFeatures": top_features,
            "baselineValue": explainer.expected_value,
            "prediction": model.predict(X[instance_idx])
        }

    def _translate_feature(self, feature_name: str) -> str:
        """Feature adını Türkçeye çevir."""
        translations = {
            "previous_7d_sales": "Son 7 gün satışları",
            "previous_30d_sales": "Son 30 gün satışları",
            "seasonal_index": "Mevsimsel endeks",
            "price_avg_7d": "7 günlük ortalama fiyat",
            ...
        }
        return translations.get(feature_name, feature_name)
```

---

## Hata Yönetimi & Logging

### HTTP Hata Kodları
| Kod | Açıklama |
|-----|---------|
| 200 | Başarılı tahmin |
| 400 | Geçersiz request (eksik feature, yanlış horizon) |
| 401 | Geçersiz JWT token |
| 403 | Feature gate'ten geçemedi (plan sınırlaması) |
| 503 | Model yüklenmedi veya Redis bağlantısı yok |

### Logging
```python
import logging
logger = logging.getLogger(__name__)

# Tahmin başarısı
logger.info(f"Prediction cached: {cache_key}, ttl=3600")

# Model hataları
logger.error(f"Model inference failed: {model_name}, {exc}")

# Drift uyarıları
logger.warning(f"Drift detected: {model_name}, score={drift_score}")
```

---

## Çalıştırma & Deployment

### Local Geliştirme
```bash
cd apps/ml-inference
poetry install
python src/main.py
# http://localhost:3005/docs
```

### Docker
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y build-essential
WORKDIR /app
COPY pyproject.toml .
RUN pip install poetry && poetry install --no-dev
COPY src/ ./src/
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3005"]
```

### Kubernetes (Helm)
```yaml
deployment:
  replicas: 2
  resources:
    requests:
      memory: "2Gi"
      cpu: "1000m"
    limits:
      memory: "4Gi"
      cpu: "2000m"
  livenessProbe:
    httpGet:
      path: /health
      port: 3005
  readinessProbe:
    httpGet:
      path: /health
      port: 3005
```

---

## Env Değişkenleri

| Değişken | Açıklama | Örnek |
|----------|---------|--------|
| `ML_SERVICE_URL` | Bu servisin base URL | `http://ml-inference:3005` |
| `REDIS_URL` | Redis connection | `redis://redis:6379/0` |
| `FEATURE_STORE_ENDPOINT` | Feast API | `http://feast-registry:6565` |
| `MLFLOW_TRACKING_URI` | MLflow backend | `http://mlflow:5000` |
| `AIRFLOW_DAG_FOLDER` | Airflow DAGs | `/opt/airflow/dags` |
| `AUTH_JWT_SECRET` | JWT secret | `(env'den)` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry | `http://otel-collector:4317` |
| `TENANT_SERVICE_URL` | Tenant servis | `http://tenant-service:3002` |

---

## Mimari Kararlar

1. **Model Seçim**: Satış tahmini için veri uzunluğuna göre XGBoost vs Prophet
2. **Caching**: Tahmin sonuçları 1 saat boyunca Redis'te tutulur
3. **Feature Store**: Online (Redis) + Offline (MinIO) hibrit
4. **Tenant İzolasyonu**: JWT token'dan tenant ID çıkarılır, feature gate uygulanır
5. **Drift Monitoring**: Otomatik eğitim trigger'lanmamadı, manuel yeniden eğitim tavsiye edilir
6. **Async**: FastAPI async/await kullanılır, bağımsız tahminler paralel çalışabilir
7. **Logging**: Tahmin başarısı ve drift uyarıları MLflow + stdout'a gider

---

## Kod Yazarken Uyulacak Kurallar

- **Hiçbir zaman `any` tipi**: Pydantic model'leri önceden tanımla
- **NaN kontrol**: `np.isnan()` veya `pd.isna()` kullan
- **Tenant isolation**: Her istekte `TenantDep` kullan, tenant context'ten tenant ID'si al
- **Feature engineering**: `build_sales_features()` ve `build_cashflow_features()`'ı kullan, elle feature eklemek yerine
- **Caching key**: `make_cache_key(entity_type, entity_id, feature_name)` kullan
- **Hata işleme**: `HTTPException(status_code, detail)` fırlatma, asla raw traceback dönme
- **Logging**: `logger.info()` başarılar, `logger.error()` hatalar, `logger.warning()` uyarılar
- **SHAP açıklaması**: Türkçe feature adları kullan, `_translate_feature()` ile
