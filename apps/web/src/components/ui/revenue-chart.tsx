'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

interface DataPoint {
  ay:    string;
  gelir: number;
  gider: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'rgba(13,20,33,0.95)',
        border: '1px solid rgba(30,58,95,0.8)',
        borderRadius: 6,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ fontSize: 11, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: '#94A3B8', minWidth: 40 }}>{p.name === 'gelir' ? 'Gelir' : 'Gider'}</span>
          <span style={{ fontSize: 13, color: '#E2E8F0', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
            ₺{(p.value / 1000).toFixed(0)}K
          </span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gelirGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="giderGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.4)" vertical={false} />
        <XAxis dataKey="ay" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
          axisLine={false} tickLine={false}
          tickFormatter={(v: number) => v >= 1000000 ? `₺${(v/1000000).toFixed(1)}M` : v >= 1000 ? `₺${(v/1000).toFixed(0)}K` : `₺${v}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="gelir" stroke="#0EA5E9" strokeWidth={2} fill="url(#gelirGrad)" dot={false} />
        <Area type="monotone" dataKey="gider" stroke="#EF4444" strokeWidth={1.5} fill="url(#giderGrad)" dot={false} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
