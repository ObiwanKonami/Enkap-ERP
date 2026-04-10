'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Store, ArrowLeft, RefreshCw, Power, AlertCircle,
  Link2, Package, ShoppingBag, Clock, CheckCircle2,
  Loader2, ExternalLink,
} from 'lucide-react';
import {
  ecommerceApi,
  PLATFORM_LABELS,
  PLATFORM_DESC,
  PLATFORM_COLORS,
  type PlatformType,
} from '@/services/ecommerce';
import { useI18n } from '@/hooks/use-i18n';

/* ─── Yardımcılar ─────────────────────────────────────────────── */

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/* ─── Platform Rozeti ─────────────────────────────────────────── */

function PlatformBadge({ platform, size = 48 }: { platform: PlatformType; size?: number }) {
  const color = PLATFORM_COLORS[platform];
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      background: `${color}22`, border: `1px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color,
    }}>
      {PLATFORM_LABELS[platform][0]}
    </div>
  );
}

/* ─── Bilgi Satırı ────────────────────────────────────────────── */

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span className={mono ? 'num' : ''} style={{ fontSize: 13, color: 'var(--text-1)' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

/* ─── KPI Kartı ───────────────────────────────────────────────── */

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 18, fontWeight: 700, color }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Ana Sayfa ───────────────────────────────────────────────── */

export default function ETicaretDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const { t }   = useI18n();

  const { data: integration, isLoading, isError } = useQuery({
    queryKey: ['ecommerce-integration', id],
    queryFn:  () => ecommerceApi.get(id).then(r => r.data),
    enabled:  !!id,
  });

  const toggleMut = useMutation({
    mutationFn: () => ecommerceApi.toggle(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ecommerce-integration', id] }),
  });

  const syncMut = useMutation({
    mutationFn: () => ecommerceApi.sync(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ecommerce-integration', id] }),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', gap: 8 }}>
        <Loader2 size={18} className="animate-spin"/>
        <span>{t('ecommerce.loading')}</span>
      </div>
    );
  }

  if (isError || !integration) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
        <AlertCircle size={28} style={{ color: '#F87171' }}/>
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('ecommerce.integrationNotFound')}</p>
        <Link href="/e-ticaret" className="btn-ghost h-8 px-4 text-sm">← {t('ecommerce.goBack')}</Link>
      </div>
    );
  }

  const color = PLATFORM_COLORS[integration.platform];

  return (
    <div className="space-y-5">

      {/* ── Başlık ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(30,58,95,0.5)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <ArrowLeft size={13}/> {t('ecommerce.goBack')}
          </button>
          <PlatformBadge platform={integration.platform}/>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'Syne', sans-serif" }}>
                {integration.storeName}
              </h1>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                background: integration.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                color: integration.isActive ? '#34D399' : 'var(--text-3)',
                border: `1px solid ${integration.isActive ? 'rgba(16,185,129,0.25)' : 'var(--border)'}`,
              }}>
                {integration.isActive ? t('ecommerce.active') : t('ecommerce.inactive')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color }}>{PLATFORM_LABELS[integration.platform]}</span>
              <span>·</span>
              <Link2 size={10}/>
              <a
                href={integration.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="num"
                style={{ color: 'var(--text-3)', textDecoration: 'none' }}
              >
                {integration.storeUrl}
              </a>
              <ExternalLink size={10}/>
            </div>
          </div>
        </div>

        {/* Eylemler */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !integration.isActive}
            className="btn-ghost h-9 px-4 text-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {syncMut.isPending
              ? <><Loader2 size={13} className="animate-spin"/> {t('ecommerce.syncing')}</>
              : <><RefreshCw size={13}/> {t('ecommerce.syncNow')}</>
            }
          </button>
          <button
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            style={{
              height: 36, padding: '0 16px', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
              background: integration.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${integration.isActive ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
              color: integration.isActive ? '#F87171' : '#34D399',
            }}
          >
            <Power size={13}/>{integration.isActive ? t('ecommerce.disable') : t('ecommerce.enable')}
          </button>
        </div>
      </div>

      {/* ── Hata Mesajı ── */}
      {integration.errorMessage && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#F87171', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }}/>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('ecommerce.lastSyncError')}</div>
            {integration.errorMessage}
          </div>
        </div>
      )}

      {/* ── Son Sync Başarı Bildirimi ── */}
      {syncMut.isSuccess && (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#34D399', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={14}/>
          {t('ecommerce.syncComplete').replace('{count}', String((syncMut.data?.data as { synced: number })?.synced ?? 0))}
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <KpiCard label={t('ecommerce.syncProducts')}    value={integration.syncedProducts.toLocaleString('tr-TR')} color="#0EA5E9"/>
        <KpiCard label={t('ecommerce.syncOrders')} value={integration.syncedOrders.toLocaleString('tr-TR')}   color="#8B5CF6"/>
        <KpiCard label={t('ecommerce.lastSync')} value={fmtDateTime(integration.lastSyncedAt)}               color="#FBBF24"/>
        <KpiCard label={t('ecommerce.status')}              value={integration.isActive ? t('ecommerce.active') : t('ecommerce.inactive')}           color={integration.isActive ? '#34D399' : 'var(--text-3)'}/>
      </div>

      {/* ── Platform Bilgileri ── */}
      <div className="card p-5">
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Store size={13} style={{ color }}/> {t('ecommerce.platformInfo')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <InfoRow label={t('ecommerce.platform')}    value={PLATFORM_LABELS[integration.platform]}/>
          <InfoRow label={t('ecommerce.description')}    value={PLATFORM_DESC[integration.platform]}/>
          <InfoRow label={t('ecommerce.storeUrl')}  value={
            <a
              href={integration.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="num"
              style={{ color: '#38BDF8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {integration.storeUrl} <ExternalLink size={10}/>
            </a>
          }/>
          <InfoRow label={t('ecommerce.integrationId')} value={integration.id} mono/>
        </div>
      </div>

      {/* ── Sistem Bilgileri ── */}
      <div className="card p-5">
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} style={{ color: '#A78BFA' }}/> {t('ecommerce.systemInfo')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <InfoRow label={t('ecommerce.createdAt')} value={fmtDateTime(integration.createdAt)} mono/>
          <InfoRow label={t('ecommerce.updatedAt')}     value={fmtDateTime(integration.updatedAt)} mono/>
          <InfoRow label={t('ecommerce.lastSync')} value={fmtDateTime(integration.lastSyncedAt)} mono/>
        </div>
      </div>

      {/* ── İstatistikler ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card p-5">
          <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={13} style={{ color: '#0EA5E9' }}/> {t('ecommerce.productSync')}
          </h2>
          <div className="num" style={{ fontSize: 36, fontWeight: 700, color: '#38BDF8' }}>
            {integration.syncedProducts.toLocaleString('tr-TR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {t('ecommerce.stockExported')}
          </div>
        </div>
        <div className="card p-5">
          <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShoppingBag size={13} style={{ color: '#8B5CF6' }}/> {t('ecommerce.orderSync')}
          </h2>
          <div className="num" style={{ fontSize: 36, fontWeight: 700, color: '#A78BFA' }}>
            {integration.syncedOrders.toLocaleString('tr-TR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {t('ecommerce.orderImported')}
          </div>
        </div>
      </div>

    </div>
  );
}
