"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { BULAN_SINGKAT, hppPersen, type CashflowPoint, type HasilUsahaPeriode, type KurvaSData } from '@/lib/projectReport';

/**
 * PanelCharts — komponen visual ringan (SVG murni + Tailwind) untuk CameraPanel.
 * Tanpa library eksternal: aman dari render loop & nol tambahan bundle.
 *
 * - ArcGauge : gauge busur 180° (speedometer) dengan jarum + zona warna.
 *              Dipakai untuk CPI/SPI (acuan 1.00) dan CCC (ambang 90 hari).
 * - HBar     : satu baris bar horizontal berlabel + nilai.
 * - HBarGroup: beberapa HBar dengan skala maksimum bersama (perbandingan nilai).
 */

// ── Util format rupiah ringkas (dipakai label bar finansial) ─────────────────
export function fRpShort(v?: number): string {
    if (v == null) return '-';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000_000).toFixed(2)} T`;
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2)} M`;
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)} Jt`;
    return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
}

// Warna hex per tone (SVG tidak bisa pakai class Tailwind untuk stroke/fill).
const TONE_HEX: Record<string, string> = {
    emerald: '#34d399',
    rose: '#fb7185',
    amber: '#fbbf24',
    sky: '#38bdf8',
    violet: '#a78bfa',
    orange: '#fb923c',
    slate: '#94a3b8',
};

// Varian lebih gelap untuk teks di tema terang (kontras AA di latar putih).
const TONE_TEXT_LIGHT: Record<string, string> = {
    emerald: '#047857',
    rose: '#be123c',
    amber: '#b45309',
    sky: '#0369a1',
    violet: '#6d28d9',
    orange: '#c2410c',
    slate: '#475569',
};
// ── Helper: titik pada busur ─────────────────────────────────────────────────
// Busur 180°: sudut 180° (kiri) → 0° (kanan), diukur dari sumbu x, y ke atas.
function polar(cx: number, cy: number, r: number, angleDeg: number) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
    const s = polar(cx, cy, r, startDeg);
    const e = polar(cx, cy, r, endDeg);
    // large-arc=0 karena tiap segmen < 180°, sweep=0 (searah dari 180° ke 0°).
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export interface GaugeZone {
    // Rentang nilai [from, to] dan warna tone-nya.
    from: number;
    to: number;
    tone: keyof typeof TONE_HEX;
}

/**
 * Gauge busur 180° dengan zona warna + jarum menunjuk nilai.
 */
export function ArcGauge({
    value,
    min,
    max,
    zones,
    label,
    sublabel,
    display,
    displayFormat,
    tone = 'emerald',
    size = 150,
}: {
    value?: number;
    min: number;
    max: number;
    zones: GaugeZone[];
    label: string;
    sublabel?: string;
    display: string;      // teks nilai di tengah (mis. "1.02" atau "120 hari")
    // Bila diberikan, angka di tengah ikut naik bersama jarum (animasi masuk).
    displayFormat?: (v: number) => string;
    tone?: keyof typeof TONE_HEX; // warna angka tengah
    size?: number;
}) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Animasi masuk: jarum (dan angka) bergerak dari `min` ke nilai target.
    // Menghormati prefers-reduced-motion: langsung ke nilai akhir.
    const reduce = useReducedMotion();
    const hasValue = value != null && Number.isFinite(value);
    const target = hasValue ? Math.max(min, Math.min(max, value as number)) : min;
    const [anim, setAnim] = useState(min);
    // Tanpa animasi (hemat gerak / tanpa nilai) -> langsung tampilkan target.
    const shown = reduce || !hasValue ? target : anim;
    useEffect(() => {
        if (reduce || !hasValue) return;
        let raf = 0;
        const start = performance.now();
        const DURATION = 1100;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / DURATION);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            setAnim(min + (target - min) * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
            else setAnim(target);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, min, reduce, hasValue]);

    // Warna jarum/hub/track menyesuaikan tema (SVG tak bisa pakai class dark:).
    const needleColor = isDark ? '#ffffff' : '#0f172a';
    const hubCenter = isDark ? '#0f172a' : '#ffffff';
    const trackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';

    const w = size;
    // Tinggi SVG: busur + sedikit ruang bawah untuk hub jarum.
    const h = size * 0.60;
    const cx = w / 2;
    const cy = h - size * 0.06;
    const r = w / 2 - 12;
    const track = 9; // tebal busur

    const clamp = (v: number) => Math.max(min, Math.min(max, v));
    const toAngle = (v: number) => 180 - ((clamp(v) - min) / (max - min)) * 180; // 180°→0°

    const needleAngle = hasValue ? toAngle(shown) : 180;

    // Jarum berbentuk segitiga ramping (pointer): ujung menunjuk nilai,
    // pangkal melebar di dua sisi hub. Dihitung dari sudut jarum ± 90°.
    const tip = polar(cx, cy, r - track / 2 - 1, needleAngle);
    const baseL = polar(cx, cy, 5, needleAngle + 90);
    const baseR = polar(cx, cy, 5, needleAngle - 90);
    const needlePath = `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${baseL.x.toFixed(2)} ${baseL.y.toFixed(2)} L ${baseR.x.toFixed(2)} ${baseR.y.toFixed(2)} Z`;

    const numKey = value == null ? 'slate' : tone;
    const numHex = isDark ? TONE_HEX[numKey] : TONE_TEXT_LIGHT[numKey];

    return (
        <div className="flex flex-col items-center">
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
                {/* Track dasar */}
                <path
                    d={arcPath(cx, cy, r, 180, 0)}
                    fill="none"
                    stroke={trackColor}
                    strokeWidth={track}
                    strokeLinecap="round"
                />
                {/* Zona warna */}
                {zones.map((z, i) => {
                    const a0 = toAngle(z.from);
                    const a1 = toAngle(z.to);
                    const start = Math.max(a0, a1);
                    const end = Math.min(a0, a1);
                    return (
                        <path
                            key={i}
                            d={arcPath(cx, cy, r, start, end)}
                            fill="none"
                            stroke={TONE_HEX[z.tone]}
                            strokeWidth={track}
                            strokeLinecap="butt"
                            opacity={0.9}
                        />
                    );
                })}
                {/* Jarum segitiga ramping + hub (warna ikut tema) */}
                {hasValue && (
                    <>
                        <path d={needlePath} fill={needleColor} />
                        <circle cx={cx} cy={cy} r={5} fill={needleColor} />
                        <circle cx={cx} cy={cy} r={2.5} fill={hubCenter} />
                    </>
                )}
            </svg>
            {/* Label + angka DI BAWAH gauge (keluar dari busur, tak menumpuk jarum). */}
            <div className="text-center -mt-1">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 leading-tight">{label.toUpperCase()}</div>
                <div className="text-2xl font-black leading-none mt-0.5" style={{ color: numHex }}>{hasValue && displayFormat ? displayFormat(shown) : display}</div>
                {sublabel && <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mt-0.5">{sublabel}</div>}
            </div>
        </div>
    );
}

/**
 * Satu baris bar horizontal: label kiri, bar, nilai kanan.
 * `fraction` 0..1 relatif terhadap skala grup.
 */
export function HBar({
    label,
    valueText,
    fraction,
    tone = 'sky',
}: {
    label: string;
    valueText: string;
    fraction: number;
    tone?: keyof typeof TONE_HEX;
}) {
    const pct = Math.max(0, Math.min(100, fraction * 100));
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</span>
                <span className="text-[11px] font-black font-mono text-slate-900 dark:text-white whitespace-nowrap">{valueText}</span>
            </div>
            <div className="h-2.5 rounded-full bg-black/[0.08] dark:bg-white/[0.06] overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: TONE_HEX[tone] }}
                />
            </div>
        </div>
    );
}

export interface BarItem {
    label: string;
    value?: number;
    tone?: keyof typeof TONE_HEX;
    valueText?: string; // override teks (mis. untuk rupiah ringkas)
}

/**
 * Grup bar horizontal dengan skala maksimum bersama (perbandingan nilai).
 */
export function HBarGroup({ items }: { items: BarItem[] }) {
    const maxAbs = Math.max(1, ...items.map(i => Math.abs(i.value ?? 0)));
    return (
        <div className="space-y-2.5">
            {items.map((it, i) => (
                <HBar
                    key={i}
                    label={it.label}
                    valueText={it.valueText ?? fRpShort(it.value)}
                    fraction={Math.abs(it.value ?? 0) / maxAbs}
                    tone={it.tone}
                />
            ))}
        </div>
    );
}

/**
 * Stacked bar horizontal: beberapa komponen dalam satu batang + total.
 */
export function StackedBar({
    segments,
    total,
    totalLabel = 'Total',
}: {
    segments: { label: string; value: number; tone: keyof typeof TONE_HEX }[];
    total?: number;
    totalLabel?: string;
}) {
    const sum = total ?? segments.reduce((a, s) => a + (s.value || 0), 0);
    const safeSum = sum > 0 ? sum : 1;
    return (
        <div className="space-y-2">
            <div className="h-3 rounded-full bg-black/[0.08] dark:bg-white/[0.06] overflow-hidden flex">
                {segments.map((s, i) => (
                    <div
                        key={i}
                        className="h-full transition-all duration-700"
                        style={{ width: `${(Math.max(0, s.value) / safeSum) * 100}%`, backgroundColor: TONE_HEX[s.tone] }}
                        title={`${s.label}: ${fRpShort(s.value)}`}
                    />
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TONE_HEX[s.tone] }} />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</span>
                        <span className="text-[11px] font-black font-mono text-slate-700 dark:text-slate-200">{fRpShort(s.value)}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{totalLabel}</span>
                    <span className="text-[11px] font-black font-mono text-slate-900 dark:text-white">{fRpShort(sum)}</span>
                </div>
            </div>
        </div>
    );
}

// ── Kurva S ──────────────────────────────────────────────────────────────────
// Tiga seri kumulatif Jan–Des (persen terhadap nilai kontrak): RA RKAP, RA
// Eksternal (garis putus), dan RI/realisasi internal (garis tebal, berhenti di
// bulan terakhir yang dilaporkan). Hover/sentuh atau panah kiri/kanan memilih bulan.
const fPct = (v?: number) => (v == null ? '-' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

export function SCurveChart({ data }: { data: KurvaSData }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [hover, setHover] = useState<number | null>(null);

    const lastIdx = (a: (number | undefined)[]) => a.reduce<number>((acc, v, i) => (typeof v === 'number' ? i : acc), -1);
    const defaultIdx = Math.max(lastIdx(data.ri), lastIdx(data.rkap), lastIdx(data.eksternal), 0);
    const idx = hover ?? (lastIdx(data.ri) >= 0 ? lastIdx(data.ri) : defaultIdx);

    const W = 320, H = 170, L = 30, R = 10, T = 10, B = 22;
    const nums = [...data.rkap, ...data.eksternal, ...data.ri].filter((v): v is number => typeof v === 'number');
    const yMax = Math.max(100, Math.ceil(Math.max(...nums) / 10) * 10);
    const x = (i: number) => L + ((W - L - R) * i) / 11;
    const y = (v: number) => T + (H - T - B) * (1 - v / yMax);
    const path = (a: (number | undefined)[]) => {
        let d = '';
        let pen = false;
        a.forEach((v, i) => {
            if (typeof v !== 'number') { pen = false; return; }
            d += `${pen ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
            pen = true;
        });
        return d.trim();
    };

    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
    const txt = isDark ? '#94a3b8' : '#475569';
    const cRkap = isDark ? '#38bdf8' : '#0369a1';
    const cEks = isDark ? '#fb923c' : '#c2410c';
    const cRi = 'rgb(var(--div-accent-rgb))';
    const ticks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);

    const onMove = (e: PointerEvent<SVGRectElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        setHover(Math.max(0, Math.min(11, Math.round(((px - L) / (W - L - R)) * 11))));
    };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const step = e.key === 'ArrowRight' ? 1 : -1;
            setHover(Math.max(0, Math.min(11, idx + step)));
        } else if (e.key === 'Escape') setHover(null);
    };

    const rkap = data.rkap[idx];
    const eks = data.eksternal[idx];
    const ri = data.ri[idx];
    const dev = ri != null && rkap != null ? ri - rkap : undefined;
    const readout = `${BULAN_SINGKAT[idx]} ${data.tahun}: RKAP ${fPct(rkap)}, Eksternal ${fPct(eks)}, Realisasi ${fPct(ri)}`;

    return (
        <div
            role="group"
            tabIndex={0}
            aria-label="Grafik Kurva S. Gunakan panah kiri dan kanan untuk memilih bulan."
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"
        >
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-hidden="true">
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={grid} strokeWidth="1" />
                        <text x={L - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill={txt}>{Math.round(t)}</text>
                    </g>
                ))}
                {BULAN_SINGKAT.map((b, i) => (
                    i % 2 === 0 ? <text key={b} x={x(i)} y={H - 7} textAnchor="middle" fontSize="8" fill={txt}>{b}</text> : null
                ))}
                {/* penanda bulan terpilih */}
                <line x1={x(idx)} x2={x(idx)} y1={T} y2={H - B} stroke={txt} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
                <path d={path(data.rkap)} fill="none" stroke={cRkap} strokeWidth="1.8" strokeDasharray="5 3" strokeLinejoin="round" />
                <path d={path(data.eksternal)} fill="none" stroke={cEks} strokeWidth="1.8" strokeDasharray="2 3" strokeLinejoin="round" />
                <path d={path(data.ri)} fill="none" style={{ stroke: cRi }} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                {data.ri.map((v, i) => (typeof v === 'number' ? <circle key={i} cx={x(i)} cy={y(v)} r={i === idx ? 4 : 2.2} style={{ fill: cRi }} /> : null))}
                {typeof rkap === 'number' && <circle cx={x(idx)} cy={y(rkap)} r="3.2" fill={cRkap} />}
                {typeof eks === 'number' && <circle cx={x(idx)} cy={y(eks)} r="3.2" fill={cEks} />}
                {/* area interaksi */}
                <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }} />
            </svg>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: cRkap }} aria-hidden="true" /> RA RKAP</span>
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-2 border-dotted" style={{ borderColor: cEks }} aria-hidden="true" /> RA Eksternal</span>
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-[3px]" style={{ borderColor: cRi }} aria-hidden="true" /> RI (Realisasi)</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mt-2" aria-live="polite" aria-label={readout}>
                <div className="p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-center">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase">{BULAN_SINGKAT[idx]}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{data.tahun}</div>
                </div>
                <div className="p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-center">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">RKAP</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">{fPct(rkap)}</div>
                </div>
                <div className="p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-center">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">Eksternal</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">{fPct(eks)}</div>
                </div>
                <div className="p-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-center">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">Realisasi</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">{fPct(ri)}</div>
                    {dev !== undefined && (
                        <div className={`text-[11px] font-bold ${dev >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {dev >= 0 ? '+' : ''}{dev.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Arus kas bulanan ─────────────────────────────────────────────────────────
// Batang berpasangan Cash In (hijau) dan Cash Out (merah) untuk bulan yang
// dilaporkan. Label nilai (Rp miliar) tampil bila bulan ≤ 6; tabel tersembunyi
// tersedia untuk pembaca layar.
const fMiliar = (v: number) => (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 });

export function CashflowChart({ points, tahun }: { points: CashflowPoint[]; tahun: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const W = 320, H = 150, L = 30, R = 8, T = 14, B = 20;
    const max = Math.max(1, ...points.flatMap(p => [p.masuk ?? 0, p.keluar ?? 0]));
    const top = Math.ceil((max / 1e9) / 5) * 5 * 1e9 || 1e9;           // pembulatan ke kelipatan 5 M
    const slot = (W - L - R) / points.length;
    const bw = Math.min(slot * 0.34, 18);
    const y = (v: number) => T + (H - T - B) * (1 - v / top);
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
    const txt = isDark ? '#94a3b8' : '#475569';
    const cIn = isDark ? TONE_HEX.emerald : '#047857';
    const cOut = isDark ? TONE_HEX.rose : '#be123c';
    const showLabels = points.length <= 6;
    const ticks = [0, 0.5, 1].map(f => f * top);

    return (
        <div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Grafik arus kas bulanan ${tahun}, cash in dan cash out dalam miliar rupiah`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={grid} strokeWidth="1" />
                        <text x={L - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill={txt}>{fMiliar(t)}</text>
                    </g>
                ))}
                {points.map((p, i) => {
                    const cx = L + slot * i + slot / 2;
                    const bars = [
                        { v: p.masuk, x: cx - bw - 1, c: cIn, n: 'Cash In' },
                        { v: p.keluar, x: cx + 1, c: cOut, n: 'Cash Out' },
                    ];
                    return (
                        <g key={p.bulan}>
                            {bars.map(b => typeof b.v === 'number' && (
                                <g key={b.n}>
                                    <rect x={b.x} y={y(b.v)} width={bw} height={Math.max(0, H - B - y(b.v))} rx="2" fill={b.c}>
                                        <title>{`${BULAN_SINGKAT[p.bulan]} ${tahun} · ${b.n}: ${fRpShort(b.v)}`}</title>
                                    </rect>
                                    {showLabels && <text x={b.x + bw / 2} y={y(b.v) - 3} textAnchor="middle" fontSize="7.5" fill={txt}>{fMiliar(b.v)}</text>}
                                </g>
                            ))}
                            <text x={cx} y={H - 6} textAnchor="middle" fontSize="8" fill={txt}>{BULAN_SINGKAT[p.bulan]}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cIn }} aria-hidden="true" /> Cash In</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cOut }} aria-hidden="true" /> Cash Out</span>
                <span className="ml-auto text-slate-500 dark:text-slate-400 font-medium">Rp miliar</span>
            </div>
            <table className="sr-only">
                <caption>Arus kas bulanan {tahun}</caption>
                <thead><tr><th scope="col">Bulan</th><th scope="col">Cash In</th><th scope="col">Cash Out</th></tr></thead>
                <tbody>
                    {points.map(p => (
                        <tr key={p.bulan}><th scope="row">{BULAN_SINGKAT[p.bulan]}</th><td>{fRpShort(p.masuk)}</td><td>{fRpShort(p.keluar)}</td></tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ── Tabel hasil usaha ────────────────────────────────────────────────────────
const HU_ROWS: { key: keyof HasilUsahaPeriode; label: string }[] = [
    { key: 'pendapatan', label: 'Pendapatan' },
    { key: 'hpp', label: 'HPP' },
    { key: 'ebitda', label: 'EBITDA' },
    { key: 'labaBersih', label: 'Laba Bersih' },
];

export function HasilUsahaTable({ bulanIni, sdBulanIni, rencana }: {
    bulanIni?: HasilUsahaPeriode; sdBulanIni?: HasilUsahaPeriode; rencana?: HasilUsahaPeriode;
}) {
    const cols = [
        { id: 'bln', head: 'Bulan Ini', data: bulanIni },
        { id: 'sd', head: 's.d Bulan Ini', data: sdBulanIni },
        ...(rencana ? [{ id: 'rc', head: 'Rencana', data: rencana }] : []),
    ];
    const tone = (k: keyof HasilUsahaPeriode, v?: number) =>
        v != null && v < 0 && (k === 'ebitda' || k === 'labaBersih') ? 'text-rose-500' : 'text-slate-900 dark:text-white';
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
                <caption className="sr-only">Hasil usaha: bulan ini, sampai bulan ini, dan rencana</caption>
                <thead>
                    <tr className="text-slate-500 dark:text-slate-400">
                        <th scope="col" className="text-left font-bold uppercase tracking-wider pb-1.5 pr-2" />
                        {cols.map(c => <th key={c.id} scope="col" className="text-right font-bold uppercase tracking-wider pb-1.5 pl-2 whitespace-nowrap">{c.head}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {HU_ROWS.map(r => (
                        <tr key={r.key} className="border-t border-black/[0.06] dark:border-white/[0.06]">
                            <th scope="row" className="text-left font-bold text-slate-600 dark:text-slate-300 py-1.5 pr-2 whitespace-nowrap">{r.label}</th>
                            {cols.map(c => {
                                const v = c.data?.[r.key];
                                const planV = rencana?.[r.key];
                                const showAch = c.id === 'sd' && typeof v === 'number' && typeof planV === 'number' && planV > 0;
                                const hp = r.key === 'hpp' ? hppPersen(c.data) : undefined;
                                return (
                                    <td key={c.id} className={`text-right font-mono font-black py-1.5 pl-2 whitespace-nowrap ${tone(r.key, v)}`}>
                                        {fRpShort(v)}
                                        {(hp != null || showAch) && (
                                            <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                {hp != null && `${hp.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% PU`}
                                                {showAch && r.key !== 'hpp' && `${((v / planV) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% rencana`}
                                            </span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
