'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crmApi } from '@/services/crm';
import type { Activity, ActivityType } from '@/services/crm';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import {
  Plus, X, Save, Loader2, AlertCircle,
  Phone, Mail, Users, CheckSquare,
  CheckCircle2, Activity as ActivityIcon,
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

// ─── Aktivite tipi ────────────────────────────────────────────────────────────

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: 'Arama', EMAIL: 'E-posta', MEETING: 'Toplantı', TASK: 'Görev',
};

const TYPE_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  sky:     { border: 'rgba(14,165,233,0.4)',  bg: 'rgba(14,165,233,0.1)',  text: '#7DD3FC' },
  violet:  { border: 'rgba(139,92,246,0.4)',  bg: 'rgba(139,92,246,0.1)',  text: '#C4B5FD' },
  amber:   { border: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.1)',  text: '#FCD34D' },
  emerald: { border: 'rgba(16,185,129,0.4)',  bg: 'rgba(16,185,129,0.1)',  text: '#6EE7B7' },
};

const TYPE_ICON_CLS: Record<ActivityType, string> = {
  CALL:    'text-sky-400',
  EMAIL:   'text-violet-400',
  MEETING: 'text-amber-400',
  TASK:    'text-emerald-400',
  NOTE:    'text-slate-400',
};

function typeIcon(type: ActivityType) {
  switch (type) {
    case 'CALL':    return <Phone       size={13} />;
    case 'EMAIL':   return <Mail        size={13} />;
    case 'MEETING': return <Users       size={13} />;
    case 'TASK':    return <CheckSquare size={13} />;
    default:        return <CheckSquare size={13} />;
  }
}

// ─── Yeni Aktivite Modalı (müşteri sabit) ─────────────────────────────────────

interface ModalProps {
  contactId:   string;
  contactName: string;
  onClose:     () => void;
  onSaved:     () => void;
}

