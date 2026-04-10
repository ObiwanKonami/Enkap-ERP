import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title:    string;
  value:    string;
  change?:  number;     // positive = good, negative = bad
  icon:     React.ReactNode;
  accent?:  'sky' | 'amber' | 'emerald' | 'rose';
  note?:    string;
  loading?: boolean;
}

const ACCENT_STYLES = {
  sky:     { border: 'rgba(14,165,233,0.25)',  glow: 'rgba(14,165,233,0.08)',  icon: 'rgba(14,165,233,0.12)',  iconColor: '#38BDF8'  },
  amber:   { border: 'rgba(245,158,11,0.25)',  glow: 'rgba(245,158,11,0.08)',  icon: 'rgba(245,158,11,0.12)',  iconColor: '#FBBF24'  },
  emerald: { border: 'rgba(16,185,129,0.25)',  glow: 'rgba(16,185,129,0.08)',  icon: 'rgba(16,185,129,0.12)',  iconColor: '#34D399'  },
  rose:    { border: 'rgba(239,68,68,0.25)',   glow: 'rgba(239,68,68,0.08)',   icon: 'rgba(239,68,68,0.12)',   iconColor: '#F87171'  },
} as const;

export function KpiCard({ title, value, change, icon, accent = 'sky', note, loading }: KpiCardProps) {
  const styles = ACCENT_STYLES[accent];

  if (loading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-4 w-24 mb-4 rounded" />
        <div className="skeleton h-8 w-36 mb-2 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    );
  }

  const Trend = change === undefined ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor = change === undefined ? '' : change > 0 ? '#34D399' : change < 0 ? '#F87171' : '#64748B';

  return (
    <div
      className="p-5 rounded-lg transition-all duration-200"
      style={{
        background: 'var(--bg-elevated, #111827)',
        border: `1px solid ${styles.border}`,
        boxShadow: `0 0 20px ${styles.glow}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{title}</span>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: styles.icon, color: styles.iconColor }}
        >
          {icon}
        </div>
      </div>

      {/* Value */}
      <div className="num text-2xl font-semibold text-slate-100 mb-2 leading-none">
        {value}
      </div>

      {/* Trend */}
      <div className="flex items-center gap-2">
        {Trend && change !== undefined && (
          <span className="flex items-center gap-1 text-xs" style={{ color: trendColor }}>
            <Trend size={11} />
            <span className="num">{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>
          </span>
        )}
        {note && <span className="text-xs text-slate-600">{note}</span>}
      </div>
    </div>
  );
}
