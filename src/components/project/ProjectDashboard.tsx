"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, CalendarDays, CircleDollarSign, ClipboardCheck, Gauge, Info, MapPin, Receipt, TrendingUp, User, Wallet } from 'lucide-react';
import {
    BULAN_SINGKAT, cashflowSeries, huRencanaPeriode, kurvaSSeries, latestLaporan, periodeLabel,
    type KurvaSData, type LaporanBulanan, type RencanaKurvaS,
} from '@/lib/projectReport';
import { HBar, HasilUsahaTable, fRpShort } from '@/components/PanelCharts';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Dashboard tab Ringkasan: satu layar, tanpa scroll di desktop (lg ke atas).
 * Di bawah lg kartu ditumpuk dan halaman boleh di-scroll biasa.
 * Tinggi layar = 100dvh dikurangi header sticky (--ph-h, diisi halaman proyek).
 */
interface DashboardProject {
    laporanBulanan?: LaporanBulanan[];
    rencanaKurvaS?: RencanaKurvaS[];
    contractValue?: number;
    tagihanBruto?: number;
    contractor?: string;
    penyediaJasa?: string;
    pmName?: string;
    progressPercent?: number;
    progressRencana?: number;
    progressDeviasi?: number;
    progressKeuangan?: { tahun: number; rencana: number; realisasi: number }[];
    tagihanBelumDiproses?: number;
    lingkupPekerjaan?: string[];
    description?: string;
    cameras?: unknown[];
}

interface Completeness<T extends string> {
    items: { label: string; done: boolean; tab: T }[];
    doneCount: number;
    total: number;
    percent: number;
}

interface Props<T extends string> {
    project: DashboardProject;
    status: { label: string };
    onlineCams: number;
    /** Bulan progres fisik, mis. "Agustus 2026" */
    fisikSampai?: string;
    completeness: Completeness<T>;
    canEdit: boolean;
    onGoTab: (t: T) => void;
    onGoLaporan: () => void;
    /** Isi kartu CPI/SPI (tampil + edit), dikelola oleh pemanggil */
    indeks: ReactNode;
}

const LINGKUP_MAX = 6;
const CARD = 'rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5';
const ACCENT = 'rgb(var(--div-accent-rgb))';
const fPct = (v?: number) => (v == null ? '-' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const fSigned = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

/** Ukuran piksel elemen, supaya grafik SVG digambar tajam mengikuti kartu. */
function useBox<E extends HTMLElement>() {
    const ref = useRef<E>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, box] as const;
}

function Panel({ title, icon, aside, className = '', children }: { title: string; icon: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
    return (
        <section className={`${CARD} p-3 flex flex-col min-h-0 min-w-0 ${className}`}>
            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0">
                    {icon}<span className="truncate">{title}</span>
                </h3>
                {aside}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </section>
    );
}

function Empty({ text, action }: { text: string; action?: { label: string; run: () => void } }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">{text}</p>
            {action && (
                <button type="button" onClick={action.run} className="px-3 py-2 rounded-lg div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                    {action.label}
                </button>
            )}
        </div>
    );
}

function Chip({ tone, children }: { tone: 'good' | 'bad' | 'info'; children: ReactNode }) {
    const c = tone === 'good' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        : tone === 'bad' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
        : 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30';
    return <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${c}`}>{children}</span>;
}

function Ring({ value, inner, color, innerColor, size = 112, label, sub }: { value: number; inner?: number; color: string; innerColor?: string; size?: number; label: string; sub?: string }) {
    const stroke = Math.max(9, Math.round(size * 0.085));
    const r = size / 2 - stroke / 2;
    const r2 = r - stroke - 3;
    const arc = (rad: number, v: number) => {
        const circ = 2 * Math.PI * rad;
        return { circ, off: circ - (Math.min(Math.max(v, 0), 100) / 100) * circ };
    };
    const a = arc(r, value);
    const b = inner != null ? arc(r2, inner) : undefined;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-black/10 dark:stroke-white/10" strokeWidth={stroke} />
                {b && <circle cx={size / 2} cy={size / 2} r={r2} fill="none" className="stroke-black/5 dark:stroke-white/5" strokeWidth={stroke - 3} />}
                {b && <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke={innerColor} strokeWidth={stroke - 3} strokeLinecap="round" strokeDasharray={b.circ} strokeDashoffset={b.off} />}
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={a.circ} strokeDashoffset={a.off} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="font-black leading-none text-slate-900 dark:text-white" style={{ fontSize: Math.max(20, size * 0.19) }}>{label}</span>
                {sub && <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-1">{sub}</span>}
            </div>
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</span>
            <span className={`text-sm font-black font-mono ${tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'bad' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{value}</span>
        </div>
    );
}

