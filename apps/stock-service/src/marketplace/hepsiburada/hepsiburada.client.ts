import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export interface HepsiburadaCredentials {
  username: string;   // Merchant kullanıcı adı
  password: string;   // Merchant şifresi
  merchantId: string;
}

export interface HepsiburadaOrderLine {
  lineItemId: string;
  merchantSku: string;
  productName: string;
  quantity: number;
  unitPrice: number;   // TL (ondalık)
  commissionRate: number;
}

export interface HepsiburadaOrder {
  orderId: string;
  orderNumber: string;
  status: string;          // 'WaitingForPicking' | 'Picking' | 'Shipped' | 'Delivered' | 'Cancelled'
  invoiceRecipientTitle: string;
  cargoTrackingNumber: string | null;
  totalPrice: number;      // TL (ondalık)
  orderDate: string;       // ISO 8601
  lineItems: HepsiburadaOrderLine[];
}

export interface HepsiburadaInventoryUpdate {
  hbSku: string;            // Hepsiburada SKU
  merchantSku: string;
  availableStock: number;
}

/**
 * Hepsiburada Marketplace API istemcisi.
 *
 * Kimlik doğrulama: Basic Auth (username:password)
 * Base URL: https://mpop-sit.hepsiburada.com (test) | https://mpop.hepsiburada.com (prod)
 *
 * Not: Hepsiburada webhook desteği sınırlı — polling tercih edilir.
 */
@Injectable()
export class HepsiburadaClient {
  private readonly logger = new Logger(HepsiburadaClient.name);

  private readonly baseUrl = process.env.HEPSIBURADA_BASE_URL
    ?? 'https://mpop.hepsiburada.com';

  buildClient(credentials: HepsiburadaCredentials): AxiosInstance {
    const token = Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64');

    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * Belirtilen durumdaki siparişleri çeker.
   * Hepsiburada offset bazlı sayfalama kullanır.
   */
  async getOrders(
    credentials: HepsiburadaCredentials,
    status: string,
    updatedAtFrom: Date,
  ): Promise<HepsiburadaOrder[]> {
    const client = this.buildClient(credentials);
    const orders: HepsiburadaOrder[] = [];

    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await client.get<{
        data: { orderList: HepsiburadaOrder[]; totalCount: number };
      }>('/api/orders', {
        params: {
          status,
          updatedAtDateStart: updatedAtFrom.toISOString(),
          offset,
          limit,
        },
      });

      const list = response.data?.data?.orderList ?? [];
      const totalCount = response.data?.data?.totalCount ?? 0;

      orders.push(...list);

      this.logger.debug(
        `Hepsiburada sayfa offset=${offset}: ${list.length} sipariş / toplam ${totalCount}`,
      );

      if (orders.length >= totalCount || list.length < limit) break;
      offset += limit;
    }

    return orders;
  }

  /**
   * Stok miktarlarını günceller.
   * POST /api/listings/merchantid/{merchantId}/inventory-uploads
   */
  async updateInventory(
    credentials: HepsiburadaCredentials,
    updates: HepsiburadaInventoryUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const client = this.buildClient(credentials);

    // Hepsiburada toplu yükleme — 100 kayıt limit
    const chunks = chunkArray(updates, 100);

    for (const chunk of chunks) {
      await client.post(
        `/api/listings/merchantid/${credentials.merchantId}/inventory-uploads`,
        {
          items: chunk.map((u) => ({
            hbSku: u.hbSku,
            merchantSku: u.merchantSku,
            availableStock: u.availableStock,
          })),
        },
      );

      this.logger.debug(`Hepsiburada envanter güncelleme: ${chunk.length} ürün`);
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
