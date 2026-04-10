import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { createHash, randomBytes } from 'crypto';

export interface IyzicoCredentials {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

export interface IyzicoCardDetails {
  cardHolderName: string;
  cardNumber: string;  // Test: 5528790000000008
  expireMonth: string;
  expireYear: string;
  cvc: string;
}

export interface IyzicoSubscribeRequest {
  tenantId: string;
  email: string;
  companyName: string;
  pricingPlanRef: string;
  card: IyzicoCardDetails;
}

export interface IyzicoSubscribeResult {
  referenceCode: string;        // subscriptionReferenceCode
  customerReferenceCode: string;
  cardToken: string;
  status: 'success' | 'failure';
  errorMessage?: string;
}

export interface IyzicoChargeRequest {
  subscriptionRef: string;
  customerRef: string;
  cardToken: string;
  amountKurus: number;
  tenantId: string;
  invoiceNumber: string;
}

export interface IyzicoChargeResult {
  paymentId: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  errorCode?: string;
}

/**
 * iyzico Ödeme Sistemi API İstemcisi.
 *
 * Belge: https://dev.iyzipay.com
 * Türkiye'nin lider ödeme altyapısı — PCI DSS Level 1 sertifikalı.
 *
 * Kimlik doğrulama: PKI (Private Key Infrastructure)
 *   Authorization: IYZWS <apiKey>:<signature>
 *   signature = base64(sha256(apiKey + randomKey + secretKey + sortedBody))
 *
 * Test kartları:
 *   5528790000000008 (başarılı)
 *   5400010000000004 (yetersiz bakiye)
 *
 * PCI DSS Notu: Kart numaraları ASLA Enkap sunucularında saklanmaz.
 * Enkap sadece iyzico'dan dönen card token'ı saklar.
 */
@Injectable()
export class IyzicoClient {
  private readonly logger = new Logger(IyzicoClient.name);

  private readonly credentials: IyzicoCredentials = {
    apiKey:    process.env.IYZICO_API_KEY    ?? 'sandbox-api-key',
    secretKey: process.env.IYZICO_SECRET_KEY ?? 'sandbox-secret-key',
    baseUrl:   process.env.IYZICO_BASE_URL   ?? 'https://sandbox-api.iyzipay.com',
  };

  private buildClient(): AxiosInstance {
    return axios.create({
      baseURL:  this.credentials.baseUrl,
      timeout:  30_000,
      headers:  { 'Content-Type': 'application/json' },
    });
  }

  /**
   * iyzico PKI imzalama.
   * signature = base64(sha256(apiKey + randomKey + secretKey + sortedRequestBody))
   */
  private sign(randomKey: string, body: string): string {
    const hash = createHash('sha256')
      .update(`${this.credentials.apiKey}${randomKey}${this.credentials.secretKey}${body}`)
      .digest('base64');
    return hash;
  }

  private buildHeaders(body: string): Record<string, string> {
    const randomKey = randomBytes(12).toString('hex');
    const signature = this.sign(randomKey, body);

    return {
      Authorization:    `IYZWS ${this.credentials.apiKey}:${signature}`,
      'x-ily-random-key': randomKey,
    };
  }