/** Isi kartu Progress Fisik: ring mengisi ruang yang tersedia, bar rencana vs realisasi di bawahnya. */
function FisikBody({ realisasi, rencana, deviasi, sampai }: { realisasi: number; rencana: number; deviasi: number; sampai?: string }) {
    const [ref, { w, h }] = useBox<HTMLDivElement>();
    const size = Math.round(Math.min(Math.max(Math.min(h, w * 0.5), 96), 230));
    const bar = (label: string, v: number, color: string) => (
        <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300">
                <span>{label}</span><span className="font-mono">{v.toFixed(2)}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(v, 0), 100)}%`, backgroundColor: color }} />
            </div>
        </div>
    );
    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div ref={ref} className="flex-1 min-h-[120px] lg:min-h-0 flex items-center justify-center gap-5">
                {w > 0 && (
                    <>
                        <Ring value={realisasi} inner={rencana} color={ACCENT} innerColor="#38bdf8" size={size} label={`${realisasi.toFixed(1)}%`} sub="Realisasi" />
                        <div className="min-w-0 flex flex-col gap-2 text-right">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Deviasi</div>
                                <div className={`text-2xl font-black font-mono leading-tight ${deviasi >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                    {deviasi >= 0 ? '+' : '−'}{Math.abs(deviasi).toFixed(2)}%
                                </div>
                            </div>
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Rencana</div>
                                <div className="text-lg font-black font-mono leading-tight text-slate-900 dark:text-white">{rencana.toFixed(2)}%</div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            <div className="shrink-0 space-y-2">
                {bar('Rencana', rencana, '#38bdf8')}
                {bar('Realisasi', realisasi, ACCENT)}
                {sampai && <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 pt-0.5">Progres s.d. {sampai}</p>}
            </div>
        </div>
    );
}

