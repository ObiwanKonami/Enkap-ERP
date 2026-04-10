import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export interface IdeaSoftCredentials {
  api_key: string;
  store_hash: string;
}

/** İdeaSoft ürün modeli */
export interface IdeaSoftProduct {
  id:        number;
  code:      string;
  name:      string;
  quantity:  number;
  salePrice: number;
}

/** İdeaSoft sipariş kalemi */
export interface IdeaSoftOrderLine {
  productId:   number;
  productCode: string;
  name:        string;
  quantity:    number;
  price:       number;
}

/** İdeaSoft sipariş modeli */
export interface IdeaSoftOrder {
  id:      number;
  orderNo: string;
  date:    string;
  total:   number;
  lines:   IdeaSoftOrderLine[];
}

/**
 * İdeaSoft E-ticaret API İstemcisi.
 *
 * Türkiye merkezli e-ticaret platformu (KOBİ odaklı).
 * Kimlik doğrulama: Authorization: Bearer {api_key} + X-Store-Hash header
 * Base URL: https://api.ideasoft.com.tr/api/v1
 *
 * Stub mod: IDEASOFT_API_URL env tanımlı değilse gerçek istek yapılmaz.
 */
@Injectable()
export class IdeaSoftClient {
  private readonly logger = new Logger(IdeaSoftClient.name);
  private readonly baseUrl: string;
  private readonly stubMode: boolean;

  constructor() {
    const apiUrl = process.env['IDEASOFT_API_URL'];

    if (!apiUrl) {
      this.logger.warn(
        'IDEASOFT_API_URL tanımlanmamış — stub mod aktif (gerçek API çağrısı yapılmayacak)',
      );
      this.baseUrl  = 'https://api.ideasoft.com.tr/api/v1';
      this.stubMode = true;
    } else {
      this.baseUrl  = apiUrl;
      this.stubMode = false;
    }
  }

  private buildClient(creds: IdeaSoftCredentials): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization:   `Bearer ${creds.api_key}`,
        'X-Store-Hash':  creds.store_hash,
        'Content-Type':  'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * İdeaSoft ürün listesini sayfalayarak çeker.
   * page parametresi 1'den başlar.
   */
  async getProducts(
    creds: IdeaSoftCredentials,
    page: number,
  ): Promise<IdeaSoftProduct[]> {
    if (this.stubMode) {
      this.logger.debug(`İdeaSoft stub mod: getProducts sayfa=${page}`);
      return [];
    }

    const client = this.buildClient(creds);

    const response = await client.get<{ data: IdeaSoftProduct[]; meta: { total: number } }>(
      '/products',
      { params: { page, per_page: 100 } },
    );

    this.logger.debug(
      `İdeaSoft ürünler: sayfa=${page}, adet=${response.data.data.length}`,
    );

    return response.data.data;
  }

  /**
   * İdeaSoft'ta ürün stok miktarını günceller.
   * productId: İdeaSoft iç ürün ID'si.
   */
  async updateStock(
    creds: IdeaSoftCredentials,
    productId: number,
    stock: number,
  ): Promise<void> {
    if (this.stubMode) {
      this.logger.debug(`İdeaSoft stub mod: updateStock id=${productId}, stok=${stock}`);
      return;
    }

    const client = this.buildClient(creds);

    await client.patch(`/products/${productId}`, { quantity: stock });

    this.logger.debug(`İdeaSoft stok güncelleme: id=${productId}, stok=${stock}`);
  }

  /**
   * Belirli tarihten itibaren İdeaSoft siparişlerini çeker.
   * after: ISO 8601 formatında tarih filtresi.
   */
  async getOrders(
    creds: IdeaSoftCredentials,
    after: Date,
  ): Promise<IdeaSoftOrder[]> {
    if (this.stubMode) {
      this.logger.debug(`İdeaSoft stub mod: getOrders sonra=${after.toISOString()}`);
      return [];
    }

    const client = this.buildClient(creds);

    const response = await client.get<{ data: IdeaSoftOrder[] }>('/orders', {
      params: {
        created_at_start: after.toISOString(),
        per_page:         200,
      },
    });

    this.logger.debug(
      `İdeaSoft siparişler: ${response.data.data.length} adet`,
    );

    return response.data.data;
  }
}
