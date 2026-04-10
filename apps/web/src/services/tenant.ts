/**
 * Tenant Service — Profil Yönetimi
 * Port: 3002 | Proxy: /api/tenant/*
 */
import { apiClient } from '@/lib/api-client';

export interface TenantProfile {
  tenantId:       string;
  companyName:    string;
  tradeName?:     string;
  vkn?:           string;
  taxOffice?:     string;
  sgkEmployerNo?: string;
  mersisNo?:      string;
  address?:       string;
  phone?:         string;
  email?:         string;
  logoUrl?:       string;
  invoicePrefix?: string;
  // Finans varsayılanları
  defaultKdvRate?:          number;
  defaultPaymentTermDays?:  number;
  arReminderDays?:          number[];
  defaultCurrency?:         string;
  maxDiscountRate?:         number;
  defaultMinStockQty?:      number;
}

export interface WhiteLabelConfig {
  id?:                     string;
  tenantId:                string;
  subdomain:               string | null;
  customDomain:            string | null;
  brandName:               string | null;
  logoUrl:                 string | null;
  faviconUrl:              string | null;
  primaryColor:            string;
  secondaryColor:          string;
  supportEmail:            string | null;
  supportPhone:            string | null;
  isActive:                boolean;
  domainVerified:          boolean;
  domainVerificationToken: string | null;
  createdAt?:              string;
  updatedAt?:              string;
}

export interface UpsertWhiteLabelPayload {
  subdomain?:      string | null;
  customDomain?:   string | null;
  brandName?:      string | null;
  logoUrl?:        string | null;
  faviconUrl?:     string | null;
  primaryColor?:   string;
  secondaryColor?: string;
  supportEmail?:   string | null;
  supportPhone?:   string | null;
}

// ─── Üye Yönetimi ─────────────────────────────────────────────────────────────

export type MemberRole   = 'ADMIN' | 'MANAGER' | 'STAFF' | 'READONLY';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface TenantMember {
  id:           string;
  userId:       string;
  email:        string;
  name?:        string;
  role:         MemberRole;
  status:       MemberStatus;
  invitedAt?:   string;
  joinedAt?:    string;
  lastLoginAt?: string;
}

export interface InviteMemberPayload {
  email: string;
  role:  MemberRole;
  name?: string;
}

export const tenantApi = {
  getProfile: (tenantId: string) =>
    apiClient.get<TenantProfile>(`/tenant/tenants/${tenantId}/profile`),

  createProfile: (tenantId: string, data: Partial<TenantProfile>) =>
    apiClient.post<TenantProfile>(`/tenant/tenants/${tenantId}/profile`, data),

  updateProfile: (tenantId: string, data: Partial<TenantProfile>) =>
    apiClient.patch<TenantProfile>(`/tenant/tenants/${tenantId}/profile`, data),

  nextInvoiceNumber: (tenantId: string) =>
    apiClient.post<{ invoiceNumber: string }>(`/tenant/tenants/${tenantId}/invoice-number`, {}),

  // ── White Label ───────────────────────────────────────────────────────────

  getWhiteLabel: (tenantId: string) =>
    apiClient.get<WhiteLabelConfig>(`/tenant/white-label/config/${tenantId}`),

  upsertWhiteLabel: (tenantId: string, data: UpsertWhiteLabelPayload) =>
    apiClient.put<WhiteLabelConfig>(`/tenant/white-label/config/${tenantId}`, data),

  verifyDomain: (tenantId: string) =>
    apiClient.post<{ verified: boolean; message: string }>(
      `/tenant/white-label/config/${tenantId}/verify-domain`,
      {},
    ),

  // ── Üye Yönetimi (auth-service) ─────────────────────────────────────────────

  listMembers: (tenantId: string) =>
    apiClient.get<TenantMember[]>(`/auth-svc/tenants/${tenantId}/members`),

  inviteMember: (tenantId: string, data: InviteMemberPayload) =>
    apiClient.post<TenantMember>(`/auth-svc/tenants/${tenantId}/members/invite`, data),

  updateMemberRole: (tenantId: string, memberId: string, role: MemberRole) =>
    apiClient.patch<TenantMember>(`/auth-svc/tenants/${tenantId}/members/${memberId}`, { role }),

  deactivateMember: (tenantId: string, memberId: string) =>
    apiClient.delete<void>(`/auth-svc/tenants/${tenantId}/members/${memberId}`),
};
