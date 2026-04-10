import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApplicationResponseService } from '../../apps/financial-service/src/gib/application-response.service';

// ─── getTenantContext mock ────────────────────────────────────────────────────
vi.mock('@enkap/database', () => ({
  getTenantContext: () => ({ tenantId: 'test-tenant-id' }),
  TenantDataSourceManager: vi.fn(),
}));

// ─── Test yardımcıları ────────────────────────────────────────────────────────

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-id',
    invoice_number: 'INV-2026-001',
    gib_uuid: 'gib-uuid-1',
    profile_id: 'TICARIFATURA',
    envelope_uuid: 'envelope-id',
    commercial_status: 'BEKLIYOR',
    direction: 'IN',
    ...overrides,
  };
}

function makeService(queryResults: unknown[][]): ApplicationResponseService {
  let callIndex = 0;
  const mockDs = {
    query: vi.fn((_sql: string, _params?: unknown[]) => {
      const result = queryResults[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(result);
    }),
  };

  const mockDsManager = {
    getDataSource: vi.fn().mockResolvedValue(mockDs),
  };

  const mockEnvelope = {
    createAndSend: vi.fn().mockResolvedValue({
      envelopeId: 'response-envelope-id',
      success: true,
    }),
  };

  const mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

  const mockUblBuilder = {};

  const svc = new ApplicationResponseService(
    mockDsManager as never,
    mockEnvelope as never,
    mockAudit as never,
    mockUblBuilder as never,
  );

  // Java imzalama servisini mock'la
  vi.spyOn(svc as never, 'signXml').mockResolvedValue('<SignedXML/>');

  return svc;
}

// ─── Testler ──────────────────────────────────────────────────────────────────

describe('ApplicationResponseService', () => {
  describe('sendResponse — 8 gün kuralı', () => {
    it('8 gün geçmemişse başarıyla yanıt gönderir', async () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 gün önce

      const svc = makeService([
        [makeInvoice()],           // fatura sorgusu
        [{ created_at: recentDate }], // envelope sorgusu
        [],                         // INSERT application_responses
        [],                         // UPDATE application_responses (SENT)
        [],                         // UPDATE invoices commercial_status
      ]);

      const result = await svc.sendResponse(
        { invoiceId: 'invoice-id', responseType: 'KABUL' },
        'user-id',
      );

      expect(result.success).toBe(true);
      expect(result.applicationResponseId).toBeDefined();
    });

    it('8 gün (192 saat) geçmişse BadRequestException fırlatır', async () => {
      const oldDate = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000); // 9 gün önce

      const svc = makeService([
        [makeInvoice()],              // fatura sorgusu
        [{ created_at: oldDate }],    // envelope sorgusu — eski tarih
      ]);

      await expect(
        svc.sendResponse({ invoiceId: 'invoice-id', responseType: 'KABUL' }, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('8 gün tam sınırda (191 saat) geçmemişse kabul eder', async () => {
      const borderDate = new Date(Date.now() - 191 * 60 * 60 * 1000); // 191 saat önce

      const svc = makeService([
        [makeInvoice()],
        [{ created_at: borderDate }],
        [],
        [],
        [],
      ]);

      const result = await svc.sendResponse(
        { invoiceId: 'invoice-id', responseType: 'RED', rejectionReason: 'Hatalı fatura' },
        'user-id',
      );

      expect(result.success).toBe(true);
    });

    it('envelope_uuid yoksa 8 gün kontrolü atlanır', async () => {
      const svc = makeService([
        [makeInvoice({ envelope_uuid: null })], // envelope_uuid yok
        [],
        [],
        [],
      ]);

      const result = await svc.sendResponse(
        { invoiceId: 'invoice-id', responseType: 'KABUL' },
        'user-id',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('sendResponse — domain validasyonları', () => {
    it('yön OUT ise BadRequestException fırlatır', async () => {
      const svc = makeService([[makeInvoice({ direction: 'OUT' })]]);

      await expect(
        svc.sendResponse({ invoiceId: 'invoice-id', responseType: 'KABUL' }, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('TEMELFATURA profili ise BadRequestException fırlatır', async () => {
      const svc = makeService([[makeInvoice({ profile_id: 'TEMELFATURA' })]]);

      await expect(
        svc.sendResponse({ invoiceId: 'invoice-id', responseType: 'KABUL' }, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('commercial_status BEKLIYOR değilse BadRequestException fırlatır', async () => {
      const svc = makeService([[makeInvoice({ commercial_status: 'KABUL' })]]);

      await expect(
        svc.sendResponse({ invoiceId: 'invoice-id', responseType: 'KABUL' }, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('fatura bulunamazsa NotFoundException fırlatır', async () => {
      const svc = makeService([[]]); // boş sonuç

      await expect(
        svc.sendResponse({ invoiceId: 'nonexistent', responseType: 'KABUL' }, 'user-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendResponse — RED yanıtı', () => {
    it('RED yanıtı commercial_status\'u RED olarak günceller', async () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const queries: [string, unknown[]][] = [];

      let callIndex = 0;
      const mockDs = {
        query: vi.fn((sql: string, params: unknown[]) => {
          queries.push([sql, params]);
          const results = [
            [makeInvoice()],
            [{ created_at: recentDate }],
            [],
            [],
            [],
          ];
          return Promise.resolve(results[callIndex++] ?? []);
        }),
      };

      const svc = new ApplicationResponseService(
        { getDataSource: vi.fn().mockResolvedValue(mockDs) } as never,
        { createAndSend: vi.fn().mockResolvedValue({ envelopeId: 'env-id', success: true }) } as never,
        { log: vi.fn().mockResolvedValue(undefined) } as never,
        {} as never,
      );

      vi.spyOn(svc as never, 'signXml').mockResolvedValue('<SignedXML/>');

      await svc.sendResponse(
        { invoiceId: 'invoice-id', responseType: 'RED', rejectionReason: 'Miktar hatalı' },
        'user-id',
      );

      const invoiceUpdateQuery = queries.find(
        ([sql, params]) =>
          typeof sql === 'string' &&
          sql.includes('UPDATE invoices') &&
          Array.isArray(params) &&
          params.includes('RED'),
      );
      expect(invoiceUpdateQuery).toBeDefined();
    });
  });

  describe('ÖEBSD SIS.5 — Audit Log', () => {
    it('başarılı yanıt sonrası audit log yazılır', async () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const mockAudit = { log: vi.fn().mockResolvedValue(undefined) };

      const svc = new ApplicationResponseService(
        {
          getDataSource: vi.fn().mockResolvedValue({
            query: vi.fn()
              .mockResolvedValueOnce([makeInvoice()])
              .mockResolvedValueOnce([{ created_at: recentDate }])
              .mockResolvedValue([]),
          }),
        } as never,
        { createAndSend: vi.fn().mockResolvedValue({ envelopeId: 'env-id', success: true }) } as never,
        mockAudit as never,
        {} as never,
      );

      vi.spyOn(svc as never, 'signXml').mockResolvedValue('<SignedXML/>');

      await svc.sendResponse(
        { invoiceId: 'invoice-id', responseType: 'KABUL' },
        'user-id',
        '127.0.0.1',
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_RESPONSE',
          ipAddress: '127.0.0.1',
        }),
      );
    });
  });
});
