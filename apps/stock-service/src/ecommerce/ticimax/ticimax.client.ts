import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export interface TicimaxCredentials {
  api_key: string;
  site_id: string;
}

/** Ticimax ürün modeli */
export interface TicimaxProduct {
  ProductId:   number;
  ProductCode: string;
  ProductName: string;
  Stock:       number;
  SalePrice:   number;
}

/** Ticimax sipariş kalemi */
export interface TicimaxOrderLine {
  ProductCode: string;
  ProductName: string;
  Quantity:    number;
  Price:       number;
}

/** Ticimax sipariş modeli */
export interface TicimaxOrder {
  OrderId:      number;
  OrderNo:      string;
  OrderDate:    string;
  TotalPrice:   number;
  OrderDetails: TicimaxOrderLine[];
}

/**
 * Ticimax E-ticaret API İstemcisi.
 *
 * Türkiye merkezli e-ticaret altyapısı sağlayıcısı.
 * Kimlik doğrulama: X-TicimaxApiKey + X-SiteId header
 * Base URL: TICIMAX_API_URL env değişkeninden alınır.
 *
 * Stub mod: TICIMAX_API_URL env tanımlı değilse gerçek istek yapılmaz,
 * mock veri döndürülür (geliştirme / CI ortamı için).
 */
@Injectable()
export class TicimaxClient {
  private readonly logger = new Logger(TicimaxClient.name);
  private readonly baseUrl: string;
  private readonly stubMode: boolean;

  constructor() {
    const apiUrl = process.env['TICIMAX_API_URL'];

    if (!apiUrl) {
      this.logger.warn(
        'TICIMAX_API_URL tanımlanmamış — stub mod aktif (gerçek API çağrısı yapılmayacak)',
      );
      this.baseUrl  = 'https://api.ticimax.com/v1'; // varsayılan — stub modda kullanılmaz
      this.stubMode = true;
    } else {
      this.baseUrl  = apiUrl;
      this.stubMode = false;
    }
  }

  private buildClient(creds: TicimaxCredentials): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-TicimaxApiKey': creds.api_key,
        'X-SiteId':        creds.site_id,
        'Content-Type':    'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * Ticimax ürün listesini çeker.
   * Sayfalama: page parametresi 1'den başlar.
   */
  async getProducts(
    creds: TicimaxCredentials,
    page: number,
  ): Promise<TicimaxProduct[]> {
    if (this.stubMode) {
      this.logger.debug(`Ticimax stub mod: getProducts sayfa=${page}`);
      return [];
    }

    const client = this.buildClient(creds);

    const response = await client.get<{ Products: TicimaxProduct[]; TotalCount: number }>(
      '/products',
      { params: { Page: page, PageSize: 100 } },
    );

    this.logger.debug(
      `Ticimax ürünler: sayfa=${page}, adet=${response.data.Products.length}`,
    );

    return response.data.Products;
  }

  /**
   * Ticimax'ta ürün stok miktarını günceller.
   * productCode: Ticimax ürün kodu (ERP SKU ile eşleştirilir).
   */
  async updateStock(
    creds: TicimaxCredentials,
    productCode: string,
    stock: number,
  ): Promise<void> {
    if (this.stubMode) {
      this.logger.debug(`Ticimax stub mod: updateStock code=${productCode}, stok=${stock}`);
      return;
    }

    const client = this.buildClient(creds);

    await client.put('/products/stock', {
      ProductCode: productCode,
      Stock:       stock,
    });

    this.logger.debug(`Ticimax stok güncelleme: code=${productCode}, stok=${stock}`);
  }

  /**
   * Belirli tarihten itibaren Ticimax siparişlerini çeker.
   * startDate: YYYY-MM-DD formatında tarih filtresi.
   */
  async getOrders(
    creds: TicimaxCredentials,
    startDate: Date,
  ): Promise<TicimaxOrder[]> {
    if (this.stubMode) {
      this.logger.debug(`Ticimax stub mod: getOrders başlangıç=${startDate.toISOString()}`);
      return [];
    }

    const client = this.buildClient(creds);

    // Ticimax tarih formatı: YYYY-MM-DD
    const dateStr = startDate.toISOString().split('T')[0];

    const response = await client.get<{ Orders: TicimaxOrder[] }>('/orders', {
      params: { StartDate: dateStr, PageSize: 200 },
    });

    this.logger.debug(
      `Ticimax siparişler: ${response.data.Orders.length} adet`,
    );

    return response.data.Orders;
  }
}