  /**
   * Yeni abonelik oluştur.
   * iyzico subscription API: POST /v2/subscription/subscriptions
   */
  async createSubscription(
    req: IyzicoSubscribeRequest,
  ): Promise<IyzicoSubscribeResult> {
    const body = {
      locale: 'tr',
      conversationId: req.tenantId,
      pricingPlanReferenceCode: req.pricingPlanRef,
      subscriptionInitialStatus: 'ACTIVE',
      customer: {
        name:    req.companyName,
        email:   req.email,
        gsmNumber: '',
        billingAddress: {
          contactName: req.companyName,
          city:        'İstanbul',
          country:     'Türkiye',
          address:     'Türkiye',
        },
      },
      paymentCard: {
        cardHolderName: req.card.cardHolderName,
        cardNumber:     req.card.cardNumber,
        expireMonth:    req.card.expireMonth,
        expireYear:     req.card.expireYear,
        cvc:            req.card.cvc,
        registerCard:   1,  // Kartı tokene kaydet
      },
    };

    const bodyStr = JSON.stringify(body);
    const client  = this.buildClient();

    try {
      const response = await client.post<{
        status:                   string;
        referenceCode:            string;
        customerReferenceCode:    string;
        cardToken:                string;
        errorMessage?:            string;
      }>('/v2/subscription/subscriptions', body, {
        headers: this.buildHeaders(bodyStr),
      });

      const data = response.data;

      if (data.status !== 'success') {
        this.logger.warn(`iyzico abonelik hatası: ${data.errorMessage ?? 'Bilinmeyen hata'}`);
        return {
          referenceCode:         '',
          customerReferenceCode: '',
          cardToken:             '',
          status:                'failure',
          errorMessage:          data.errorMessage,
        };
      }

      return {
        referenceCode:         data.referenceCode,
        customerReferenceCode: data.customerReferenceCode,
        cardToken:             data.cardToken,
        status:                'success',
      };
    } catch (err) {
      this.logger.error('iyzico abonelik isteği başarısız', err);
      throw err;
    }
  }

  /**
   * Manuel ödeme tahsilatı (dunning için).
   * Kayıtlı kart tokenıyla ödeme al.
   */
  async chargeCard(req: IyzicoChargeRequest): Promise<IyzicoChargeResult> {
    const amountTl = (req.amountKurus / 100).toFixed(2);

    const body = {
      locale:         'tr',
      conversationId: `${req.tenantId}-${req.invoiceNumber}`,
      price:          amountTl,
      paidPrice:      amountTl,
      currency:       'TRY',
      installment:    1,
      paymentChannel: 'WEB',
      paymentGroup:   'SUBSCRIPTION',
      paymentCard: {
        cardToken:    req.cardToken,
        cardUserKey:  req.customerRef,
      },
      buyer: {
        id:          req.tenantId,
        name:        'Enkap',
        surname:     'Kullanıcısı',
        email:       'billing@enkap.com',
        identityNumber: '11111111111',
        registrationAddress: 'Türkiye',
        city:        'İstanbul',
        country:     'Türkiye',
        ip:          '127.0.0.1',
      },
      shippingAddress: { address: 'Türkiye', city: 'İstanbul', country: 'Türkiye', contactName: 'Enkap' },
      billingAddress:  { address: 'Türkiye', city: 'İstanbul', country: 'Türkiye', contactName: 'Enkap' },
      basketItems: [{
        id:        req.invoiceNumber,
        name:      'Enkap ERP Abonelik',
        category1: 'SaaS',
        itemType:  'VIRTUAL',
        price:     amountTl,
      }],
    };

    const bodyStr = JSON.stringify(body);
    const client  = this.buildClient();

    try {
      const response = await client.post<{
        status:        string;
        paymentId:     string;
        errorMessage?: string;
        errorCode?:    string;
      }>('/payment/auth', body, {
        headers: this.buildHeaders(bodyStr),
      });

      const data = response.data;

      return {
        paymentId:    data.paymentId,
        status:       data.status === 'success' ? 'success' : 'failure',
        errorMessage: data.errorMessage,
        errorCode:    data.errorCode,
      };
    } catch (err) {
      this.logger.error('iyzico ödeme isteği başarısız', err);
      throw err;
    }
  }

  /** Aboneliği iyzico tarafında iptal et */
  async cancelSubscription(subscriptionRef: string): Promise<void> {
    const body    = { locale: 'tr', subscriptionReferenceCode: subscriptionRef };
    const bodyStr = JSON.stringify(body);
    const client  = this.buildClient();

    await client.put('/v2/subscription/cancel', body, {
      headers: this.buildHeaders(bodyStr),
    });

    this.logger.log(`iyzico abonelik iptal edildi: ${subscriptionRef}`);
  }
}
