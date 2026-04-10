/**
 * İrsaliye modülüne ait paylaşılan tip tanımları.
 * Backend DTO ve frontend servisleri bu tipleri kullanır.
 */

export type WaybillType = 'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';

export type WaybillStatus =
  | 'TASLAK'
  | 'ONAYLANDI'
  | 'GIB_KUYRUKTA'
  | 'GIB_GONDERILDI'
  | 'GIB_ONAYLANDI'
  | 'GIB_REDDEDILDI'
  | 'IPTAL';

/**
 * İrsaliye satırı oluşturma arayüzü — backend `CreateWaybillLineDto` sınıfı
 * bu interface'i implements eder; frontend `CreateWaybillLineDto` interface'i
 * doğrudan bu tipi kullanır.
 */
export interface ICreateWaybillLineDto {
  productId?:         string;
  productName:        string;
  sku?:               string;
  unitCode:           string;
  quantity:           number;
  warehouseId?:       string;
  targetWarehouseId?: string;
  lotNumber?:         string;
  serialNumber?:      string;
  /** Stok hareketini irsaliye satırına bağlar (traceability) */
  movementId?:        string;
}
