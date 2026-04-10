'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierApi, SupplierPurchaseOrder, PoStatus } from '@/services/supplier';

const fmtCurrency = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const STATUS_CONFIG: Record<PoStatus, { label: string; badgeClass: string }> = {
  TASLAK:          { label: 'Taslak',           badgeClass: 'badge-secondary' },
  ONAY_BEKLIYOR:   { label: 'Onay Bekliyor',    badgeClass: 'badge-warning'   },
  ONAYLANDI:       { label: 'Onaylandı',         badgeClass: 'badge-info'      },
  TESLIM_EDILDI:   { label: 'Teslim Edildi',     badgeClass: 'badge-success'   },
  TAMAMLANDI:      { label: 'Tamamlandı',        badgeClass: 'badge-success'   },
  IPTAL:           { label: 'İptal',             badgeClass: 'badge-danger'    },
};

function ConfirmDeliveryModal({ order, onClose }: { order: SupplierPurchaseOrder; onClose: () => void }) {
  const qc = useQueryClient();
  const [deliveredDate, setDeliveredDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const confirm = useMutation({
    mutationFn: () => supplierApi.confirmDelivery(order.id, { deliveredDate, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-orders'] });
      onClose();
    },
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Teslimatı Onayla</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
          {order.poNumber} siparişini teslim ettiğinizi onaylayın.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Teslim Tarihi</label>
            <input type="date" className="input" style={{ width: '100%' }} value={deliveredDate} onChange={e => setDeliveredDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Not (opsiyonel)</label>
            <textarea className="input" style={{ width: '100%', resize: 'none' }} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Teslimat notu..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
          >
            {confirm.isPending ? 'Onaylanıyor...' : 'Teslimatı Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SiparislerPage() {
  const [confirming, setConfirming] = useState<SupplierPurchaseOrder | null>(null);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['supplier-orders'],
    queryFn: () => supplierApi.getPurchaseOrders(),
  });

  const { data: summary } = useQuery({
    queryKey: ['supplier-summary'],
    queryFn: () => supplierApi.getSummary().then(r => r.data),
  });

  const orders: SupplierPurchaseOrder[] = Array.isArray(data)
    ? data
    : (data as { data: SupplierPurchaseOrder[] } | undefined)?.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Satın Alma Siparişleri
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Size iletilen PO siparişlerini görüntüleyin ve teslimatları onaylayın.
        </p>
      </div>

      {/* Özet */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          {[
            { label: 'Açık Sipariş',    value: `${summary.openOrders} adet`,            accent: 'var(--accent)' },
            { label: 'Bekleyen Fatura', value: `${summary.pendingInvoices} adet`,        accent: 'var(--warning)' },
            { label: 'Alacak Toplamı',  value: fmtCurrency(summary.totalReceivable),    accent: 'var(--success)' },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{c.label}</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700, color: c.accent }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sipariş Listesi */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Yükleniyor...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>Siparişler yüklenemedi.</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Henüz sipariş bulunmuyor.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map((order) => {
            const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, badgeClass: '' };
            const isOpen = expanded === order.id;

            return (
              <div key={order.id} className="card" style={{ overflow: 'hidden' }}>
                {/* Başlık satırı */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 0, cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="num" style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 14 }}>
                        {order.poNumber}
                      </span>
                      <span className={`badge ${cfg.badgeClass}`} style={{ fontSize: 11 }}>{cfg.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      Sipariş: {fmtDate(order.orderDate)} · Teslimat: {fmtDate(order.deliveryDate)}
                    </div>
                  </div>
                  <div className="num" style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>
                    {fmtCurrency(order.totalKurus)}
                  </div>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', color: 'var(--text-3)' }}
                  >
                    <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Detay */}
                {isOpen && (
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    {/* Kalemler */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Ürün', 'Miktar', 'Birim Fiyat', 'Toplam'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 0', fontWeight: 600, color: 'var(--text-3)', fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line, i) => (
                          <tr key={i}>
                            <td style={{ padding: '8px 0', color: 'var(--text-1)' }}>{line.productName}</td>
                            <td className="num" style={{ padding: '8px 0', color: 'var(--text-2)' }}>{line.quantity} {line.unit}</td>
                            <td className="num" style={{ padding: '8px 0', color: 'var(--text-2)' }}>{fmtCurrency(line.unitPrice)}</td>
                            <td className="num" style={{ padding: '8px 0', fontWeight: 600, color: 'var(--text-1)' }}>{fmtCurrency(line.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Aksiyonlar */}
                    {order.status === 'ONAYLANDI' && (
                      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setConfirming(order)}
                        >
                          Teslimatı Onayla
                        </button>
                      </div>
                    )}
                    {order.note && (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--text-2)' }}>
                        <strong>Not:</strong> {order.note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirming && <ConfirmDeliveryModal order={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}
