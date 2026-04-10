import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export interface TrendyolCredentials {
  apiKey: string;
  apiSecret: string;
  supplierId: string;
}

export interface TrendyolOrderLine {
  orderLineId: number;
  barcode: string;
  merchantSku: string;
  productName: string;
  quantity: number;
  amount: number;          // TL (ondalık)
  commission: number;      // TL (ondalık)
}

export interface TrendyolOrder {
  orderId: number;
  orderNumber: string;
  status: string;          // 'Created' | 'Picking' | 'Invoiced' | 'Shipped' | 'Delivered' | 'Cancelled'
  customerFirstName: string;
  customerLastName: string;
  cargoTrackingNumber: string | null;
  grossAmount: number;     // TL (ondalık)
  orderDate: number;       // Unix timestamp (ms)
  lines: TrendyolOrderLine[];
}

export interface TrendyolStockUpdate {
  barcode: string;
  quantity: number;
}

/**
 * Trendyol Marketplace API istemcisi.
 *
 * Kimlik doğrulama: Basic Auth (API Key : API Secret — Base64)
 * Base URL: https://api.trendyol.com/sapigw/suppliers/{supplierId}
 *
 * Belge: https://developers.trendyol.com
 */
@Injectable()
export class TrendyolClient {
  private readonly logger = new Logger(TrendyolClient.name);

  /** Her tenant için ayrı axios örneği (farklı supplierId/credentials) */
  buildClient(credentials: TrendyolCredentials): AxiosInstance {
    const token = Buffer.from(
      `${credentials.apiKey}:${credentials.apiSecret}`,
    ).toString('base64');

    return axios.create({
      baseURL: `https://api.trendyol.com/sapigw/suppliers/${credentials.supplierId}`,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'enkap-erp/1.0',
      },
      timeout: 30_000,
    });
  }

  /**
   * 'Created' durumundaki siparişleri çeker.
   * Sayfalama: page=0, size=50 (Trendyol limit: 200)
   */
  async getNewOrders(
    credentials: TrendyolCredentials,
    startDate: Date,
  ): Promise<TrendyolOrder[]> {
    const client = this.buildClient(credentials);

    const orders: TrendyolOrder[] = [];
    let page = 0;
    const size = 50;

    while (true) {
      const response = await client.get<{
        content: TrendyolOrder[];
        totalPages: number;
        totalElements: number;
      }>('/orders', {
        params: {
          status: 'Created',
          startDate: startDate.getTime(),
          endDate: Date.now(),
          page,
          size,
        },
      });

      const { content, totalPages } = response.data;
      orders.push(...content);

      this.logger.debug(
        `Trendyol sayfa ${page + 1}/${totalPages}: ${content.length} sipariş`,
      );

      if (page + 1 >= totalPages) break;
      page++;
    }

    return orders;
  }

  /**
   * Stok miktarını günceller.
   * Trendyol barkod bazlı güncelleme yapar.
   * Toplu güncelleme: PUT /products/price-and-inventory
   */
  async updateStock(
    credentials: TrendyolCredentials,
    updates: TrendyolStockUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const client = this.buildClient(credentials);

    // Trendyol maksimum 100 ürün/istek kabul eder
    const chunks = chunkArray(updates, 100);

    for (const chunk of chunks) {
      await client.put('/products/price-and-inventory', {
        items: chunk.map((u) => ({
          barcode: u.barcode,
          quantity: u.quantity,
        })),
      });

      this.logger.debug(`Trendyol stok güncelleme: ${chunk.length} ürün`);
    }
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
