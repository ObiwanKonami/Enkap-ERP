/**
 * CRM Service — Müşteri/Tedarikçi, Lead Pipeline, Aktiviteler
 * Port: 3009 | Proxy: /api/crm/*
 */
import { apiClient } from '@/lib/api-client';

export type ContactType = 'customer' | 'vendor' | 'both' | 'prospect';

export interface Contact {
  id:          string;
  name:        string;
  type:        ContactType;
  email?:      string;
  phone?:      string;
  tckn?:       string;
  vkn?:        string;
  address?:    string;
  city?:       string;
  district?:   string;
  taxOffice?:  string;
  mersisNo?:   string;
  isActive:    boolean;
  createdAt:   string;
}

export type LeadStage =
  | 'NEW' | 'CONTACTED' | 'QUALIFIED'
  | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Lead {
  id:          string;
  title:       string;
  contactId:   string;
  contactName: string;
  stage:       LeadStage;
  value:       number;
  currency:    string;
  closeDate?:  string;
  notes?:      string;
  createdAt:   string;
}

export interface PipelineSummary {
  stages: {
    stage:       LeadStage;
    count:       number;
    totalValue:  number;
  }[];
  totalValue:    number;
  totalLeads:    number;
}

export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'NOTE';
export type ActivityStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export interface Activity {
  id:          string;
  type:        ActivityType;
  subject:     string;
  contactId?:  string;
  contactName?: string;
  leadId?:     string;
  dueDate?:    string;
  status:      ActivityStatus;
  notes?:      string;
  createdAt:   string;
}

export const crmApi = {

  contacts: {
    list: (params?: { search?: string; type?: ContactType; limit?: number; page?: number }) =>
      apiClient.get<{ data: Contact[]; total: number; page: number; limit: number }>('/crm/contacts', { params }),

    get: (id: string) =>
      apiClient.get<Contact>(`/crm/contacts/${id}`),

    create: (data: Partial<Contact>) =>
      apiClient.post<Contact>('/crm/contacts', data),

    update: (id: string, data: Partial<Contact>) =>
      apiClient.patch<Contact>(`/crm/contacts/${id}`, data),

    delete: (id: string) =>
      apiClient.delete(`/crm/contacts/${id}`),
  },

  leads: {
    pipeline: () =>
      apiClient.get<PipelineSummary>('/crm/leads/pipeline'),

    list: (params?: { stage?: LeadStage; contactId?: string; limit?: number; offset?: number }) =>
      apiClient.get<{ data: Lead[]; total: number }>('/crm/leads', { params }),

    get: (id: string) =>
      apiClient.get<Lead>(`/crm/leads/${id}`),

    create: (data: Partial<Lead>) =>
      apiClient.post<Lead>('/crm/leads', data),

    update: (id: string, data: Partial<Lead>) =>
      apiClient.patch<Lead>(`/crm/leads/${id}`, data),
  },

  activities: {
    overdueCount: () =>
      apiClient.get<{ count: number }>('/crm/activities/overdue-count'),

    list: (params?: { status?: ActivityStatus; contactId?: string; limit?: number; page?: number; offset?: number }) =>
      apiClient.get<{ data: Activity[]; total: number }>('/crm/activities', { params }),

    get: (id: string) =>
      apiClient.get<Activity>(`/crm/activities/${id}`),

    create: (data: Partial<Activity>) =>
      apiClient.post<Activity>('/crm/activities', data),

    complete: (id: string) =>
      apiClient.patch<Activity>(`/crm/activities/${id}/complete`, {}),
  },
};
