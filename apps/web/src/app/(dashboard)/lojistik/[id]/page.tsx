'use client';

import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/use-i18n';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck, ArrowLeft, RefreshCw, Download,
  MapPin, Phone, Mail, Package, Clock,
  CheckCircle2, Circle, AlertCircle, RotateCcw, Loader2,
} from 'lucide-react';
import {
  logisticsApi,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_CLS,
  CARRIER_LABELS,
  type ShipmentStatus,
} from '@/services/logistics';

/* ─── Yardımcılar ─────────────────────────────────────────────── */

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/* ─── Durum İlerleme Çubuğu ───────────────────────────────────── */

const STATUS_STEPS: ShipmentStatus[] = [
  'pending', 'created', 'in_transit', 'out_for_delivery', 'delivered',
];

function StatusTimeline({ current }: { current: ShipmentStatus }) {
  const { t } = useI18n();
  const isFailed   = current === 'failed';
  const isReturned = current === 'returned';
  const activeIdx  = STATUS_STEPS.indexOf(current);

  const stepLabels: Record<ShipmentStatus, string> = {
    pending:           t('logistics.pending'),
    created:           t('logistics.created'),
    in_transit:        t('logistics.inTransit'),
    out_for_delivery:  t('logistics.outForDelivery'),
    delivered:         t('logistics.delivered'),
    failed:            t('logistics.failed'),
    returned:          t('logistics.returned'),
  };

  if (isFailed || isReturned) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 0' }}>
        <AlertCircle size={20} style={{ color: isFailed ? '#F87171' : '#FB923C', flexShrink:0 }}/>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color: isFailed ? '#F87171' : '#FB923C' }}>
            {stepLabels[current]}
          </div>
          <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>
            {isFailed ? t('logistics.failedMessage') : t('logistics.returnedMessage')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:0, overflowX:'auto', paddingBottom:4 }}>
      {STATUS_STEPS.map((step, i) => {
        const done    = activeIdx >= i;
        const active  = activeIdx === i;
        const isLast  = i === STATUS_STEPS.length - 1;
        return (
          <div key={step} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', minWidth:80 }}>
            <div style={{ display:'flex', alignItems:'center', width:'100%' }}>
              {/* Bağlantı çizgisi (sol) */}
              {i > 0 && (
                <div style={{
                  flex:1, height:2,
                  background: done ? '#0EA5E9' : 'rgba(30,58,95,0.5)',
                  transition:'background 0.3s',
                }}/>
              )}
              {/* İkon */}
              <div style={{
                width:28, height:28, borderRadius:'50%', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                background: done ? (active ? 'rgba(14,165,233,0.2)' : 'rgba(14,165,233,0.12)') : 'rgba(30,58,95,0.4)',
                border: `2px solid ${done ? '#0EA5E9' : 'rgba(30,58,95,0.6)'}`,
                transition:'all 0.3s',
              }}>
                {done
                  ? <CheckCircle2 size={14} style={{ color:'#38BDF8' }}/>
                  : <Circle       size={14} style={{ color:'rgba(30,58,95,0.6)' }}/>
                }
              </div>
              {/* Bağlantı çizgisi (sağ) */}
              {!isLast && (
                <div style={{
                  flex:1, height:2,
                  background: activeIdx > i ? '#0EA5E9' : 'rgba(30,58,95,0.5)',
                  transition:'background 0.3s',
                }}/>
              )}
            </div>
            {/* Etiket */}
            <div style={{
              fontSize:10, fontWeight: active ? 600 : 400,
              color: active ? '#38BDF8' : done ? '#64748B' : '#334155',
              marginTop:6, textAlign:'center', lineHeight:1.3,
            }}>
              {stepLabels[step]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Bilgi Satırı ────────────────────────────────────────────── */

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {label}
      </span>
      <span className={mono ? 'num' : ''} style={{ fontSize:13, color:'var(--text-1)' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

/* ─── Ana Sayfa ───────────────────────────────────────────────── */

export default function LojistikDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const { data: shipment, isLoading, isError } = useQuery({
    queryKey: ['shipment', id],
    queryFn:  () => logisticsApi.get(id).then(r => r.data),
    enabled:  !!id,
  });

  const trackMut = useMutation({
    mutationFn: () => logisticsApi.track(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['shipment', id] }),
  });

  if (isLoading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:'var(--text-3)', gap:8 }}>
        <Loader2 size={18} className="animate-spin"/>
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (isError || !shipment) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12 }}>
        <AlertCircle size={28} style={{ color:'#F87171' }}/>
        <p style={{ color:'var(--text-3)', fontSize:13 }}>{t('logistics.shipmentNotFound')}</p>
        <Link href="/lojistik" className="btn-ghost h-8 px-4 text-sm">← {t('common.back')}</Link>
      </div>
    );
  }

  const isActive  = !['delivered','failed','returned'].includes(shipment.status);
  const isClosed  = ['delivered','failed','returned'].includes(shipment.status);

  return (
    <div className="space-y-5">

      {/* ── Başlık ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button
            onClick={() => router.back()}
            style={{ background:'rgba(30,58,95,0.3)', border:'1px solid rgba(30,58,95,0.5)', borderRadius:6, padding:'6px 10px', cursor:'pointer', color:'var(--text-2)', display:'flex', alignItems:'center', gap:6, fontSize:12 }}
          >
            <ArrowLeft size={13}/> {t('common.back')}
          </button>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <h1 style={{ fontSize:18, fontWeight:700, color:'var(--text-1)', fontFamily:"'Syne', sans-serif" }}>
                {shipment.orderReference}
              </h1>
              <span className={`border text-xs px-2 py-0.5 rounded-full font-medium ${SHIPMENT_STATUS_CLS[shipment.status]}`}>
                {SHIPMENT_STATUS_LABELS[shipment.status]}
              </span>
            </div>
            <p style={{ fontSize:12, color:'var(--text-3)', marginTop:3 }}>
              {CARRIER_LABELS[shipment.carrier]}
              {shipment.trackingNumber && (
                <span className="num" style={{ marginLeft:8, color:'var(--text-2)' }}>
                  #{shipment.trackingNumber}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Eylemler */}
        <div style={{ display:'flex', gap:8 }}>
          {isActive && (
            <button
              onClick={() => trackMut.mutate()}
              disabled={trackMut.isPending}
              className="btn-primary h-9 px-4 text-sm"
              style={{ display:'flex', alignItems:'center', gap:6 }}
            >
              {trackMut.isPending
                ? <><Loader2 size={13} className="animate-spin"/> {t('logistics.querying')}</>
                : <><RefreshCw size={13}/> {t('logistics.updateStatus')}</>
              }
            </button>
          )}
          {shipment.trackingNumber && (
            <a
              href={logisticsApi.getLabelUrl(shipment.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost h-9 px-4 text-sm"
              style={{ display:'flex', alignItems:'center', gap:6 }}
            >
              <Download size={13}/> {t('logistics.cargoLabel')}
            </a>
          )}
        </div>
      </div>

      {/* ── Durum Zaman Çizelgesi ── */}
      <div className="card p-5">
        <h2 style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:16 }}>
          {t('logistics.deliveryStatus')}
        </h2>
        <StatusTimeline current={shipment.status}/>
        {shipment.statusDescription && (
          <div style={{ marginTop:12, padding:'8px 12px', borderRadius:6, background:'rgba(14,165,233,0.06)', border:'1px solid rgba(14,165,233,0.15)', fontSize:12, color:'var(--text-2)' }}>
            {shipment.statusDescription}
          </div>
        )}
      </div>

      {/* ── KPI Satırı ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12 }}>
        {[
          { label: t('logistics.weight'),          value:`${shipment.weightKg} kg`,                           color:'#38BDF8' },
          { label: t('logistics.desi'),             value: shipment.desi ? `${shipment.desi} desi` : '—',      color:'#38BDF8' },
          { label: t('logistics.paymentType'),       value: shipment.paymentType === 'sender' ? t('logistics.senderPays') : t('logistics.recipientPays'), color:'#A78BFA' },
          { label: t('logistics.estimatedDelivery'), value: fmtDate(shipment.estimatedDeliveryDate),             color: isClosed ? '#64748B' : '#FBBF24' },
          { label: t('logistics.deliveredDate'),    value: fmtDate(shipment.deliveredAt),                       color:'#34D399' },
          { label: t('logistics.lastCheck'),      value: fmtDateTime(shipment.lastCheckedAt),                 color:'#64748B' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>
              {k.label}
            </div>
            <div className="num" style={{ fontSize:15, fontWeight:600, color:k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Gönderici / Alıcı ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

        {/* Gönderici */}
        <div className="card p-5">
          <h2 style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
            <Truck size={13} style={{ color:'#38BDF8' }}/> {t('logistics.sender')}
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <InfoRow label={t('logistics.nameCompany')} value={shipment.senderName}/>
            <InfoRow label={t('logistics.address')}       value={
              <span style={{ display:'flex', alignItems:'flex-start', gap:4 }}>
                <MapPin size={12} style={{ color:'var(--text-3)', marginTop:1, flexShrink:0 }}/>
                <span>{shipment.senderAddress}, {shipment.senderCity}</span>
              </span>
            }/>
            <InfoRow label={t('logistics.phone')} value={
              <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                <Phone size={12} style={{ color:'var(--text-3)' }}/>{shipment.senderPhone}
              </span>
            } mono/>
          </div>
        </div>

        {/* Alıcı */}
        <div className="card p-5">
          <h2 style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
            <Package size={13} style={{ color:'#34D399' }}/> {t('logistics.recipient')}
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <InfoRow label={t('logistics.fullName')} value={shipment.recipientName}/>
            <InfoRow label={t('logistics.address')}    value={
              <span style={{ display:'flex', alignItems:'flex-start', gap:4 }}>
                <MapPin size={12} style={{ color:'var(--text-3)', marginTop:1, flexShrink:0 }}/>
                <span>
                  {shipment.recipientAddress},
                  {shipment.recipientDistrict ? ` ${shipment.recipientDistrict},` : ''}
                  {' '}{shipment.recipientCity}
                </span>
              </span>
            }/>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <InfoRow label={t('logistics.phone')} value={
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <Phone size={12} style={{ color:'var(--text-3)' }}/>{shipment.recipientPhone}
                </span>
              } mono/>
              {shipment.recipientEmail && (
                <InfoRow label={t('logistics.email')} value={
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <Mail size={12} style={{ color:'var(--text-3)' }}/>{shipment.recipientEmail}
                  </span>
                }/>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Kargo Detayları ── */}
      <div className="card p-5">
        <h2 style={{ fontSize:12, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:16, display:'flex', alignItems:'center', gap:6 }}>
          <Clock size={13} style={{ color:'#A78BFA' }}/> {t('logistics.cargoSystemInfo')}
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16 }}>
          <InfoRow label={t('logistics.trackingNumber')}     value={shipment.trackingNumber}          mono/>
          <InfoRow label={t('logistics.cargoSystemId')}    value={shipment.carrierShipmentId}       mono/>
          <InfoRow label={t('logistics.shipmentId')}         value={shipment.id}                      mono/>
          <InfoRow label={t('logistics.createdDate')} value={fmtDateTime(shipment.createdAt)}  mono/>
          <InfoRow label={t('logistics.lastUpdate')}     value={fmtDateTime(shipment.updatedAt)}  mono/>
        </div>
      </div>

    </div>
  );
}