function NewActivityModal({ contactId, contactName, onClose, onSaved }: ModalProps) {
  const { t } = useI18n();

  const TYPES: { value: ActivityType; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'CALL',    label: t('crm.activityType.CALL'),    icon: <Phone       size={13}/>, color: 'sky'     },
    { value: 'EMAIL',   label: t('crm.activityType.EMAIL'),   icon: <Mail        size={13}/>, color: 'violet'  },
    { value: 'MEETING', label: t('crm.activityType.MEETING'), icon: <Users       size={13}/>, color: 'amber'   },
    { value: 'TASK',    label: t('crm.activityType.TASK'),    icon: <CheckSquare size={13}/>, color: 'emerald' },
  ];

  const [actType,   setActType  ] = useState<ActivityType>('CALL');
  const [subject,   setSubject  ] = useState('');
  const [dueDate,   setDueDate  ] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [notes,     setNotes    ] = useState('');

  const canSave = subject.trim().length >= 3;

  const { mutate, isPending } = useMutation({
    mutationFn: () => crmApi.activities.create({
      type:        actType,
      subject:     subject.trim(),
      contactId,
      contactName,
      dueDate:     new Date(dueDate).toISOString(),
      status:      'PENDING',
      notes:       notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Aktivite oluşturuldu.');
      onSaved();
      onClose();
    },
    onError: () => toast.error('Aktivite oluşturulamadı.'),
  });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 460,
        background: '#0F172A', borderRadius: 10,
        border: '1px solid rgba(30,58,95,0.7)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Başlık */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid rgba(30,58,95,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ActivityIcon size={13} style={{ color: '#0EA5E9' }}/>
            </div>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Yeni Aktivite</span>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', padding: 4 }}>
            <X size={16}/>
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* İlgili Müşteri — sabit, değiştirilemez */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Müşteri / Firma
            </label>
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              border: '1px solid rgba(14,165,233,0.25)', background: 'rgba(14,165,233,0.06)',
              fontSize: 13, color: '#7DD3FC',
            }}>
              {contactName}
            </div>
          </div>

          {/* Aktivite Türü */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 7 }}>
              Tür
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
              {TYPES.map(t => {
                const c = TYPE_STYLE[t.color];
                const sel = actType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setActType(t.value)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '9px 6px', borderRadius: 7,
                      border: `1px solid ${sel ? c.border : 'rgba(30,58,95,0.4)'}`,
                      background: sel ? c.bg : 'transparent',
                      color: sel ? c.text : '#475569',
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontSize: 10, fontWeight: sel ? 600 : 400,
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Konu */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Konu <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              className="input"
              style={{ width: '100%' }}
              placeholder="Örn: Teklif görüşmesi, ödeme hatırlatması…"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              autoFocus
            />
          </div>

          {/* Son Tarih & Saat */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Son Tarih & Saat
            </label>
            <input
              className="input"
              style={{ width: '100%' }}
              type="datetime-local"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          {/* Notlar */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>
              Notlar <span style={{ fontSize: 10, color: '#475569' }}>(isteğe bağlı)</span>
            </label>
            <textarea
              className="input"
              style={{ width: '100%', resize: 'vertical', minHeight: 56, fontSize: 13 }}
              placeholder="Görüşme notları, hatırlatmalar…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px', borderTop: '1px solid rgba(30,58,95,0.5)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, fontSize: 13,
              background: 'transparent', border: '1px solid rgba(30,58,95,0.6)',
              color: '#64748B', cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            className="btn-primary"
            onClick={() => mutate()}
            disabled={isPending || !canSave}
            style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 150 }}
          >
            {isPending
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }}/> Kaydediliyor…</>
              : <><Save size={13}/> Aktivite Oluştur</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Müşteri Aktiviteleri Panel ───────────────────────────────────────────────

export function MusteriAktiviteleri({
  contactId,
  contactName,
}: {
  contactId:   string;
  contactName: string;
}) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contact-activities', contactId],
    queryFn: () =>
      crmApi.activities.list({ contactId, limit: 15 })
        .then(r => {
          const raw = r.data;
          if (Array.isArray(raw)) return raw as Activity[];
          if ('data' in raw && Array.isArray((raw as { data: Activity[] }).data)) {
            return (raw as { data: Activity[] }).data;
          }
          return [] as Activity[];
        }),
    staleTime: 30_000,
  });

  const activities: Activity[] = data ?? [];

  const { mutate: complete } = useMutation({
    mutationFn: (id: string) => crmApi.activities.complete(id),
    onSuccess: () => {
      toast.success('Aktivite tamamlandı.');
      qc.invalidateQueries({ queryKey: ['contact-activities', contactId] });
    },
    onError: () => toast.error('İşlem başarısız.'),
  });

  const onSaved = () => qc.invalidateQueries({ queryKey: ['contact-activities', contactId] });

  return (
    <div className="card p-5">
      {/* Başlık + Yeni butonu */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-1">Aktiviteler</h2>
        <button
          className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={13}/>
          Yeni Aktivite
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-text-3 text-xs py-4">
          <Loader2 size={14} className="animate-spin"/>
          Yükleniyor…
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <ActivityIcon size={24} className="text-text-3 mx-auto opacity-50"/>
          <p className="text-sm text-text-3">Bu müşteriye ait aktivite bulunamadı.</p>
          <button
            className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
            onClick={() => setModalOpen(true)}
          >
            İlk aktiviteyi oluştur →
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] text-text-3 uppercase tracking-wider font-medium pb-2 pr-3 w-24">Tür</th>
                <th className="text-left text-[10px] text-text-3 uppercase tracking-wider font-medium pb-2 pr-3">Konu</th>
                <th className="text-left text-[10px] text-text-3 uppercase tracking-wider font-medium pb-2 pr-3 whitespace-nowrap">Son Tarih</th>
                <th className="text-left text-[10px] text-text-3 uppercase tracking-wider font-medium pb-2 pr-3">Durum</th>
                <th className="pb-2"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activities.map(act => {
                const isOverdue = act.status === 'PENDING' && !!act.dueDate && new Date(act.dueDate) < new Date();
                return (
                  <tr key={act.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center gap-1.5 ${TYPE_ICON_CLS[act.type] ?? 'text-text-3'}`}>
                        {typeIcon(act.type)}
                        <span className="text-text-2 text-[11px]">
                          {ACTIVITY_TYPE_LABELS[act.type] ?? act.type}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-text-1">{act.subject}</td>
                    <td className={`py-2.5 pr-3 num whitespace-nowrap ${isOverdue ? 'text-rose-400 font-semibold' : 'text-text-2'}`}>
                      {act.dueDate ? formatDate(act.dueDate) : '—'}
                      {isOverdue && <span className="ml-1 text-[9px]">⚠</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        act.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' :
                        act.status === 'CANCELLED' ? 'bg-slate-500/15 text-slate-400' :
                        isOverdue ? 'bg-rose-500/15 text-rose-400' :
                        'bg-sky-500/15 text-sky-400'
                      }`}>
                        {act.status === 'COMPLETED' ? 'Tamamlandı' :
                         act.status === 'CANCELLED' ? 'İptal' :
                         isOverdue ? 'Gecikmiş' : 'Bekliyor'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {act.status === 'PENDING' && (
                        <button
                          onClick={() => complete(act.id)}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 size={11}/>
                          Tamamla
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <NewActivityModal
          contactId={contactId}
          contactName={contactName}
          onClose={() => setModalOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
