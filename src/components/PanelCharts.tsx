"use client";

import { useTheme } from './ThemeProvider';

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
    tone?: keyof typeof TONE_HEX; // warna angka tengah
    size?: number;
}) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
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

    const hasValue = value != null && Number.isFinite(value);
    const needleAngle = hasValue ? toAngle(value as number) : 180;

    // Jarum berbentuk segitiga ramping (pointer): ujung menunjuk nilai,
    // pangkal melebar di dua sisi hub. Dihitung dari sudut jarum ± 90°.
    const tip = polar(cx, cy, r - track / 2 - 1, needleAngle);
    const baseL = polar(cx, cy, 5, needleAngle + 90);
    const baseR = polar(cx, cy, 5, needleAngle - 90);
    const needlePath = `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${baseL.x.toFixed(2)} ${baseL.y.toFixed(2)} L ${baseR.x.toFixed(2)} ${baseR.y.toFixed(2)} Z`;

    const numHex = value == null ? TONE_HEX.slate : TONE_HEX[tone];

    return (
        <div className="flex flex-col items-center">
            <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
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
                <div className="text-2xl font-black leading-none mt-0.5" style={{ color: numHex }}>{display}</div>
                {sublabel && <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mt-0.5">{sublabel}</div>}
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</span>
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
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</span>
                        <span className="text-[10px] font-black font-mono text-slate-700 dark:text-slate-200">{fRpShort(s.value)}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{totalLabel}</span>
                    <span className="text-[11px] font-black font-mono text-slate-900 dark:text-white">{fRpShort(sum)}</span>
                </div>
            </div>
        </div>
    );
}