function KurvaSCompact({ data }: { data: KurvaSData }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [ref, { w, h }] = useBox<HTMLDivElement>();
    const last = (a: (number | undefined)[]) => a.reduce<number>((acc, v, i) => (typeof v === 'number' ? i : acc), -1);
    const iRi = last(data.ri);
    const idx = iRi >= 0 ? iRi : Math.max(last(data.rkap), last(data.eksternal), 0);
    const ri = data.ri[idx];
    const ra = data.rkap[idx];
    const dev = ri != null && ra != null ? ri - ra : undefined;

    const nums = [...data.rkap, ...data.eksternal, ...data.ri].filter((v): v is number => typeof v === 'number');
    const yMax = Math.max(100, Math.ceil(Math.max(...nums) / 10) * 10);
    const L = 30, R = 8, T = 8, B = 18;
    const x = (i: number) => L + ((w - L - R) * i) / 11;
    const y = (v: number) => T + (h - T - B) * (1 - v / yMax);
    const path = (a: (number | undefined)[]) =>
        a.flatMap((v, i) => (typeof v === 'number' ? [`${x(i).toFixed(1)} ${y(v).toFixed(1)}`] : [])).map((p, i) => `${i ? 'L' : 'M'} ${p}`).join(' ');
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
    const txt = isDark ? '#94a3b8' : '#475569';
    const cRa = isDark ? '#38bdf8' : '#0369a1';
    const cEks = isDark ? '#fb923c' : '#c2410c';
    const wide = w / 12 > 28;

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 shrink-0">
                {[
                    { l: 'Realisasi', v: fPct(ri), c: 'text-slate-900 dark:text-white' },
                    { l: 'Rencana', v: fPct(ra), c: 'text-slate-900 dark:text-white' },
                    { l: 'Deviasi', v: dev === undefined ? '-' : fSigned(dev), c: dev === undefined ? 'text-slate-900 dark:text-white' : dev >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400' },
                ].map(s => (
                    <div key={s.l} className="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{s.l}</div>
                        <div className={`text-lg font-black leading-tight ${s.c}`}>{s.v}</div>
                    </div>
                ))}
            </div>
            <div ref={ref} className="relative flex-1 min-h-[150px] lg:min-h-0">
                {w > 0 && h > 0 && (
                    <svg width={w} height={h} className="absolute inset-0" role="img" aria-label={`Kurva S ${data.tahun}: realisasi ${fPct(ri)}, rencana ${fPct(ra)} pada ${BULAN_SINGKAT[idx]}`}>
                        {[0, 0.5, 1].map(f => (
                            <g key={f}>
                                <line x1={L} x2={w - R} y1={y(yMax * f)} y2={y(yMax * f)} stroke={grid} />
                                <text x={L - 4} y={y(yMax * f) + 3} textAnchor="end" fontSize="10" fill={txt}>{Math.round(yMax * f)}%</text>
                            </g>
                        ))}
                        {BULAN_SINGKAT.map((m, i) => (
                            <text key={m} x={x(i)} y={h - 4} textAnchor="middle" fontSize="10" fill={i === idx ? ACCENT : txt} fontWeight={i === idx ? 700 : 400}>{wide ? m : m[0]}</text>
                        ))}
                        <path d={path(data.rkap)} fill="none" stroke={cRa} strokeWidth="1.8" strokeDasharray="5 3" />
                        <path d={path(data.eksternal)} fill="none" stroke={cEks} strokeWidth="1.8" strokeDasharray="2 3" />
                        <path d={path(data.ri)} fill="none" stroke={ACCENT} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                        {typeof ra === 'number' && <circle cx={x(idx)} cy={y(ra)} r="3.5" fill={cRa} />}
                        {typeof ri === 'number' && <circle cx={x(idx)} cy={y(ri)} r="4.5" fill={ACCENT} stroke={isDark ? '#0f172a' : '#fff'} strokeWidth="1.5" />}
                    </svg>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-[3px]" style={{ borderColor: ACCENT }} aria-hidden="true" />Realisasi</span>
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: cRa }} aria-hidden="true" />Rencana Internal</span>
                <span className="inline-flex items-center gap-1"><i className="w-4 border-t-2 border-dotted" style={{ borderColor: cEks }} aria-hidden="true" />RA Eksternal</span>
                <span className="ml-auto font-medium text-slate-600 dark:text-slate-400">{data.basisFromContract ? `Basis kontrak ${fRpShort(data.basis)}` : 'Basis nilai terbesar'}</span>
            </div>
        </div>
    );
}

