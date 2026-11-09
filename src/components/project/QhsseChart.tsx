"use client";
/**
 * QhsseTrendChart — grafik garis tren bulanan (naik/turun) untuk satu dimensi QHSSE.
 * SVG manual (bukan recharts) agar konsisten gaya dengan chart lain di halaman
 * proyek (lihat PanelCharts.tsx: SCurveChart/CashflowChart).
 */
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { periodeShort, type QhsseSeries } from '@/lib/qhsse';

type Pt = [number, number];

function smoothSegment(points: Pt[]): string {
    if (points.length < 2) return points.length === 1 ? `M ${points[0][0]} ${points[0][1]}` : '';
    const f = (n: number) => n.toFixed(1);
    let d = `M ${f(points[0][0])} ${f(points[0][1])}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
}

export function QhsseTrendChart({ label, series, fmt }: {
    label: string; series: QhsseSeries[]; fmt: (v: number) => string;
}) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const periods = [...new Set(series.flatMap(s => s.points.map(p => p.periode)))].sort();
    const [hover, setHover] = useState<number | null>(null);

    const W = 520, H = 180, L = 36, R = 12, T = 14, B = 26;
    const vals = series.flatMap(s => s.points.map(p => p.v));
    const vMax = vals.length ? Math.max(...vals) : 1;
    const vMin = Math.min(0, vals.length ? Math.min(...vals) : 0);
    const span = vMax - vMin || 1;
    const x = (i: number) => (periods.length <= 1 ? L : L + ((W - L - R) * i) / (periods.length - 1));
    const y = (v: number) => T + (H - T - B) * (1 - (v - vMin) / span);

    const idx = hover ?? periods.length - 1;
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
    const txt = isDark ? '#94a3b8' : '#475569';
    const ticks = Array.from({ length: 4 }, (_, i) => vMin + (span / 3) * i);

    const onMove = (e: PointerEvent<SVGRectElement>) => {
        if (periods.length < 2) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        setHover(Math.max(0, Math.min(periods.length - 1, Math.round(((px - L) / (W - L - R)) * (periods.length - 1)))));
    };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!periods.length) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const step = e.key === 'ArrowRight' ? 1 : -1;
            setHover(Math.max(0, Math.min(periods.length - 1, idx + step)));
        } else if (e.key === 'Escape') setHover(null);
    };

    if (periods.length === 0) {
        return (
            <div className="flex items-center justify-center h-40 text-xs text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-xl">
                Belum ada data bulanan.
            </div>
        );
    }

    const readout = series.map(s => `${s.name} ${periodeShort(periods[idx])}: ${fmt(s.points.find(p => p.periode === periods[idx])?.v ?? NaN)}`).join(' · ');

    return (
        <div
            className="relative outline-none"
            tabIndex={0}
            role="img"
            aria-label={`Grafik tren ${label}. ${readout}`}
            onKeyDown={onKey}
        >
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[240px] select-none">
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={grid} strokeWidth={1} />
                        <text x={L - 6} y={y(t)} fontSize={9} fill={txt} textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
                    </g>
                ))}
                {periods.map((p, i) => (i === 0 || i === periods.length - 1 || i === idx) && (
                    <text key={p} x={x(i)} y={H - 6} fontSize={9} fill={txt} textAnchor="middle">{periodeShort(p)}</text>
                ))}
                {series.map((s, si) => {
                    const pts: Pt[] = periods.flatMap((p, i) => {
                        const v = s.points.find(pp => pp.periode === p)?.v;
                        return typeof v === 'number' ? [[x(i), y(v)] as Pt] : [];
                    });
                    return (
                        <g key={s.name}>
                            <path
                                d={smoothSegment(pts)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={si === 0 ? 2.25 : 1.5}
                                strokeOpacity={si === 0 ? 1 : 0.7}
                                strokeLinecap="round"
                            />
                            {pts.map((pt, i) => (
                                <circle key={i} cx={pt[0]} cy={pt[1]} r={i === idx ? 3.5 : 2} fill={s.color} opacity={i === idx ? 1 : 0.8} />
                            ))}
                        </g>
                    );
                })}
                <rect x={L} y={0} width={Math.max(0, W - L - R)} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="cursor-crosshair" />
            </svg>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="font-bold text-slate-700 dark:text-slate-300">{periodeShort(periods[idx])}</span>
                {series.map(s => {
                    const v = s.points.find(p => p.periode === periods[idx])?.v;
                    return (
                        <span key={s.name} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                            {s.name}: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{v == null ? '-' : fmt(v)}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

/** Grafik mini (sparkline) seri utama; mengisi lebar & tinggi kotak induknya. */
export function QhsseSparkline({ points, color, fmt }: {
    points: { periode: string; v: number }[]; color: string; fmt: (v: number) => string;
}) {
    const { theme } = useTheme();
    const txt = theme === 'dark' ? '#94a3b8' : '#475569';
    if (points.length === 0) {
        return <div className="h-full min-h-10 flex items-center text-[11px] text-slate-500 dark:text-slate-400">Belum ada data</div>;
    }
    const vals = points.map(p => p.v);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    // Koordinat dalam persen supaya titik akhir bisa berupa elemen HTML bulat (tidak terdistorsi).
    const px = (i: number) => (points.length === 1 ? 50 : 4 + (92 * i) / (points.length - 1));
    const py = (v: number) => 12 + 76 * (1 - (v - lo) / span);
    const xy: Pt[] = points.map((p, i) => [px(i), py(p.v)]);
    const line = smoothSegment(xy);
    const area = xy.length > 1 ? `${line} L ${xy[xy.length - 1][0]} 100 L ${xy[0][0]} 100 Z` : '';
    const last = xy[xy.length - 1];
    return (
        <div className="h-full min-h-10 flex flex-col">
            <div className="relative flex-1 min-h-8">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
                    {area && <path d={area} fill={color} opacity={0.12} />}
                    <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span
                    className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ring-2 ring-white dark:ring-slate-900"
                    style={{ left: `${last[0]}%`, top: `${last[1]}%`, background: color }}
                    aria-hidden="true"
                />
            </div>
            <div className="flex justify-between text-[10px] font-mono mt-1" style={{ color: txt }}>
                <span>{periodeShort(points[0].periode)}</span>
                {points.length > 1 && <span>{periodeShort(points[points.length - 1].periode)}</span>}
            </div>
            <span className="sr-only">{points.map(p => `${periodeShort(p.periode)}: ${fmt(p.v)}`).join(', ')}</span>
        </div>
    );
}
