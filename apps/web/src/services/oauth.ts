/**
 * OAuth2 / API Marketplace — API İstemci Yönetimi
 * Port: 3001 (auth-service) | Proxy: /api/auth-svc/*
 */
import { apiClient } from '@/lib/api-client';

export interface ApiClientItem {
  id:           string;
  client_id:    string;
  tenant_id:    string;
  name:         string;
  scopes:       string[];
  status:       'active' | 'revoked';
  last_used_at: string | null;
  created_at:   string;
}

export interface CreateApiClientPayload {
  name:   string;
  scopes: string[];
}

export interface CreatedApiClient {
  clientId:     string;
  clientSecret: string; // Yalnızca oluşturma anında döner
  name:         string;
  scopes:       string[];
  createdAt:    string;
}

export interface ApiTokenResponse {
  access_token: string;
  token_type:   'Bearer';
  expires_in:   number;
  scope:        string;
}

/** İzin verilen scope'lar */
export const API_SCOPES = [
  { value: 'invoices:read',    label: 'Fatura - Okuma',      group: 'Finans' },
  { value: 'invoices:write',   label: 'Fatura - Yazma',      group: 'Finans' },
  { value: 'financial:read',   label: 'Muhasebe - Okuma',    group: 'Finans' },
  { value: 'stock:read',       label: 'Stok - Okuma',        group: 'Stok' },
  { value: 'stock:write',      label: 'Stok - Yazma',        group: 'Stok' },
  { value: 'crm:read',         label: 'CRM - Okuma',         group: 'CRM' },
  { value: 'crm:write',        label: 'CRM - Yazma',         group: 'CRM' },
  { value: 'hr:read',          label: 'İK - Okuma',          group: 'İnsan Kaynakları' },
  { value: 'analytics:read',   label: 'Analitik - Okuma',    group: 'Yönetim' },
] as const;

export const oauthApi = {
  /** Tenant API istemcilerini listele */
  listClients: () =>
    apiClient.get<ApiClientItem[]>('/auth-svc/oauth/clients'),

  /** Yeni API istemcisi oluştur (secret yalnızca bu yanıtta gelir) */
  createClient: (data: CreateApiClientPayload) =>
    apiClient.post<CreatedApiClient>('/auth-svc/oauth/clients', data),

  /** API istemcisini iptal et */
  revokeClient: (clientId: string) =>
    apiClient.delete(`/auth-svc/oauth/clients/${clientId}`),
};
