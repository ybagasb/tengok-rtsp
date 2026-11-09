"use client";
/**
 * Potongan visual kecil QHSSE yang dipakai bersama: chip naik/turun, batang bulanan, ring skor.
 * Warna: hijau = membaik, merah = memburuk (tergantung arah baik tiap dimensi).
 */
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { fmtNum, periodeShort, type QhssePoint } from '@/lib/qhsse';

export type Trend = 'good' | 'bad' | 'flat';

export const TREND = {
    good: { text: 'text-emerald-700 dark:text-emerald-400', chip: 'bg-emerald-500/10 border-emerald-500/30', color: '#34d399', label: 'membaik' },
    bad: { text: 'text-rose-700 dark:text-rose-400', chip: 'bg-rose-500/10 border-rose-500/30', color: '#fb7185', label: 'memburuk' },
    flat: { text: 'text-slate-600 dark:text-slate-400', chip: 'bg-slate-500/10 border-slate-500/20', color: '#94a3b8', label: 'tetap' },
} as const;

export const ACCENT = 'rgb(var(--div-accent-rgb))';

/** Chip selisih vs bulan lalu. `text` = teks selisih yang sudah diformat (tanpa tanda). */
export function DeltaChip({ delta, trend, text }: { delta?: number; trend?: Trend; text: string }) {
    if (delta == null || !trend) return null;
    const t = TREND[trend];
    return (
        <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[11px] font-bold ${t.chip} ${t.text}`} title="Dibanding bulan sebelumnya">
            {delta > 0 ? <ArrowUpRight className="w-3 h-3" aria-hidden="true" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" aria-hidden="true" /> : <Minus className="w-3 h-3" aria-hidden="true" />}
            {delta > 0 ? '+' : ''}{text}
            <span className="sr-only"> {t.label} dibanding bulan lalu</span>
        </span>
    );
}

/** Batang bulanan (maks 6 bulan terakhir); batang terakhir disorot. Cocok untuk hitungan kasus. */
export function MiniBars({ points, color, className = '' }: { points: QhssePoint[]; color: string; className?: string }) {
    const shown = points.slice(-6);
    if (shown.length === 0) return <div className={`text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>Belum ada data</div>;
    const max = Math.max(1, ...shown.map(p => p.v));
    return (
        <div className={`flex items-end gap-1.5 ${className}`} role="img" aria-label={shown.map(p => `${periodeShort(p.periode)}: ${fmtNum(p.v, 0)}`).join(', ')}>
            {shown.map((p, i) => {
                const last = i === shown.length - 1;
                return (
                    <div key={p.periode} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-0.5">
                        <span className={`text-[10px] font-mono leading-none ${last ? 'font-black text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{fmtNum(p.v, 0)}</span>
                        <div className="w-full rounded-t-md min-h-[3px]" style={{ height: `${Math.max(6, (p.v / max) * 100)}%`, background: color, opacity: last ? 1 : 0.4 }} />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none truncate max-w-full">{periodeShort(p.periode).split(' ')[0]}</span>
                    </div>
                );
            })}
        </div>
    );
}

/** Ring skor 0–100 dengan angka di tengah. */
export function ScoreRing({ value, max = 100, size = 64, color = ACCENT, label }: { value?: number; max?: number; size?: number; color?: string; label?: string }) {
    const stroke = 7;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const frac = value == null ? 0 : Math.min(1, Math.max(0, value / max));
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Skor'} ${value == null ? 'belum ada' : fmtNum(value, 1)} dari ${max}`}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-black/10 dark:stroke-white/10" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-black font-mono text-slate-900 dark:text-white">
                {value == null ? '-' : fmtNum(value, 0)}
            </span>
        </div>
    );
}