function CashflowCompact({ points, tahun }: { points: { bulan: number; masuk?: number; keluar?: number }[]; tahun: number }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [ref, { w, h }] = useBox<HTMLDivElement>();
    const L = 30, R = 6, T = 8, B = 18;
    const max = Math.max(1, ...points.flatMap(p => [p.masuk ?? 0, p.keluar ?? 0]));
    const top = Math.ceil(max / 1e9 / 5) * 5 * 1e9 || 1e9;
    const slot = (w - L - R) / Math.max(points.length, 1);
    const bw = Math.max(2, Math.min(slot * 0.36, 16));
    const y = (v: number) => T + (h - T - B) * (1 - v / top);
    const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)';
    const txt = isDark ? '#94a3b8' : '#475569';
    const cIn = isDark ? '#34d399' : '#047857';
    const cOut = isDark ? '#fb7185' : '#be123c';
    const mil = (v: number) => (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 0 });
    return (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div ref={ref} className="relative flex-1 min-h-[140px] lg:min-h-0">
                {w > 0 && h > 0 && (
                    <svg width={w} height={h} className="absolute inset-0" role="img" aria-label={`Arus kas bulanan ${tahun}, cash in dan cash out dalam miliar rupiah`}>
                        {[0, 0.5, 1].map(f => (
                            <g key={f}>
                                <line x1={L} x2={w - R} y1={y(top * f)} y2={y(top * f)} stroke={grid} />
                                <text x={L - 4} y={y(top * f) + 3} textAnchor="end" fontSize="10" fill={txt}>{mil(top * f)}</text>
                            </g>
                        ))}
                        {points.map((p, i) => {
                            const cx = L + slot * i + slot / 2;
                            return (
                                <g key={p.bulan}>
                                    {typeof p.masuk === 'number' && <rect x={cx - bw - 1} y={y(p.masuk)} width={bw} height={Math.max(0, h - B - y(p.masuk))} rx="2" fill={cIn}><title>{`${BULAN_SINGKAT[p.bulan]} ${tahun} · Cash In: ${fRpShort(p.masuk)}`}</title></rect>}
                                    {typeof p.keluar === 'number' && <rect x={cx + 1} y={y(p.keluar)} width={bw} height={Math.max(0, h - B - y(p.keluar))} rx="2" fill={cOut}><title>{`${BULAN_SINGKAT[p.bulan]} ${tahun} · Cash Out: ${fRpShort(p.keluar)}`}</title></rect>}
                                    <text x={cx} y={h - 4} textAnchor="middle" fontSize="10" fill={txt}>{slot > 26 ? BULAN_SINGKAT[p.bulan] : BULAN_SINGKAT[p.bulan][0]}</text>
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cIn }} aria-hidden="true" />Cash In</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cOut }} aria-hidden="true" />Cash Out</span>
                <span className="ml-auto font-medium text-slate-600 dark:text-slate-400">Rp miliar</span>
            </div>
        </div>
    );
}

export default function ProjectDashboard<T extends string>({ project, status, onlineCams, fisikSampai, completeness, canEdit, onGoTab, onGoLaporan, indeks }: Props<T>) {
    const latest = latestLaporan(project.laporanBulanan);
    const periodeText = latest ? periodeLabel(latest.periode) : '';
    const goLaporan = canEdit ? { label: 'Isi Laporan Bulanan', run: onGoLaporan } : undefined;

    // Progres fisik
    const hasFisik = project.progressPercent != null || project.progressRencana != null;
    const realisasi = project.progressPercent ?? 0;
    const rencana = project.progressRencana ?? 0;
    const deviasi = project.progressDeviasi ?? realisasi - rencana;

    // Progres keuangan (DIPA)
    const pk = project.progressKeuangan ?? [];
    const pkRencana = pk.reduce((a, c) => a + (c.rencana || 0), 0);
    const pkRealisasi = pk.reduce((a, c) => a + (c.realisasi || 0), 0);
    const pkPct = pkRencana > 0 ? (pkRealisasi / pkRencana) * 100 : 0;

    // Laporan bulanan
    const kurvaS = kurvaSSeries(project);
    const cashflow = cashflowSeries(project.laporanBulanan);
    const neto = cashflow ? cashflow.masuk - cashflow.keluar : 0;
    const sd = latest?.huSdBulanIni;
    const hasHu = !!(latest && (latest.huBulanIni || sd));
    const huPlan = latest ? huRencanaPeriode(project.rencanaKurvaS, latest.periode) : undefined;
    const margin = sd?.pendapatan && sd.pendapatan > 0 && sd.hpp != null ? ((sd.pendapatan - sd.hpp) / sd.pendapatan) * 100 : undefined;
    const tagihan = latest?.tagihanBruto ?? project.tagihanBruto;
    const target = latest?.targetTagihan;
    const showTagihan = tagihan != null && target != null && target > 0;
    const pengadaan = latest?.pengadaan;
    const paket = (pengadaan?.paketTotal ?? 0) > 0;
    const pagu = (pengadaan?.paguTotal ?? 0) > 0;

    const kpis = [
        { label: 'Status', value: status.label, icon: Info },
        { label: 'Realisasi Fisik', value: hasFisik ? `${realisasi.toFixed(2)}%` : '-', icon: TrendingUp },
        { label: 'Nilai Kontrak', value: project.contractValue ? fRpShort(project.contractValue) : '-', icon: CircleDollarSign },
        { label: 'Kontraktor', value: project.contractor || project.penyediaJasa || '-', icon: Building2 },
        { label: 'CCTV Online', value: `${onlineCams}/${project.cameras?.length ?? 0}`, icon: MapPin },
        { label: 'PIC', value: project.pmName || '-', icon: User },
    ];
    const missing = completeness.items.filter(i => !i.done);
    const lingkup = project.lingkupPekerjaan ?? [];
    const tone = completeness.percent >= 80 ? 'bg-emerald-500' : completeness.percent >= 40 ? 'bg-amber-500' : 'bg-rose-500';

    return (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:h-[calc(100dvh-var(--ph-h,5.5rem)-1.5rem)]">
            {/* Baris 1: KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:col-span-12">
                {kpis.map(k => (
                    <div key={k.label} className={`${CARD} px-3 py-2 min-w-0`}>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <k.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span className="text-[11px] font-bold uppercase tracking-wider truncate">{k.label}</span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5" title={k.value}>{k.value}</div>
                    </div>
                ))}
            </div>

            {/* Baris 2 */}
            <Panel
                className="lg:col-span-3"
                title="Progress Fisik"
                icon={<TrendingUp className="w-3.5 h-3.5 div-accent-text shrink-0" aria-hidden="true" />}
                aside={hasFisik ? <Chip tone={deviasi >= 0 ? 'good' : 'bad'}>{deviasi >= 0 ? 'On Schedule' : 'Deviasi Negatif'}</Chip> : undefined}
            >
                {hasFisik ? (
                    <FisikBody realisasi={realisasi} rencana={rencana} deviasi={deviasi} sampai={fisikSampai} />
                ) : <Empty text="Progres fisik belum diisi." />}
            </Panel>

            <Panel
                className="lg:col-span-3"
                title="Progress Keuangan"
                icon={<CircleDollarSign className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />}
                aside={pk.length > 0 ? <Chip tone="info">{pkPct.toFixed(1)}% terserap</Chip> : undefined}
            >
                {pk.length > 0 ? (
                    <div className="flex-1 min-h-0 flex flex-col gap-3">
                        <div className="flex items-center gap-4 shrink-0">
                            <Ring value={pkPct} color="#38bdf8" label={`${pkPct.toFixed(1)}%`} sub="Serapan" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                <Stat label="Realisasi" value={fRpShort(pkRealisasi)} />
                                <Stat label="Rencana" value={fRpShort(pkRencana)} />
                                {project.tagihanBelumDiproses ? <Stat label="Belum diproses" value={fRpShort(project.tagihanBelumDiproses)} /> : null}
                            </div>
                        </div>
                        <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                            {pk.map(p => {
                                const v = p.rencana > 0 ? (p.realisasi / p.rencana) * 100 : 0;
                                return (
                                    <li key={p.tahun} className="text-[11px]">
                                        <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                            <span>DIPA {p.tahun}</span><span className="font-mono">{v.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden mt-0.5">
                                            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(v, 100)}%` }} />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : <Empty text="Progres keuangan (DIPA) belum diisi." />}
            </Panel>

            <Panel className="lg:col-span-2" title="CPI / SPI" icon={<Gauge className="w-3.5 h-3.5 div-accent-text shrink-0" aria-hidden="true" />}>
                {indeks}
            </Panel>

            <Panel
                className="lg:col-span-4"
                title={kurvaS ? `Kurva S ${kurvaS.tahun}` : 'Kurva S'}
                icon={<TrendingUp className="w-3.5 h-3.5 div-accent-text shrink-0" aria-hidden="true" />}
            >
                {kurvaS ? <KurvaSCompact data={kurvaS} /> : <Empty text="Kurva S tampil setelah laporan bulanan dan rencana tahunan diisi." action={goLaporan} />}
            </Panel>

            {/* Baris 3 */}
            <Panel
                className="lg:col-span-3"
                title={cashflow ? `Arus Kas ${cashflow.tahun}` : 'Arus Kas'}
                icon={<Wallet className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />}
                aside={cashflow ? <Chip tone={neto >= 0 ? 'good' : 'bad'}>Kumulatif {neto >= 0 ? '+' : '−'}{fRpShort(Math.abs(neto))}</Chip> : undefined}
            >
                {cashflow ? <CashflowCompact points={cashflow.points} tahun={cashflow.tahun} /> : <Empty text="Belum ada data arus kas." action={goLaporan} />}
            </Panel>

            <Panel
                className="lg:col-span-3"
                title={hasHu ? `Hasil Usaha · ${periodeText}` : 'Hasil Usaha'}
                icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />}
                aside={margin !== undefined ? <Chip tone={margin >= 0 ? 'good' : 'bad'}>Margin {margin.toFixed(1)}%</Chip> : undefined}
            >
                {hasHu && latest ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <HasilUsahaTable bulanIni={latest.huBulanIni} sdBulanIni={sd} rencana={huPlan} />
                    </div>
                ) : <Empty text="Belum ada data hasil usaha." action={goLaporan} />}
            </Panel>

            <Panel
                className="lg:col-span-3"
                title={showTagihan && (paket || pagu) ? 'Tagihan & Pengadaan' : paket || pagu ? 'Pengadaan' : 'Tagihan'}
                icon={<Receipt className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />}
            >
                {showTagihan || paket || pagu ? (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                        {showTagihan && (
                            <HBar
                                label="Tagihan vs target"
                                valueText={`${fRpShort(tagihan)} / ${fRpShort(target)} (${Math.round(((tagihan as number) / (target as number)) * 100)}%)`}
                                fraction={(tagihan as number) / (target as number)}
                                tone={(tagihan as number) >= (target as number) ? 'emerald' : 'sky'}
                            />
                        )}
                        {paket && pengadaan && (
                            <HBar
                                label="Jumlah paket"
                                valueText={`${pengadaan.paketRealisasi ?? 0} / ${pengadaan.paketTotal} · sisa ${(pengadaan.paketTotal ?? 0) - (pengadaan.paketRealisasi ?? 0)}`}
                                fraction={(pengadaan.paketRealisasi ?? 0) / (pengadaan.paketTotal as number)}
                                tone="emerald"
                            />
                        )}
                        {pagu && pengadaan && (
                            <HBar
                                label="Progres pagu"
                                valueText={`${fRpShort(pengadaan.paguRealisasi ?? 0)} / ${fRpShort(pengadaan.paguTotal)}`}
                                fraction={(pengadaan.paguRealisasi ?? 0) / (pengadaan.paguTotal as number)}
                                tone="sky"
                            />
                        )}
                    </div>
                ) : <Empty text="Belum ada data tagihan atau pengadaan." action={goLaporan} />}
            </Panel>

            <Panel
                className="lg:col-span-3"
                title="Kelengkapan & Lingkup"
                icon={<ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />}
                aside={<span className="text-xs font-black font-mono text-slate-900 dark:text-white">{completeness.percent}%</span>}
            >
                <div className="flex-1 min-h-0 flex flex-col gap-3">
                    <div className="shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                <div className={`h-full rounded-full ${tone}`} style={{ width: `${completeness.percent}%` }} />
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-400">{completeness.doneCount}/{completeness.total} terisi</span>
                        </div>
                        {missing.length > 0 ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Belum diisi</span>
                                {missing.map(m => (
                                    <button key={m.label} type="button" title={m.label} onClick={() => onGoTab(m.tab)} className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] font-semibold text-amber-800 dark:text-amber-300 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                        {m.label.replace(/\s*\(.*\)/, '')}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Semua bagian sudah terisi.</p>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto pr-1 pt-3 border-t border-black/5 dark:border-white/10 space-y-3">
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                                <CalendarDays className="w-3 h-3" aria-hidden="true" />Lingkup pekerjaan
                            </div>
                            {lingkup.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {lingkup.slice(0, LINGKUP_MAX).map((lp, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.2)] div-accent-text">{lp}</span>
                                    ))}
                                    {lingkup.length > LINGKUP_MAX && (
                                        <span title={lingkup.slice(LINGKUP_MAX).join(', ')} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-black/[0.05] dark:bg-white/10 text-slate-700 dark:text-slate-300">+{lingkup.length - LINGKUP_MAX} lainnya</span>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-600 dark:text-slate-400">Belum diisi.</p>
                            )}
                        </div>
                        {project.description && (
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                                    <Info className="w-3 h-3" aria-hidden="true" />Deskripsi
                                </div>
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-4" title={project.description}>{project.description}</p>
                            </div>
                        )}
                    </div>
                </div>
            </Panel>
        </div>
    );
}
