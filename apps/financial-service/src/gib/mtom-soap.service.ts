import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { createGzip } from 'zlib';
import { promisify } from 'util';

const gzip = promisify(createGzip);

/**
 * MTOM SOAP Servis
 *
 * EF-VAP protokolü SOAP 1.2 + MTOM (Message Transmission Optimization Mechanism) kullanır.
 * REST/JSON ile GİB'e ASLA çıkılmaz.
 *
 * Sorumluluklar:
 *  1. XML'i ZIP'le + MD5/SHA-256 hash hesapla
 *  2. SBDH (StandardBusinessDocument) zarfını oluştur
 *  3. MTOM multipart/related payload'ı oluştur
 *  4. SOAP sendDocument isteğini gönder
 *  5. MTOM yanıtını parse et
 *  6. getApplicationResponse SOAP metodunu çağır
 *
 * KRİTİK: İmzalanmış XML'e dokunma — tek boşluk bile hash'i bozar.
 */
@Injectable()
export class MtomSoapService {
  private readonly logger = new Logger(MtomSoapService.name);

  private readonly GIB_SOAP_ENDPOINT =
    process.env.GIB_SOAP_ENDPOINT ??
    'https://efaturamerkeztest.efatura.gov.tr/EFaturaMerkez/services/EFatura';

  private readonly GIB_EARSIV_SOAP_ENDPOINT =
    process.env.GIB_EARSIV_SOAP_ENDPOINT ??
    'https://test.efatura.gov.tr/earsiv/services/EArsivWsPort';

  private readonly GIB_GB_ALIAS =
    process.env.GIB_GB_ALIAS ?? 'urn:mail:defaultgb@enkap.com.tr';

  /**
   * İmzalanmış XML'i ZIP'ler ve hash'lerini hesaplar.
   *
   * KRİTİK: signedXml hiçbir şekilde modifiye edilmez.
   * Boşluk ekleme, trim, format — hepsi imzayı bozar.
   */
  async zipAndHash(
    signedXml: string,
    filename: string,
  ): Promise<{ zipBuffer: Buffer; md5Hash: string; sha256Hash: string }> {
    const xmlBuffer = Buffer.from(signedXml, 'utf-8');

    // ZIP sıkıştırma (zlib DEFLATE — GİB ZIP formatı)
    const zipBuffer = await this.compressToZip(xmlBuffer, filename);

    // MD5 (GİB sendDocument body'sinde gönderilir)
    const md5Hash = createHash('md5').update(zipBuffer).digest('hex');
    // SHA-256 (ISO 27001 audit kaydı için)
    const sha256Hash = createHash('sha256').update(zipBuffer).digest('hex');

    this.logger.debug(
      `ZIP oluşturuldu: dosya=${filename} boyut=${zipBuffer.length} md5=${md5Hash}`,
    );

    return { zipBuffer, md5Hash, sha256Hash };
  }

  /**
   * SBDH (StandardBusinessDocument Header) zarfını oluşturur.
   * İmzalı XML Base64 olarak SBDH içine gömülür.
   *
   * KRİTİK: Bu noktada signedXml değiştirilmez — direkt Base64 encode edilir.
   */
  buildSbdhEnvelope(
    signedXml: string,
    params: {
      envelopeUuid: string;
      senderAlias: string;
      receiverAlias: string;
      documentType: 'INVOICE' | 'DESPATCH_ADVICE' | 'APPLICATION_RESPONSE';
    },
  ): string {
    const xmlBase64 = Buffer.from(signedXml, 'utf-8').toString('base64');
    const now = new Date().toISOString();

    return `<?xml version="1.0" encoding="UTF-8"?>
<StandardBusinessDocument xmlns="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">
  <StandardBusinessDocumentHeader>
    <HeaderVersion>1.0</HeaderVersion>
    <Sender>
      <Identifier Authority="GIB">${params.senderAlias}</Identifier>
    </Sender>
    <Receiver>
      <Identifier Authority="GIB">${params.receiverAlias}</Identifier>
    </Receiver>
    <DocumentIdentification>
      <Standard>urn:oasis:names:specification:ubl:schema:xsd:Invoice-2</Standard>
      <TypeVersion>2.1</TypeVersion>
      <InstanceIdentifier>${params.envelopeUuid}</InstanceIdentifier>
      <Type>${params.documentType}</Type>
      <CreationDateAndTime>${now}</CreationDateAndTime>
    </DocumentIdentification>
  </StandardBusinessDocumentHeader>
  <Payload>${xmlBase64}</Payload>
</StandardBusinessDocument>`;
  }

