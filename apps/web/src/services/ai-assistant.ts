/**
 * AI Assistant Service — AI Muhasebe Asistanı
 * Port: 3016 (ai-assistant FastAPI) | Proxy: /api/ai-assistant/*
 *
 * NOT: ai-assistant FastAPI /api/v1/* prefix kullanır,
 * BFF proxy'si /api/v1/ ekler → doğru path'e ulaşır.
 */
import { apiClient } from '@/lib/api-client';

export interface ChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message:  string;
  history?: ChatMessage[];
  context?: string;
}

export interface ChatResponse {
  reply:        string;
  tokens_used?: number;
  model?:       string;
}

export interface DocumentAnalysisResponse {
  invoice_number?:  string;
  invoice_date?:    string;
  vendor_name?:     string;
  vendor_vkn?:      string;
  total_amount?:    number;
  vat_amount?:      number;
  currency?:        string;
  line_items?:      Array<{
    description: string;
    quantity:    number;
    unit_price:  number;
    vat_rate:    number;
    total:       number;
  }>;
  confidence:       number;
  raw_text?:        string;
}

export interface ForecastExplainRequest {
  forecast_type: 'sales' | 'stock' | 'cashflow';
  period:        string;
  values:        number[];
  shap_values?:  Record<string, number>;
}

export interface ForecastExplainResponse {
  summary:       string;
  key_factors:   string[];
  recommendation: string;
}

export const QUICK_QUESTIONS = [
  'Geçen ay en çok harcadığım kategori nedir?',
  'Bu ay nakit akışım nasıl görünüyor?',
  'Vadesi geçmiş alacaklarım var mı?',
  'En çok satan ürünlerim hangileri?',
  'Bu çeyrek gelir-gider dengem nedir?',
  'Stok seviyesi düşük olan ürünler neler?',
];

export const aiApi = {
  chat: (data: ChatRequest) =>
    apiClient.post<ChatResponse>('/ai-assistant/chat', data),

  analyzeDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<DocumentAnalysisResponse>(
      '/ai-assistant/analyze-document',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  explainForecast: (data: ForecastExplainRequest) =>
    apiClient.post<ForecastExplainResponse>('/ai-assistant/explain-forecast', data),
};
