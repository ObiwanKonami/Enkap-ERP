/**
 * Stok Maliyet Hesaplama Motoru
 *
 * Desteklenen yöntemler:
 *  - FIFO (İlk Giren İlk Çıkar): Her çıkış en eski parti maliyetinden yapılır.
 *  - AVG  (Hareketli Ağırlıklı Ortalama): Ortalama birim maliyet sürekli güncellenir.
 *
 * Türkiye'de VUK (Vergi Usul Kanunu) madde 274 her iki yönteme izin verir.
 * E-defter uyumluluğu için seçilen yöntem ürün bazında sabittir.
 *
 * Tüm tutarlar kuruş cinsinden tam sayı olarak tutulur (float hatası önlenir).
 * Örnek: 12,50 TL → 1250 kuruş.
 */

/** Bir stok partisi (FIFO için): tarih ve birim maliyet */
export interface CostLayer {
  receivedAt: Date;
  quantity: number;      // adet (tam sayı veya kesirli bırakılabilir)
  unitCostKurus: number; // kuruş cinsinden (tam sayı)
}

export interface FifoConsumeResult {
  /** Tüketilen toplam maliyet (kuruş) */
  totalCostKurus: number;
  /** Tüketimden sonra kalan katmanlar */
  remainingLayers: CostLayer[];
  /** Kalan stok adedi */
  remainingQuantity: number;
}

export interface AvgCostState {
  totalQuantity: number;
  totalValueKurus: number; // totalQuantity × avgUnitCostKurus
  avgUnitCostKurus: number;
}

/**
 * FIFO maliyet motoru.
 *
 * Kullanım:
 *  1. Giriş hareketinde `addLayer()` ile yeni katman ekle.
 *  2. Çıkış hareketinde `consume()` ile miktar tüket.
 *  3. Kalan katmanları veritabanına yaz (bir sonraki harekete hazır).
 */
export class FifoCostEngine {
  /**
   * Yeni giriş katmanını mevcut listenin sonuna ekler.
   * FIFO'da en eski katman başta durur.
   */
  static addLayer(layers: CostLayer[], newLayer: CostLayer): CostLayer[] {
    return [...layers, newLayer];
  }

  /**
   * `quantity` adet tüketir; maliyet FIFO sırasına göre hesaplanır.
   * Yeterli stok yoksa hata fırlatır.
   */
  static consume(layers: CostLayer[], quantity: number): FifoConsumeResult {
    const totalAvailable = layers.reduce((sum, l) => sum + l.quantity, 0);
    if (quantity > totalAvailable) {
      throw new Error(
        `FIFO: Yetersiz stok — talep=${quantity}, mevcut=${totalAvailable}`,
      );
    }

    const remainingLayers: CostLayer[] = [];
    let remaining = quantity;
    let totalCostKurus = 0;

    for (const layer of layers) {
      if (remaining <= 0) {
        remainingLayers.push(layer);
        continue;
      }

      if (layer.quantity <= remaining) {
        // Katmanı tamamen tüket
        totalCostKurus += layer.quantity * layer.unitCostKurus;
        remaining -= layer.quantity;
      } else {
        // Katmanı kısmen tüket
        totalCostKurus += remaining * layer.unitCostKurus;
        remainingLayers.push({
          ...layer,
          quantity: layer.quantity - remaining,
        });
        remaining = 0;
      }
    }

    return {
      totalCostKurus,
      remainingLayers,
      remainingQuantity: totalAvailable - quantity,
    };
  }

  /**
   * Katmanların toplam değerini (kuruş) döner.
   */
  static totalValue(layers: CostLayer[]): number {
    return layers.reduce((sum, l) => sum + l.quantity * l.unitCostKurus, 0);
  }
}

/**
 * Hareketli Ağırlıklı Ortalama (AVG) maliyet motoru.
 *
 * Formül — yeni giriş sonrası:
 *   avgUnitCost = (mevcutToplam + yeniMiktar × yeniMaliyet) / (mevcutMiktar + yeniMiktar)
 */
export class AvgCostEngine {
  /**
   * Giriş hareketi sonrası AVG durumunu günceller.
   */
  static onReceipt(
    state: AvgCostState,
    incomingQuantity: number,
    incomingUnitCostKurus: number,
  ): AvgCostState {
    const newTotalQuantity = state.totalQuantity + incomingQuantity;
    const newTotalValue = state.totalValueKurus + incomingQuantity * incomingUnitCostKurus;

    return {
      totalQuantity: newTotalQuantity,
      totalValueKurus: newTotalValue,
      avgUnitCostKurus: newTotalQuantity > 0
        ? Math.round(newTotalValue / newTotalQuantity)
        : 0,
    };
  }

  /**
   * Çıkış hareketi sonrası AVG durumunu günceller.
   * Ortalama birim maliyet değişmez; sadece miktar ve toplam değer azalır.
   */
  static onIssue(state: AvgCostState, outgoingQuantity: number): {
    updatedState: AvgCostState;
    issuedCostKurus: number;
  } {
    if (outgoingQuantity > state.totalQuantity) {
      throw new Error(
        `AVG: Yetersiz stok — talep=${outgoingQuantity}, mevcut=${state.totalQuantity}`,
      );
    }

    const issuedCostKurus = outgoingQuantity * state.avgUnitCostKurus;
    const newTotalQuantity = state.totalQuantity - outgoingQuantity;

    return {
      updatedState: {
        totalQuantity: newTotalQuantity,
        totalValueKurus: state.totalValueKurus - issuedCostKurus,
        avgUnitCostKurus: state.avgUnitCostKurus, // ortalama değişmez
      },
      issuedCostKurus,
    };
  }

  /** Boş başlangıç durumu */
  static empty(): AvgCostState {
    return { totalQuantity: 0, totalValueKurus: 0, avgUnitCostKurus: 0 };
  }
}