  /**
   * GİB EF-VAP sendDocument SOAP MTOM isteği oluşturur ve gönderir.
   *
   * MTOM yapısı (RFC 2387 multipart/related):
   *  - Part 1: SOAP Envelope (XOP referans içerir)
   *  - Part 2: ZIP binary attachment
   *
   * KRİTİK: REST/JSON kullanılmaz — SOAP 1.2 + MTOM zorunludur.
   */
  async sendDocument(params: {
    zipBuffer: Buffer;
    md5Hash: string;
    filename: string;
    senderAlias: string;
    receiverAlias?: string;
  }): Promise<{ success: boolean; statusCode?: number; statusMessage?: string; rawResponse?: string }> {
    const boundary = `uuid:enkap-${randomUUID()}`;
    const contentId = `attachment.zip@enkap.com.tr`;
    const rootId = `root.xml@enkap.com.tr`;

    const soapEnvelope = this.buildSendDocumentSoap(
      params.filename,
      params.md5Hash,
      contentId,
      params.senderAlias,
      params.receiverAlias ?? this.GIB_GB_ALIAS,
    );

    // MTOM multipart/related body
    const mtomBody = this.buildMtomBody({
      boundary,
      rootId,
      contentId,
      soapEnvelope,
      zipBuffer: params.zipBuffer,
    });

    const contentType =
      `multipart/related; type="application/xop+xml"; ` +
      `boundary="${boundary}"; start="<${rootId}>"; ` +
      `start-info="text/xml"`;

    this.logger.log(
      `GİB sendDocument gönderiliyor: dosya=${params.filename} boyut=${params.zipBuffer.length}`,
    );

    try {
      const response = await fetch(this.GIB_SOAP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'SOAPAction': '"sendDocument"',
        },
        body: mtomBody as unknown as string,
      });

      const rawResponse = await response.text();
      this.logger.debug(`GİB ham yanıt: ${rawResponse.substring(0, 500)}`);

      const parsed = this.parseSoapResponse(rawResponse);

