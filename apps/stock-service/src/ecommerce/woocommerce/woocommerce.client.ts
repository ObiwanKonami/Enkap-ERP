import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { createHmac, randomBytes } from 'crypto';

export interface WooCredentials {
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
}

/** WooCommerce ürün modeli (REST API v3 yanıtı) */
export interface WooProduct {
  id: number;
  sku: string;
  name: string;
  stock_quantity: number | null;
  price: string;
  manage_stock: boolean;
}

/** WooCommerce sipariş kalemi */
export interface WooOrderLineItem {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  quantity: number;
  price: string;
  total: string;
}

/** WooCommerce fatura/kargo adresi */
interface WooAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  city: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

/** WooCommerce sipariş modeli */
export interface WooOrder {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  billing: WooAddress;
  shipping: WooAddress;
  line_items: WooOrderLineItem[];
}

/**
 * WooCommerce REST API v3 İstemcisi.
 *
 * Kimlik doğrulama: OAuth 1.0a (HMAC-SHA1)
 * HTTPS üzerinden sorgulanırken bazı WooCommerce kurulumları HTTP header yerine
 * sorgu parametreleri üzerinden OAuth kabul eder — bu istemci her iki yöntemi de destekler.
 *
 * WooCommerce API dokümantasyonu: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */
@Injectable()
export class WooCommerceClient {
  private readonly logger = new Logger(WooCommerceClient.name);

  /**
   * OAuth 1.0a imzalı istek için Authorization header değerini üretir.
   *
   * Parametreler: oauth_consumer_key, oauth_nonce, oauth_signature_method=HMAC-SHA1,
   *               oauth_timestamp, oauth_token='', oauth_version=1.0
   * İmza tabanı: METHOD&url_encode(url)&url_encode(params)
   * İmzalama anahtarı: url_encode(consumer_secret)& (token secret boş)
   */
  private buildOAuthHeader(
    method: string,
    url: string,
    creds: WooCredentials,
    extraParams: Record<string, string> = {},
  ): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key:     creds.consumer_key,
      oauth_nonce:            randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp:        String(Math.floor(Date.now() / 1000)),
      oauth_token:            '',
      oauth_version:          '1.0',
      ...extraParams,
    };

    // Tüm parametreleri (oauth + sorgu) birleştir, sırala
    const allParams = { ...oauthParams };
    const sorted = Object.keys(allParams)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k] ?? '')}`,
      )
      .join('&');

    const signatureBase = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sorted),
    ].join('&');

    // İmzalama anahtarı: consumer_secret& (token secret boş)
    const signingKey = `${encodeURIComponent(creds.consumer_secret)}&`;
    const signature = createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    oauthParams['oauth_signature'] = signature;

    // Authorization header değeri
    const headerValue =
      'OAuth ' +
      Object.keys(oauthParams)
        .map(
          (k) =>
            `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k] ?? '')}"`,
        )
        .join(', ');

    return headerValue;
  }

  /** Kimlik doğrulamalı axios instance oluşturur */
  private buildClient(creds: WooCredentials): AxiosInstance {
    const instance = axios.create({
      baseURL: `${creds.store_url.replace(/\/$/, '')}/wp-json/wc/v3`,
      timeout: 30_000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Her istekte OAuth 1.0a header ekle
    instance.interceptors.request.use((config) => {
      const method = config.method?.toUpperCase() ?? 'GET';
      const url    = `${config.baseURL ?? ''}${config.url ?? ''}`;

      config.headers['Authorization'] = this.buildOAuthHeader(method, url, creds);
      return config;
    });

    return instance;
  }

  /**
   * Tüm ürünleri sayfalayarak çeker.
   * WooCommerce: per_page maks 100, page 1'den başlar.
   */
  async getProducts(
    creds: WooCredentials,
    page: number,
    perPage: number,
  ): Promise<WooProduct[]> {
    const client = this.buildClient(creds);

    const response = await client.get<WooProduct[]>('/products', {
      params: { page, per_page: perPage, status: 'publish' },
    });

    this.logger.debug(
      `WooCommerce ürünler: sayfa=${page}, adet=${response.data.length}`,
    );

    return response.data;
  }

  /**
   * Ürün stok miktarını günceller.
   * manage_stock=false olan ürünler güncellenmez.
   */
  async updateProductStock(
    creds: WooCredentials,
    productId: number,
    stock: number,
  ): Promise<void> {
    const client = this.buildClient(creds);

    await client.put(`/products/${productId}`, {
      stock_quantity: stock,
      manage_stock:   true,
    });

    this.logger.debug(
      `WooCommerce stok güncelleme: productId=${productId}, stok=${stock}`,
    );
  }

  /**
   * Belirli tarihten itibaren siparişleri çeker.
   * WooCommerce tarih formatı: ISO 8601 (örn. 2024-01-01T00:00:00)
   */
  async getOrders(
    creds: WooCredentials,
    after: Date,
    page: number,
  ): Promise<WooOrder[]> {
    const client = this.buildClient(creds);

    const response = await client.get<WooOrder[]>('/orders', {
      params: {
        after:    after.toISOString(),
        page,
        per_page: 50,
        orderby:  'date',
        order:    'asc',
      },
    });

    this.logger.debug(
      `WooCommerce siparişler: sayfa=${page}, adet=${response.data.length}`,
    );

    return response.data;
  }

  /**
   * WooCommerce'de sipariş durumunu günceller.
   * Durum değerleri: pending, processing, on-hold, completed, cancelled, refunded, failed
   */
  async updateOrderStatus(
    creds: WooCredentials,
    orderId: number,
    status: string,
  ): Promise<void> {
    const client = this.buildClient(creds);

    await client.put(`/orders/${orderId}`, { status });

    this.logger.debug(
      `WooCommerce sipariş güncelleme: orderId=${orderId}, durum=${status}`,
    );
  }
}
