import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

export interface ShopifyCredentials {
  access_token: string;
  /** Mağaza subdomain — örn. "my-store.myshopify.com" */
  shop_domain: string;
}

/** Shopify ürün varyantı */
export interface ShopifyVariant {
  id: number;
  sku: string;
  inventory_item_id: number;
  inventory_quantity: number;
  price: string;
}

/** Shopify ürün modeli */
export interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyVariant[];
}

/** Shopify sipariş kalemi */
export interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  sku: string;
  title: string;
  quantity: number;
  price: string;
}

/** Shopify müşteri bilgisi */
interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

/** Shopify sipariş modeli */
export interface ShopifyOrder {
  id: number;
  name: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  total_price: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
}

/**
 * Sayfalı ürün/sipariş listesi yanıtı.
 * Shopify cursor-based pagination: Link header'ında rel="next" ile page_info gelir.
 */
export interface ShopifyPagedResult<T> {
  items: T[];
  /** Bir sonraki sayfa için cursor — null ise son sayfa */
  nextPageInfo: string | null;
}

/**
 * Shopify Admin API İstemcisi.
 *
 * API versiyonu: 2024-04 (kararlı, LTS)
 * Kimlik doğrulama: X-Shopify-Access-Token header
 * Fiyatlandırma: REST Admin API — Private App veya Custom App token
 *
 * Cursor-based pagination: Link header'ından rel="next" ile page_info çıkarılır.
 * Belge: https://shopify.dev/docs/api/admin-rest/2024-04
 */
@Injectable()
export class ShopifyClient {
  private readonly logger = new Logger(ShopifyClient.name);
  private readonly API_VERSION = '2024-04';

  private buildClient(creds: ShopifyCredentials): AxiosInstance {
    return axios.create({
      baseURL: `https://${creds.shop_domain}/admin/api/${this.API_VERSION}`,
      headers: {
        'X-Shopify-Access-Token': creds.access_token,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * Link header'ından rel="next" page_info değerini çıkarır.
   * Örnek header: <https://store.myshopify.com/admin/api/2024-04/products.json?page_info=abc>; rel="next"
   */
  private extractNextPageInfo(linkHeader: string | undefined): string | null {
    if (!linkHeader) return null;

    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    return nextMatch?.[1] ?? null;
  }

  /**
   * Shopify ürünlerini cursor-based pagination ile çeker.
   * @param pageInfo önceki sayfadan gelen cursor (ilk sayfa için undefined)
   */
  async getProducts(
    creds: ShopifyCredentials,
    pageInfo?: string,
  ): Promise<ShopifyPagedResult<ShopifyProduct>> {
    const client = this.buildClient(creds);

    const params: Record<string, string | number> = { limit: 250 };
    if (pageInfo) {
      params['page_info'] = pageInfo;
    } else {
      // İlk sayfada fields kısıtlaması ekle (bant genişliği tasarrufu)
      params['fields'] = 'id,title,variants';
    }

    const response = await client.get<{ products: ShopifyProduct[] }>('/products.json', {
      params,
    });

    const nextPageInfo = this.extractNextPageInfo(
      response.headers['link'] as string | undefined,
    );

    this.logger.debug(
      `Shopify ürünler: adet=${response.data.products.length}, nextPage=${nextPageInfo ?? 'yok'}`,
    );

    return { items: response.data.products, nextPageInfo };
  }

  /**
   * Shopify Inventory API ile stok miktarını günceller.
   * Güncelleme için inventory_item_id + location_id gerekir.
   */
  async updateInventory(
    creds: ShopifyCredentials,
    inventoryItemId: number,
    locationId: number,
    available: number,
  ): Promise<void> {
    const client = this.buildClient(creds);

    await client.post('/inventory_levels/set.json', {
      inventory_item_id: inventoryItemId,
      location_id:       locationId,
      available,
    });

    this.logger.debug(
      `Shopify stok güncelleme: inventoryItemId=${inventoryItemId}, adet=${available}`,
    );
  }

  /**
   * Belirli tarihten itibaren Shopify siparişlerini çeker.
   * created_at_min: ISO 8601 formatında tarih filtresi.
   */
  async getOrders(
    creds: ShopifyCredentials,
    createdAtMin: Date,
    pageInfo?: string,
  ): Promise<ShopifyPagedResult<ShopifyOrder>> {
    const client = this.buildClient(creds);

    const params: Record<string, string | number> = {
      limit:  250,
      status: 'any',
    };

    if (pageInfo) {
      params['page_info'] = pageInfo;
    } else {
      params['created_at_min'] = createdAtMin.toISOString();
      params['fields'] = 'id,name,financial_status,fulfillment_status,created_at,total_price,line_items,customer';
    }

    const response = await client.get<{ orders: ShopifyOrder[] }>('/orders.json', {
      params,
    });

    const nextPageInfo = this.extractNextPageInfo(
      response.headers['link'] as string | undefined,
    );

    this.logger.debug(
      `Shopify siparişler: adet=${response.data.orders.length}, nextPage=${nextPageInfo ?? 'yok'}`,
    );

    return { items: response.data.orders, nextPageInfo };
  }

  /**
   * Mağazadaki ilk aktif konumu getirir (stok güncelleme için gerekli).
   * Multi-location kurulumlarında ilk aktif konum kullanılır.
   */
  async getPrimaryLocationId(creds: ShopifyCredentials): Promise<number | null> {
    const client = this.buildClient(creds);

    const response = await client.get<{
      locations: { id: number; active: boolean }[];
    }>('/locations.json');

    const active = response.data.locations.find((l) => l.active);
    return active?.id ?? null;
  }
}