      return {
        success: response.ok,
        statusCode: parsed.statusCode,
        statusMessage: parsed.statusMessage,
        rawResponse,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`GİB sendDocument hatası: ${message}`);
      return { success: false, statusMessage: message };
    }
  }

  /**
   * GİB EF-VAP getApplicationResponse SOAP isteği (polling).
   * 5 saatte bir cron ile çağrılır.
   * Yanıt GİB durum kodlarını (1000-1300) döner.
   */
  async getApplicationResponse(params: {
    envelopeUuid: string;
    senderAlias: string;
  }): Promise<{ statusCode: number; statusMessage: string; rawResponse?: string }> {
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getApplicationResponseRequest>
      <senderAlias>${params.senderAlias}</senderAlias>
      <envelopeId>${params.envelopeUuid}</envelopeId>
    </getApplicationResponseRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

    try {
      const response = await fetch(this.GIB_SOAP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'SOAPAction': '"getApplicationResponse"',
        },
        body: soapBody,
      });

      const rawResponse = await response.text();
      const parsed = this.parseSoapResponse(rawResponse);

      return {
        statusCode: parsed.statusCode ?? 0,
        statusMessage: parsed.statusMessage ?? '',
        rawResponse,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`getApplicationResponse hatası: ${message}`);
      return { statusCode: 0, statusMessage: message };
    }
  }

  /**
   * GİB SOAP yanıtındaki MTOM attachment'ı parse eder.
   * Gelen irsaliye/fatura yanıtlarında ZIP attachment bulunabilir.
   */
  parseMtomResponse(rawResponse: string): { xml?: string; statusCode?: number } {
    // multipart sınırını bul
    const boundaryMatch = rawResponse.match(/boundary="([^"]+)"/);
    if (!boundaryMatch) {
      return this.parseSoapResponse(rawResponse);
    }

    const boundary = `--${boundaryMatch[1]}`;
    const parts = rawResponse.split(boundary).filter((p) => p.trim() && p !== '--');

    // İkinci part ZIP attachment (base64 encoded)
    if (parts.length >= 2) {
      const attachmentPart = parts[1]!;
      const base64Match = attachmentPart.match(/\r?\n\r?\n([\s\S]+)/);
      if (base64Match) {
        try {
          const xmlContent = Buffer.from(base64Match[1]!.trim(), 'base64').toString('utf-8');
          return { xml: xmlContent };
        } catch {
          this.logger.warn('MTOM attachment parse edilemedi');
        }
      }
    }

    return this.parseSoapResponse(rawResponse);
  }

  /**
   * GİB e-Arşiv Raporlama SOAP API'ye MTOM ile rapor gönderir.
   * EArsivWs.wsdl — sendDocumentFile operasyonu (SOAPAction: urn:SendDocumentFile).
   *
   * Kimlik doğrulama: Enkap entegratör mali mühürü (XAdES-BES) — API key/OAuth yok.
   * KRİTİK: REST/JSON değil; EF-VAP ile aynı MTOM altyapısı kullanılır.
   *
   * @returns paketId — getBatchStatus sorgusunda kullanılır; e_archive_reports.gib_reference_number olarak saklanır.
   */
  async sendDocumentFile(
    signedXml: string,
    filename: string,
  ): Promise<{ success: boolean; paketId?: string; rawResponse?: string }> {
    const { zipBuffer, md5Hash } = await this.zipAndHash(signedXml, filename);

    const boundary = `uuid:enkap-${randomUUID()}`;
    const contentId = `attachment.zip@enkap.com.tr`;
    const rootId = `root.xml@enkap.com.tr`;

    const soapEnvelope = this.buildSendDocumentFileSoap(filename, md5Hash, contentId);

    const mtomBody = this.buildMtomBody({
      boundary,
      rootId,
      contentId,
      soapEnvelope,
      zipBuffer,
    });

    const contentType =
      `multipart/related; type="application/xop+xml"; ` +
      `boundary="${boundary}"; start="<${rootId}>"; ` +
      `start-info="text/xml"`;

    this.logger.log(
      `e-Arşiv sendDocumentFile gönderiliyor: dosya=${filename} boyut=${zipBuffer.length}`,
    );

    try {
      const response = await fetch(this.GIB_EARSIV_SOAP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'SOAPAction': '"urn:SendDocumentFile"',
        },
        body: mtomBody as unknown as string,
      });

      const rawResponse = await response.text();
      this.logger.debug(`e-Arşiv sendDocumentFile yanıtı: ${rawResponse.substring(0, 500)}`);

      const paketId = this.parseEarsivPaketId(rawResponse);

      return { success: response.ok, paketId, rawResponse };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`e-Arşiv sendDocumentFile hatası: ${message}`);
      return { success: false };
    }
  }

  /**
   * GİB e-Arşiv Raporlama SOAP — getBatchStatus operasyonu (SOAPAction: urn:GetBatchStatus).
   * sendDocumentFile'dan dönen paketId ile paket işleme durumunu sorgular.
   *
   * @returns durumKodu — GİB e-Arşiv durum kodu; durumAciklama — açıklama metni
   */
  async getBatchStatus(paketId: string): Promise<{
    durumKodu: number;
    durumAciklama: string;
    paketId: string;
  }> {
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <getBatchStatusRequest>
      <paketId>${paketId}</paketId>
    </getBatchStatusRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

    try {
      const response = await fetch(this.GIB_EARSIV_SOAP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'SOAPAction': '"urn:GetBatchStatus"',
        },
        body: soapBody,
      });

      const rawResponse = await response.text();
      return this.parseGetBatchStatusResponse(rawResponse, paketId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`e-Arşiv getBatchStatus hatası: ${message}`);
      return { durumKodu: 0, durumAciklama: message, paketId };
    }
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  private buildSendDocumentSoap(
    filename: string,
    md5Hash: string,
    attachmentContentId: string,
    senderAlias: string,
    receiverAlias: string,
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xop="http://www.w3.org/2004/08/xop/include">
  <soapenv:Body>
    <sendDocumentRequest>
      <sender>${senderAlias}</sender>
      <receiver>${receiverAlias}</receiver>
      <document>
        <fileName>${filename}</fileName>
        <binaryData><xop:Include href="cid:${attachmentContentId}"/></binaryData>
        <hash>${md5Hash}</hash>
      </document>
    </sendDocumentRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private buildMtomBody(params: {
    boundary: string;
    rootId: string;
    contentId: string;
    soapEnvelope: string;
    zipBuffer: Buffer;
  }): Buffer {
    const delimiter = `--${params.boundary}`;
    const textPart =
      `${delimiter}\r\n` +
      `Content-Type: application/xop+xml; charset=UTF-8; type="text/xml"\r\n` +
      `Content-Transfer-Encoding: 8bit\r\n` +
      `Content-ID: <${params.rootId}>\r\n` +
      `\r\n` +
      `${params.soapEnvelope}\r\n`;

    const attachmentHeader =
      `${delimiter}\r\n` +
      `Content-Type: application/zip\r\n` +
      `Content-Transfer-Encoding: binary\r\n` +
      `Content-ID: <${params.contentId}>\r\n` +
      `\r\n`;

    const closing = `\r\n${delimiter}--\r\n`;

    return Buffer.concat([
      Buffer.from(textPart, 'utf-8'),
      Buffer.from(attachmentHeader, 'utf-8'),
      params.zipBuffer,
      Buffer.from(closing, 'utf-8'),
    ]);
  }

  private parseSoapResponse(rawResponse: string): { statusCode?: number; statusMessage?: string } {
    // GİB yanıt formatı: <statusCode>1300</statusCode><statusMessage>...</statusMessage>
    const codeMatch = rawResponse.match(/<statusCode>(\d+)<\/statusCode>/);
    const msgMatch = rawResponse.match(/<statusMessage>(.*?)<\/statusMessage>/s);

    return {
      statusCode: codeMatch ? parseInt(codeMatch[1]!, 10) : undefined,
      statusMessage: msgMatch ? msgMatch[1] : undefined,
    };
  }

  /** Node.js'de native ZIP (deflate raw) — zlib kullanır */
  private async compressToZip(content: Buffer, filename: string): Promise<Buffer> {
    // Minimal ZIP formatı manuel oluşturma (zlib DEFLATE + ZIP local file header)
    const compressedContent = await this.deflateRaw(content);
    const now = new Date();
    const dosDate = this.toDosDate(now);
    const dosTime = this.toDosTime(now);
    const crc32 = this.crc32(content);

    const filenameBytes = Buffer.from(filename, 'utf-8');
    const localHeader = Buffer.alloc(30 + filenameBytes.length);
    // Local file header signature
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);   // version needed
    localHeader.writeUInt16LE(0, 6);    // general purpose bit flag
    localHeader.writeUInt16LE(8, 8);    // compression method (DEFLATE)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(compressedContent.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(filenameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);   // extra field length
    filenameBytes.copy(localHeader, 30);

    const localFileOffset = 0;
    const centralDir = Buffer.alloc(46 + filenameBytes.length);
    // Central directory signature
    centralDir.writeUInt32LE(0x02014b50, 0);
    centralDir.writeUInt16LE(20, 4);    // version made by
    centralDir.writeUInt16LE(20, 6);    // version needed
    centralDir.writeUInt16LE(0, 8);
    centralDir.writeUInt16LE(8, 10);    // compression method
    centralDir.writeUInt16LE(dosTime, 12);
    centralDir.writeUInt16LE(dosDate, 14);
    centralDir.writeUInt32LE(crc32, 16);
    centralDir.writeUInt32LE(compressedContent.length, 20);
    centralDir.writeUInt32LE(content.length, 24);
    centralDir.writeUInt16LE(filenameBytes.length, 28);
    centralDir.writeUInt16LE(0, 30);    // extra field length
    centralDir.writeUInt16LE(0, 32);    // file comment length
    centralDir.writeUInt16LE(0, 34);    // disk number start
    centralDir.writeUInt16LE(0, 36);    // internal attr
    centralDir.writeUInt32LE(0, 38);    // external attr
    centralDir.writeUInt32LE(localFileOffset, 42);
    filenameBytes.copy(centralDir, 46);

    const centralDirOffset = localHeader.length + compressedContent.length;
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(1, 8);      // entries on this disk
    endRecord.writeUInt16LE(1, 10);     // total entries
    endRecord.writeUInt32LE(centralDir.length, 12);
    endRecord.writeUInt32LE(centralDirOffset, 16);
    endRecord.writeUInt16LE(0, 20);

    return Buffer.concat([localHeader, compressedContent, centralDir, endRecord]);
  }

  private deflateRaw(input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const zlib = require('zlib') as typeof import('zlib');
      zlib.deflateRaw(input, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  private crc32(buf: Buffer): number {
    const table = MtomSoapService.getCrc32Table();
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc = (crc >>> 8) ^ table[((crc ^ byte) & 0xff)]!;
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private static crc32Table: Uint32Array | null = null;
  private static getCrc32Table(): Uint32Array {
    if (!MtomSoapService.crc32Table) {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        t[i] = c;
      }
      MtomSoapService.crc32Table = t;
    }
    return MtomSoapService.crc32Table;
  }

  private toDosDate(d: Date): number {
    return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  }

  private toDosTime(d: Date): number {
    return (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  }

  private buildSendDocumentFileSoap(
    filename: string,
    md5Hash: string,
    attachmentContentId: string,
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:xop="http://www.w3.org/2004/08/xop/include">
  <soapenv:Body>
    <sendDocumentFileRequest>
      <fileName>${filename}</fileName>
      <binaryData><xop:Include href="cid:${attachmentContentId}"/></binaryData>
      <hash>${md5Hash}</hash>
    </sendDocumentFileRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private parseEarsivPaketId(rawResponse: string): string | undefined {
    const match = rawResponse.match(/<paketId>([^<]+)<\/paketId>/);
    return match?.[1];
  }

  private parseGetBatchStatusResponse(
    rawResponse: string,
    fallbackPaketId: string,
  ): { durumKodu: number; durumAciklama: string; paketId: string } {
    const codeMatch = rawResponse.match(/<durumKodu>(\d+)<\/durumKodu>/);
    const descMatch = rawResponse.match(/<durumAciklama>(.*?)<\/durumAciklama>/s);
    const idMatch   = rawResponse.match(/<paketId>([^<]+)<\/paketId>/);
    return {
      durumKodu:     codeMatch ? parseInt(codeMatch[1]!, 10) : 0,
      durumAciklama: descMatch?.[1] ?? '',
      paketId:       idMatch?.[1] ?? fallbackPaketId,
    };
  }
}
