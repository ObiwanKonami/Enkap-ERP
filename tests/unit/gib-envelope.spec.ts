import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MtomSoapService } from '../../apps/financial-service/src/gib/mtom-soap.service';
import { GibEnvelopeService, GIB_STATUS_ACTIONS } from '../../apps/financial-service/src/gib/gib-envelope.service';

// ─── MtomSoapService birim testleri ──────────────────────────────────────────

describe('MtomSoapService', () => {
  let service: MtomSoapService;

  beforeEach(() => {
    service = new MtomSoapService();
  });

  describe('zipAndHash', () => {
    it('geçerli bir ZIP buffer döner', async () => {
      const xml = '<?xml version="1.0"?><root>test</root>';
      const result = await service.zipAndHash(xml, 'test.xml');

      expect(result.zipBuffer).toBeInstanceOf(Buffer);
      expect(result.zipBuffer.length).toBeGreaterThan(0);
    });

    it('ZIP local file header (PK magic) ile başlar', async () => {
      const result = await service.zipAndHash('<root/>', 'invoice.xml');
      // ZIP magic bytes: 0x50 0x4B 0x03 0x04
      expect(result.zipBuffer[0]).toBe(0x50);
      expect(result.zipBuffer[1]).toBe(0x4B);
    });

    it('md5Hash 32 karakter hex döner', async () => {
      const result = await service.zipAndHash('<root/>', 'test.xml');
      expect(result.md5Hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('sha256Hash 64 karakter hex döner', async () => {
      const result = await service.zipAndHash('<root/>', 'test.xml');
      expect(result.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('aynı içerik için aynı hash üretir (deterministik)', async () => {
      const xml = '<deterministic>test</deterministic>';
      const r1 = await service.zipAndHash(xml, 'same.xml');
      const r2 = await service.zipAndHash(xml, 'same.xml');
      expect(r1.md5Hash).toBe(r2.md5Hash);
      expect(r1.sha256Hash).toBe(r2.sha256Hash);
    });
  });

  describe('parseSoapResponse', () => {
    it('statusCode ve statusMessage parse eder', () => {
      const soapXml = `<?xml version="1.0"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <sendDocumentResponse>
              <return>
                <statusCode>1300</statusCode>
                <statusMessage>Başarıyla tamamlandı</statusMessage>
              </return>
            </sendDocumentResponse>
          </soap:Body>
        </soap:Envelope>`;

      const result = service['parseSoapResponse'](soapXml);
      expect(result.statusCode).toBe(1300);
      expect(result.statusMessage).toBe('Başarıyla tamamlandı');
    });

    it('statusCode yoksa 0 döner', () => {
      const result = service['parseSoapResponse']('<empty/>');
      expect(result.statusCode).toBe(0);
    });
  });

  describe('buildSbdhEnvelope', () => {
    it('geçerli SBDH XML yapısı üretir', () => {
      const xml = service['buildSbdhEnvelope']('<Invoice/>', {
        senderAlias: 'urn:mail:sender@test.com',
        receiverAlias: 'urn:mail:receiver@test.com',
        documentId: 'test-uuid',
        filename: 'test.zip',
      });

      expect(xml).toContain('StandardBusinessDocumentHeader');
      expect(xml).toContain('urn:mail:sender@test.com');
      expect(xml).toContain('urn:mail:receiver@test.com');
      expect(xml).toContain('test-uuid');
    });
  });
});

// ─── GIB_STATUS_ACTIONS testleri ─────────────────────────────────────────────

describe('GIB_STATUS_ACTIONS', () => {
  it('1300 kodu SUCCESS olarak haritalanır', () => {
    expect(GIB_STATUS_ACTIONS[1300]?.status).toBe('SUCCESS');
  });

  it('1140 kodu FAILED olarak haritalanır', () => {
    expect(GIB_STATUS_ACTIONS[1140]?.status).toBe('FAILED');
  });

  it('1220 kodu PROCESSING olarak haritalanır (hedef yanıt bekleniyor)', () => {
    expect(GIB_STATUS_ACTIONS[1220]?.status).toBe('PROCESSING');
  });

  it('1163 kodu FAILED olarak haritalanır (ETTN çakışması)', () => {
    expect(GIB_STATUS_ACTIONS[1163]?.status).toBe('FAILED');
  });

  it('1000 kodu PROCESSING olarak haritalanır (kuyruğa eklendi)', () => {
    expect(GIB_STATUS_ACTIONS[1000]?.status).toBe('PROCESSING');
  });

  it('tüm başarı kodları açıklama içerir', () => {
    for (const [code, action] of Object.entries(GIB_STATUS_ACTIONS)) {
      expect(action.description).toBeTruthy();
      expect(['PROCESSING', 'SUCCESS', 'FAILED']).toContain(action.status);
      void code;
    }
  });
});

// ─── GibEnvelopeService.applyGibStatus testleri ──────────────────────────────

describe('GibEnvelopeService.applyGibStatus', () => {
  it('bilinmeyen GİB kodu için erken dönülür', async () => {
    const mockDs = { query: vi.fn().mockResolvedValue([]) };
    const mockDsManager = {
      getDataSource: vi.fn().mockResolvedValue(mockDs),
    };
    const mockMtom = {} as MtomSoapService;
    const mockAudit = { log: vi.fn() };

    const svc = new GibEnvelopeService(
      mockDsManager as never,
      mockMtom,
      mockAudit as never,
    );

    await svc.applyGibStatus('env-id', 'tenant-id', 9999, '');
    // bilinmeyen kod → DB sorgusu çalışmamalı
    expect(mockDs.query).not.toHaveBeenCalled();
  });

  it('1300 kodu faturayı ACCEPTED_GIB yapar', async () => {
    const queries: [string, unknown[]][] = [];
    const mockDs = {
      query: vi.fn((sql: string, params: unknown[]) => {
        queries.push([sql, params]);
        return Promise.resolve([]);
      }),
    };
    const mockDsManager = { getDataSource: vi.fn().mockResolvedValue(mockDs) };
    const mockMtom = {} as MtomSoapService;
    const mockAudit = { log: vi.fn() };

    const svc = new GibEnvelopeService(
      mockDsManager as never,
      mockMtom,
      mockAudit as never,
    );

    await svc.applyGibStatus('env-id', 'tenant-id', 1300, 'raw');

    const invoiceUpdate = queries.find(([sql]) =>
      sql.includes('UPDATE invoices') && sql.includes('ACCEPTED_GIB'),
    );
    expect(invoiceUpdate).toBeDefined();
  });
});
