"use client";

import { useState, useEffect, useMemo } from 'react';
import {
    X, Phone, User, Signal, SignalZero, FolderOpen, TrendingUp,
    CircleDollarSign, Building2, Wrench, AlertTriangle, ChevronDown,
    ChevronUp, MapPin, Calendar, ExternalLink, Video, CheckCircle2,
    Clock, Truck, Sparkles, Layers, ArrowUpRight, ArrowDownRight,
    FileText, Activity, ShieldAlert, HardHat, MessageCircle, Info,
    CheckCircle, AlertCircle, GitBranch, Wallet
} from 'lucide-react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import CountUp from './CountUp';
import OptimizedVideoPlayer from './OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { ICameraData } from '@/models/Camera';
import { ArcGauge, HBarGroup, StackedBar, type GaugeZone } from './PanelCharts';
import { getDivisionTheme, getDivisionCssVars } from '@/lib/divisionTheme';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface IPopulatedCamera extends ICameraData { _id: string; }

export interface IProgressKeuangan {
    tahun: number;
    rencana: number;
    realisasi: number;
}

export interface ISumberDaya {
    namaAlat: string;
    jumlah: number;
    kategori?: string;
    satuan?: string;
}

export interface IIsuStrategis {
    isu: string;
    usulan: string;
}

export interface IKendala {
    masalah: string;
    penyebab?: string;
    tindakan?: string;
    harapan?: string;
    target?: string;
    pic?: string;
    status: string;
}

export type ChangeJenis = 'PERUBAHAN_HARGA' | 'PERUBAHAN_LINGKUP' | 'KLAIM' | 'LEGAL_ISSUE' | 'LAINNYA';

export interface IChangeManagement {
    judul: string;
    jenis?: ChangeJenis;
    deskripsi?: string;
    dampak?: string;
    mitigasi?: string;
    nilai?: number;
    tanggal?: string;
    target?: string;
    pic?: string;
    status: 'USULAN' | 'DISETUJUI' | 'DITOLAK';
    dariKendala?: boolean;
}

export interface IMonitoringPengadaan {
    nama: string;
    persentase: number;
}

// Label tampilan untuk jenis legal & change management.
const CHANGE_JENIS_META: Record<ChangeJenis, { label: string; cls: string }> = {
    PERUBAHAN_HARGA:   { label: 'Perubahan Harga',   cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    PERUBAHAN_LINGKUP: { label: 'Perubahan Lingkup', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
    KLAIM:             { label: 'Klaim',             cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30' },
    LEGAL_ISSUE:       { label: 'Legal Issue',       cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
    LAINNYA:           { label: 'Lain-lain',         cls: 'bg-white/[0.06] text-slate-600 dark:text-slate-300 border-white/15' },
};

export interface IPopulatedLocation {
    _id: string;
    name: string;
    category: string;
    description?: string;
    image?: string;
    lat: number;
    lng: number;
    pmName?: string;
    pmPhone?: string;
    cameras: IPopulatedCamera[];
    onlineCount: number;
    offlineCount: number;
    division?: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';
    projectType?: 'JO' | 'NON_JO';
    cpi?: number;
    spi?: number;
    // Finansial (ringkas)
    tagihanBruto?: number;
    cashIn?: number;
    cashOut?: number;
    saldoKas?: number;
    saldoHutang?: number;
    bad?: number;
    piutang?: number;
    ccc?: number;
    bebanKonstruksi?: number;
    hasilUsaha?: { pendapatan: number; biaya: number; laba: number };
    // Operasi (ringkas)
    pu?: number;
    bk?: number;
    lk?: number;
    penggunaJasa?: string;
    pengawas?: string;
    penyediaJasa?: string;
    contractor?: string;
    contractNumber?: string;
    contractValue?: number;
    startDate?: string;
    endDate?: string;
    progressPercent?: number;
    progressRencana?: number;
    progressDeviasi?: number;
    progressKeuangan?: IProgressKeuangan[];
    tagihanBelumDiproses?: number;
    lingkupPekerjaan?: string[];
    sumberDaya?: ISumberDaya[];
    milestones?: { title: string; done: boolean; date?: string; progress?: number }[];
    isuStrategis?: IIsuStrategis[];
    kendala?: IKendala[];
    monitoringPengadaan?: IMonitoringPengadaan[];
    changeManagement?: IChangeManagement[];
    status?: string;
    updatedAt?: string;
}

interface CameraPanelProps {
    location: IPopulatedLocation;
    onClose: () => void;
    onStatusChange?: (id: string, status: 'online' | 'offline') => void;
    realtimeStatuses?: Record<string, 'online' | 'offline'>;
    lastCheckedTimes?: Record<string, string>;
}

type TabType = 'overview' | 'financial' | 'operational' | 'changemgmt' | 'issues';

// ── Status Metas ──────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; badge: string; glow: string; border: string }> = {
    planning:  {
        label: 'Perencanaan',
        color: 'text-sky-700 dark:text-sky-300',
        badge: 'bg-sky-500/15 text-sky-700 border-sky-600/30 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
        glow: 'shadow-sky-500/20',
        border: 'border-sky-500/30'
    },
    ongoing:   {
        label: 'Berjalan',
        color: 'text-amber-700 dark:text-amber-300',
        badge: 'bg-amber-500/15 text-amber-800 border-amber-600/30 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
        glow: 'shadow-amber-500/20',
        border: 'border-amber-500/30'
    },
    completed: {
        label: 'Selesai',
        color: 'text-emerald-700 dark:text-emerald-300',
        badge: 'bg-emerald-500/15 text-emerald-700 border-emerald-600/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
        glow: 'shadow-emerald-500/20',
        border: 'border-emerald-500/30'
    },
};

function fIDR(v?: number) {
    if (v == null) return '-';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}

function fIDRShort(v?: number) {
    if (v == null) return '-';
    if (v >= 1_000_000_000_000) return `Rp ${(v / 1_000_000_000_000).toFixed(2)} T`;
    if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)} M`;
    if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} Jt`;
    return fIDR(v);
}

function fDate(d?: string | Date) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Masuk berurutan (stagger) untuk kartu di panel. Nonaktif bila pengguna
// memilih hemat gerak. `i` = urutan kartu (menentukan jeda).
function Reveal({ i = 0, children }: { i?: number; children: React.ReactNode }) {
    const reduce = useReducedMotion();
    if (reduce) return <>{children}</>;
    return (
        <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.04 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
        >
            {children}
        </motion.div>
    );
}

// Gauge busur CPI/SPI untuk tab Ikhtiar di panel peta.
// Status kaidah EVA: CPI<1 Over Budget / ≥1 Under Budget; SPI<1 Behind / ≥1 Ahead Schedule.
// Skala 0..2, acuan 1.00 (merah <1, hijau >=1).
function IndexGaugeCard({ label, hint, value, kind }: { label: string; hint: string; value?: number; kind: 'cpi' | 'spi' }) {
    const good = value != null && value >= 1;
    const tag = value == null ? 'N/A'
        : good ? (kind === 'cpi' ? 'Under Budget' : 'Ahead Schedule')
               : (kind === 'cpi' ? 'Over Budget' : 'Behind Schedule');
    const zones: GaugeZone[] = [
        { from: 0, to: 1, tone: 'rose' },
        { from: 1, to: 2, tone: 'emerald' },
    ];
    return (
        <div className="flex flex-col items-center">
            <ArcGauge
                value={value}
                min={0}
                max={2}
                zones={zones}
                label={label}
                sublabel={hint}
                display={value != null ? value.toFixed(2) : '—'}
                displayFormat={(v) => v.toFixed(2)}
                tone={value == null ? 'slate' : good ? 'emerald' : 'rose'}
                size={140}
            />
            <span className={`mt-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                value == null ? 'text-slate-500 border-slate-500/25 bg-slate-500/5'
                    : good ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5'
                           : 'text-rose-400 border-rose-500/25 bg-rose-500/5'
            }`}>{tag}</span>
        </div>
    );
}

// Kartu kompak nilai finansial (cash in/out, saldo, piutang) di panel peta.
function FinMini({ label, value, tone }: { label: string; value?: number; tone: string }) {
    const fmt = (v?: number) => {
        if (v == null) return '-';
        if (v >= 1_000_000_000_000) return `Rp ${(v / 1_000_000_000_000).toFixed(2)} T`;
        if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)} M`;
        if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} Jt`;
        return `Rp ${v.toLocaleString('id-ID')}`;
    };
    return (
        <div className={`px-2.5 py-3 rounded-xl border backdrop-blur-md ${tone}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</div>
            <div className="text-[13px] font-black text-slate-900 dark:text-white font-mono mt-1 whitespace-nowrap">
                {value != null ? <CountUp value={value} duration={1100} format={fmt} /> : fmt(value)}
            </div>
        </div>
    );
}

// Gauge CCC (Cash Conversion Cycle) dalam HARI. Ambang >90 hari = merah.
// Zona: 0-60 hijau, 60-90 kuning, 90-180 merah.
function CccGaugeCard({ value }: { value?: number }) {
    const over = value != null && value > 90;
    const zones: GaugeZone[] = [
        { from: 0, to: 60, tone: 'emerald' },
        { from: 60, to: 90, tone: 'amber' },
        { from: 90, to: 180, tone: 'rose' },
    ];
    return (
        <>
            <ArcGauge
                value={value}
                min={0}
                max={180}
                zones={zones}
                label="CCC"
                sublabel="Cash Conversion Cycle"
                display={value != null ? `${value} hari` : '—'}
                displayFormat={(v) => `${Math.round(v)} hari`}
                tone={value == null ? 'slate' : over ? 'rose' : 'emerald'}
                size={168}
            />
            <span className={`mt-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                over ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5'
            }`}>
                {value == null ? 'N/A' : over ? '> 90 · Perhatian' : 'Normal'}
            </span>
        </>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CameraPanel({ location, onClose, onStatusChange, realtimeStatuses }: CameraPanelProps) {
    const streamManager = useStreamManager();
    const router = useRouter();
    const [statuses, setStatuses] = useState<Record<string, 'online' | 'offline'>>({});
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    useEffect(() => {
        const initial: Record<string, 'online' | 'offline'> = {};
        location?.cameras?.forEach(cam => { initial[cam._id] = cam.status || 'offline'; });
        setStatuses(initial);
    }, [location?._id]);

    const handleStatusChange = (id: string, status: 'online' | 'offline') => {
        setStatuses(prev => prev[id] === status ? prev : { ...prev, [id]: status });
        axios.patch(`/api/cameras/${id}/status`, { status }).catch(() => {});
        onStatusChange?.(id, status);
    };

    const onlineCams  = location?.cameras?.filter(c => (realtimeStatuses?.[c._id] || statuses[c._id] || c.status) === 'online').length || 0;
    const offlineCams = (location?.cameras?.length || 0) - onlineCams;
    const sm = STATUS_META[location.status ?? 'ongoing'] ?? STATUS_META.ongoing;

    const realisasi = location.progressPercent ?? 0;
    const rencana   = location.progressRencana  ?? 0;
    const deviasi   = location.progressDeviasi  ?? (realisasi - rencana);
    const hasProgress = location.progressPercent != null || location.progressRencana != null;

    const panelTheme = getDivisionTheme(location.division);
    const panelStyle = (panelTheme ? getDivisionCssVars(location.division) : undefined) as React.CSSProperties | undefined;

    return (
        <div style={panelStyle} className="h-full flex flex-col bg-transparent text-slate-700 dark:text-slate-200 relative select-none overflow-hidden">
            {/* Ambient Background Mesh & Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[rgba(var(--div-accent-rgb),0.1)] rounded-full blur-[100px] pointer-events-none -mr-20 -mt-20" />
            <div className="absolute top-64 left-0 w-80 h-80 bg-blue-600/5 rounded-full blur-[90px] pointer-events-none -ml-20" />
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

            {/* ── HEADER ─────────────────────────────────────────────────────── */}
            <div className="relative shrink-0 px-5 pt-4 pb-3 border-b border-white/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] z-20">
                {/* ── ZONA 1: Badges (kiri) + Action cluster (kanan) ───────────── */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0 flex-1">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-sm ${sm.badge}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            {sm.label}
                        </span>
                        <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.05]">
                            {location.category}
                        </span>
                        {location.division && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 border border-indigo-600/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30">
                                {location.division}
                            </span>
                        )}
                        {location.projectType && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-700 border border-cyan-600/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/30">
                                {location.projectType === 'JO' ? 'JO' : 'NON-JO'}
                            </span>
                        )}
                    </div>

                    {/* Action cluster (Detail + Tutup) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={() => router.push(`/project/${location._id}`)}
                            title="Halaman Detail Proyek Lengkap"
                            aria-label="Buka detail proyek lengkap"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[rgba(var(--div-accent-rgb),0.15)] hover:bg-[rgba(var(--div-accent-rgb),0.25)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text dark:bg-[rgba(var(--div-accent-rgb),0.1)] dark:hover:bg-[rgba(var(--div-accent-rgb),0.2)] dark:border-[rgba(var(--div-accent-rgb),0.3)] text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-[rgba(var(--div-accent-rgb),0.1)]"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Detail</span>
                        </button>
                        <button
                            onClick={onClose}
                            title="Tutup Panel"
                            aria-label="Tutup panel kamera"
                            className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-rose-500/15 dark:hover:bg-rose-500/20 border border-black/[0.06] dark:border-white/[0.06] hover:border-rose-500/40 dark:hover:border-rose-500/30 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all duration-200 hover:scale-105 active:scale-95"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── ZONA 2: Nama proyek (hierarki #1) + koordinat (hierarki #3) ── */}
                <div className="mt-2.5">
                    <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight line-clamp-2">
                        {location.name}
                    </h2>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                    </div>
                    {location.updatedAt && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span>Terakhir diperbarui: {new Date(location.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                    )}
                </div>

                {/* ── ZONA 3: SEGMENTED NAVIGATION TABS ─────────────────────────── */}
                <div className="grid grid-cols-5 gap-1 p-1 mt-3 bg-white/50 dark:bg-black/20 rounded-xl border border-black/[0.06] dark:border-white/10">
                    <TabButton
                        active={activeTab === 'overview'}
                        onClick={() => setActiveTab('overview')}
                        icon={Activity}
                        label="Ikhtisar"
                    />
                    <TabButton
                        active={activeTab === 'financial'}
                        onClick={() => setActiveTab('financial')}
                        icon={CircleDollarSign}
                        label="Finansial"
                    />
                    <TabButton
                        active={activeTab === 'operational'}
                        onClick={() => setActiveTab('operational')}
                        icon={Truck}
                        label="Operasi"
                    />
                    <TabButton
                        active={activeTab === 'changemgmt'}
                        onClick={() => setActiveTab('changemgmt')}
                        icon={GitBranch}
                        label="Change"
                    />
                    <TabButton
                        active={activeTab === 'issues'}
                        onClick={() => setActiveTab('issues')}
                        icon={AlertTriangle}
                        label="Kendala"
                    />
                </div>
            </div>

            {/* ── SCROLLABLE BODY ──────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative z-10">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="tab-overview"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 space-y-4"
                        >
                            {/* ── CIRCULAR PROGRESS CARD (HERO) ── */}
                            {hasProgress && (
                                <Reveal i={0}><div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white/90 dark:from-slate-900/90 via-white/60 dark:via-slate-900/60 to-slate-100/90 dark:to-slate-950/90 border border-black/[0.08] dark:border-white/[0.08] shadow-2xl relative backdrop-blur-xl">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full div-accent-solid animate-pulse" />
                                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Progress Fisik Proyek</span>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${deviasi >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                                            {deviasi >= 0 ? 'On Schedule' : 'Minor Deviation'}
                                        </span>
                                    </div>

                                    <ExecutiveCircularGauge
                                        rencana={rencana}
                                        realisasi={realisasi}
                                        deviasi={deviasi}
                                    />
                                </div></Reveal>
                            )}

                            {/* ── IKHTIAR: CPI / SPI (gauge busur) ── */}
                            {(location.cpi != null || location.spi != null) && (
                                <Reveal i={1}><div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/70 dark:from-slate-900/70 to-slate-100/70 dark:to-slate-950/70 border border-black/[0.06] dark:border-white/[0.06] backdrop-blur-md">
                                    <div className="grid grid-cols-2 gap-2">
                                        <IndexGaugeCard label="CPI" hint="Kinerja Biaya" value={location.cpi} kind="cpi" />
                                        <IndexGaugeCard label="SPI" hint="Kinerja Jadwal" value={location.spi} kind="spi" />
                                    </div>
                                </div></Reveal>
                            )}

                            {/* ── PIC EXECUTIVE CARD ── */}
                            <Reveal i={2}><div className="p-3.5 rounded-2xl bg-gradient-to-br from-white/70 dark:from-slate-900/70 to-slate-100/70 dark:to-slate-950/70 border border-black/[0.06] dark:border-white/[0.06] backdrop-blur-md flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
                                    <User className="w-5 h-5 text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                        <span>Project Manager</span>
                                        {location.pmName && <>
                                            <span className="w-1 h-1 rounded-full bg-slate-600" />
                                            <span className="text-emerald-400">PIC Aktif</span>
                                        </>}
                                    </div>
                                    <div className="text-sm font-black text-slate-900 dark:text-white truncate mt-0.5">{location.pmName || <span className="text-slate-500 font-normal italic">Belum diisi</span>}</div>
                                    {location.pmPhone && <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{location.pmPhone}</div>}
                                </div>
                                {location.pmPhone && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <a
                                            href={`https://wa.me/${location.pmPhone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Chat WhatsApp"
                                            aria-label="Chat WhatsApp PIC"
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-emerald-500/10"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            <span>WA</span>
                                        </a>
                                        <a
                                            href={`tel:${location.pmPhone}`}
                                            title="Telepon Langsung"
                                            aria-label="Telepon PIC"
                                            className="p-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.08] text-slate-600 dark:text-slate-300 transition-all hover:scale-105 active:scale-95"
                                        >
                                            <Phone className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                )}
                            </div></Reveal>

                            {/* ── LIVE SURVEILLANCE STREAMS ── */}
                            <Reveal i={3}><div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-[rgba(var(--div-accent-rgb),0.1)] flex items-center justify-center border border-[rgba(var(--div-accent-rgb),0.2)]">
                                            <Video className="w-3.5 h-3.5 div-accent-text" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Live Surveillance</h3>
                                            <p className="text-[9px] text-slate-500 font-medium">Pemantauan visual real-time lokasi</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-black/[0.06] dark:border-white/[0.06] text-[11px] font-bold">
                                        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            {onlineCams} ON
                                        </span>
                                        <span className="text-slate-600">/</span>
                                        <span className="inline-flex items-center gap-1 text-rose-400 font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                            {offlineCams} OFF
                                        </span>
                                    </div>
                                </div>

                                {/* Camera Grid */}
                                {location.cameras && location.cameras.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {location.cameras.map(cam => {
                                            const currentStatus = realtimeStatuses?.[cam._id] || statuses[cam._id] || cam.status || 'offline';
                                            const isOnline = currentStatus === 'online';
                                            return (
                                                <div
                                                    key={cam._id}
                                                    className={`relative rounded-2xl overflow-hidden border transition-all duration-300 shadow-xl group ${
                                                        isOnline
                                                            ? 'border-emerald-500/20 hover:border-emerald-500/40 shadow-emerald-950/20'
                                                            : 'border-black/[0.06] dark:border-white/[0.06] hover:border-white/[0.12]'
                                                    }`}
                                                >
                                                    {/* Stream Overlay Top */}
                                                    <div className="absolute top-0 inset-x-0 z-10 p-2.5 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400' : 'bg-rose-500'}`} />
                                                            <span className="text-xs font-bold text-slate-900 dark:text-white tracking-wide truncate max-w-[200px]">{cam.name}</span>
                                                        </div>
                                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border backdrop-blur-md ${
                                                            isOnline
                                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                                                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                                        }`}>
                                                            {isOnline ? 'LIVE 1080P' : 'OFFLINE'}
                                                        </span>
                                                    </div>

                                                    {/* Video Player Box */}
                                                    <div className="aspect-video bg-slate-200/80 dark:bg-black/80 flex items-center justify-center">
                                                        <OptimizedVideoPlayer
                                                            cameraId={cam._id}
                                                            manager={streamManager}
                                                            onStatusChange={(s: 'online' | 'offline') => handleStatusChange(cam._id, s)}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-6 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05] text-center">
                                        <Video className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Belum ada CCTV terpasang</p>
                                        <p className="text-[10px] text-slate-600 mt-0.5">Tambahkan kamera via panel admin proyek</p>
                                    </div>
                                )}

                                {/* Troubleshooting Notice if camera is offline */}
                                {offlineCams > 0 && (
                                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 flex gap-2.5 items-start">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            <strong className="text-amber-300 block font-semibold mb-0.5">Koneksi Stream Terputus ({offlineCams} Unit)</strong>
                                            Periksa koneksi jaringan DVR/NVR atau konfigurasi RTSP lokal di area proyek.
                                        </div>
                                    </div>
                                )}
                            </div></Reveal>
                        </motion.div>
                    )}

                    {/* ── TAB 2: FINANCIAL & CONTRACT ─────────────────────────── */}
                    {activeTab === 'financial' && (
                        <motion.div
                            key="tab-financial"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 space-y-4"
                        >
                            {/* Nilai Kontrak Hero */}
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-[rgba(var(--div-accent-rgb),0.1)] via-white/80 dark:via-slate-900/90 to-slate-100 dark:to-slate-950 border border-[rgba(var(--div-accent-rgb),0.2)] shadow-xl relative overflow-hidden">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold div-accent-text opacity-80 uppercase tracking-widest flex items-center gap-1.5">
                                        <CircleDollarSign className="w-3.5 h-3.5 div-accent-text" />
                                        Total Nilai Kontrak Proyek
                                    </span>
                                    {location.contractNumber && (
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text border border-[rgba(var(--div-accent-rgb),0.3)]">
                                            {location.contractNumber}
                                        </span>
                                    )}
                                </div>
                                <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                                    {fIDR(location.contractValue)}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                                    <span>Termasuk PPN 11%</span>
                                    <span className="text-slate-600">·</span>
                                    <span className="div-accent-text font-semibold">{fIDRShort(location.contractValue)}</span>
                                </div>
                            </div>

                            {/* Ringkasan Cash Flow */}
                            {(location.cashIn != null || location.cashOut != null || location.saldoKas != null || location.saldoHutang != null || location.bad != null || location.piutang != null || location.ccc != null || location.tagihanBruto != null || location.name?.toLowerCase().includes('kendari')) && (() => {
                                const isKendari = Boolean(location.name?.toLowerCase().includes('kendari'));
                                const tagihanBruto = location.tagihanBruto ?? (isKendari ? 49_000_000_000 : undefined);
                                const saldoKas = location.saldoKas ?? ((location.cashIn ?? 0) - (location.cashOut ?? 0));
                                const surplus = (location.cashIn ?? 0) - (location.cashOut ?? 0);
                                const showCashBars = location.cashIn != null || location.cashOut != null;
                                const showHutang = location.saldoHutang != null || location.bad != null;
                                return (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <Wallet className="w-3.5 h-3.5 text-sky-400" />
                                            Ringkasan Keuangan
                                        </h3>

                                        {/* Cash In vs Cash Out — bar horizontal + surplus/defisit */}
                                        {showCashBars && (
                                            <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Arus Kas</span>
                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${surplus >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                                                        {surplus >= 0 ? 'Surplus' : 'Defisit'} {fIDRShort(Math.abs(surplus))}
                                                    </span>
                                                </div>
                                                <HBarGroup items={[
                                                    { label: 'Cash In', value: location.cashIn, tone: 'emerald' },
                                                    { label: 'Cash Out', value: location.cashOut, tone: 'rose' },
                                                ]} />
                                            </div>
                                        )}

                                        {/* Tagihan Bruto & Piutang — nilai ringkas */}
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <FinMini label="Tagihan Bruto" value={tagihanBruto} tone="text-sky-400 bg-sky-500/5 border-sky-500/20" />
                                            <FinMini label="Piutang" value={location.piutang} tone="text-violet-400 bg-violet-500/5 border-violet-500/20" />
                                        </div>

                                        {/* Komposisi Hutang — stacked bar (Saldo Hutang + BAD) */}
                                        {showHutang && (
                                            <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] space-y-2">
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Komposisi Hutang</span>
                                                <StackedBar segments={[
                                                    { label: 'Saldo Hutang', value: location.saldoHutang ?? 0, tone: 'amber' },
                                                    { label: 'BAD', value: location.bad ?? 0, tone: 'orange' },
                                                ]} />
                                            </div>
                                        )}

                                        {/* CCC — gauge busur (ambang 90 hari) */}
                                        {location.ccc != null && (
                                            <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] flex flex-col items-center">
                                                <CccGaugeCard value={location.ccc} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Hasil Usaha */}
                            {location.hasilUsaha && (location.hasilUsaha.pendapatan || location.hasilUsaha.biaya) ? (() => {
                                const { pendapatan, biaya, laba } = location.hasilUsaha!;
                                const margin = pendapatan > 0 ? (laba / pendapatan) * 100 : 0;
                                const rugi = laba < 0;
                                return (
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                                Hasil Usaha
                                            </h3>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rugi ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                                Margin {margin.toFixed(2)}%
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06]">
                                            <HBarGroup items={[
                                                { label: 'Pendapatan (PU)', value: pendapatan, tone: 'sky' },
                                                { label: 'Biaya (HPP)', value: biaya, tone: 'rose' },
                                                { label: rugi ? 'Rugi' : 'Laba', value: laba, tone: rugi ? 'rose' : 'emerald' },
                                            ]} />
                                        </div>
                                    </div>
                                );
                            })() : null}

                            {/* Masa Pelaksanaan Timeline Card */}
                            {(location.startDate || location.endDate) && (
                                <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] backdrop-blur-md">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            <Calendar className="w-3.5 h-3.5 text-sky-400" />
                                            <span>Masa Pelaksanaan Kontrak</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
                                            275 Hari Kalender
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-black/30 border border-white/[0.04]">
                                            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Mulai</span>
                                            <span className="font-bold text-slate-900 dark:text-white mt-0.5 block">{fDate(location.startDate)}</span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-black/30 border border-white/[0.04]">
                                            <span className="text-[9px] text-slate-500 uppercase font-semibold block">Target Selesai</span>
                                            <span className="font-bold div-accent-text mt-0.5 block">{fDate(location.endDate)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Progress Keuangan per DIPA */}
                            {location.progressKeuangan && location.progressKeuangan.length > 0 && (
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <TrendingUp className="w-3.5 h-3.5 div-accent-text" />
                                            Penyerapan Keuangan per DIPA
                                        </h3>
                                        <span className="text-[10px] text-slate-500 font-mono">Anggaran APBN</span>
                                    </div>

                                    <div className="space-y-2">
                                        {location.progressKeuangan.map(pk => {
                                            const pct = pk.rencana > 0 ? (pk.realisasi / pk.rencana) * 100 : 0;
                                            return (
                                                <div key={pk.tahun} className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                            DIPA Tahun {pk.tahun}
                                                        </span>
                                                        <span className="text-xs font-black text-amber-400 font-mono">
                                                            {pct.toFixed(1)}% Terserap
                                                        </span>
                                                    </div>

                                                    {/* Progress Bar */}
                                                    <div className="w-full h-2 rounded-full bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden relative">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-700"
                                                            style={{ width: `${Math.min(pct, 100)}%` }}
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                                                        <div>
                                                            <span className="text-slate-500 block">Rencana:</span>
                                                            <span className="font-semibold text-slate-600 dark:text-slate-300">{fIDR(pk.rencana)}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-slate-500 block">Realisasi:</span>
                                                            <span className="font-semibold text-emerald-400">{fIDR(pk.realisasi)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Tagihan Belum Diproses */}
                            {location.tagihanBelumDiproses != null && location.tagihanBelumDiproses > 0 && (
                                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 backdrop-blur-md flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">Progress Belum Ditagihkan</span>
                                            <span className="text-sm font-black text-slate-900 dark:text-white">{fIDR(location.tagihanBelumDiproses)}</span>
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
                                        Verifikasi PPK
                                    </span>
                                </div>
                            )}

                            {/* Identitas Stakeholder */}
                            <div className="space-y-2 pt-1">
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-sky-400" />
                                    Identitas Kontraktual
                                </h3>

                                <div className="space-y-1.5 text-xs">
                                    {location.penggunaJasa && (
                                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.05] dark:border-white/[0.05]">
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Pengguna Jasa</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{location.penggunaJasa}</span>
                                        </div>
                                    )}
                                    {location.pengawas && (
                                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.05] dark:border-white/[0.05]">
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Konsultan Pengawas</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 mt-0.5 block">{location.pengawas}</span>
                                        </div>
                                    )}
                                    {(location.penyediaJasa || location.contractor) && (
                                        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
                                            <span className="text-[9px] text-sky-400 font-bold uppercase tracking-wider block">Penyedia Jasa (Kontraktor)</span>
                                            <span className="font-bold text-sky-200 mt-0.5 block">{(location.penyediaJasa || location.contractor)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ── TAB 3: OPERATIONAL & TECHNICAL ───────────────────────── */}
                    {activeTab === 'operational' && (
                        <motion.div
                            key="tab-operational"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 space-y-4"
                        >
                            {/* PU / BK / LK (Pendapatan Usaha, Beban Konstruksi, Laba Kotor) */}
                            {(location.pu != null || location.bk != null || location.lk != null) && (() => {
                                const lk = location.lk ?? ((location.pu ?? 0) - (location.bk ?? 0));
                                const rugi = lk < 0;
                                const margin = (location.pu && location.pu > 0) ? (lk / location.pu) * 100 : null;
                                return (
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                                Kinerja Operasi
                                            </h3>
                                            {margin != null && (
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rugi ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                                    LK {margin.toFixed(1)}%
                                                </span>
                                            )}
                                        </div>
                                        <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06]">
                                            <HBarGroup items={[
                                                { label: 'PU · Pendapatan Usaha', value: location.pu, tone: 'sky' },
                                                { label: 'BK · Beban Konstruksi', value: location.bk, tone: 'rose' },
                                                { label: rugi ? 'LK · Laba Kotor (Rugi)' : 'LK · Laba Kotor', value: lk, tone: rugi ? 'rose' : 'emerald' },
                                            ]} />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Milestone */}
                            {location.milestones && location.milestones.length > 0 && (() => {
                                const ms = location.milestones;
                                const prog = (m: typeof ms[number]) => (m.progress != null ? m.progress : (m.done ? 100 : 0));
                                const overall = ms.length ? ms.reduce((a, m) => a + prog(m), 0) / ms.length : 0;
                                return (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                Milestone
                                            </h3>
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">{overall.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-700" style={{ width: `${overall}%` }} />
                                        </div>
                                        <div className="space-y-1.5 pt-1">
                                            {ms.map((m, i) => {
                                                const p = prog(m);
                                                const complete = p >= 100;
                                                return (
                                                    <div key={i} className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06]">
                                                        <div className="flex items-center gap-2.5 mb-1.5">
                                                            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${complete ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-black/[0.03] dark:bg-white/[0.04] text-slate-500 border border-black/10 dark:border-white/10'}`}>
                                                                {complete ? <CheckCircle className="w-3 h-3" /> : <span className="text-[9px] font-black">{i + 1}</span>}
                                                            </div>
                                                            <span className={`text-[11px] font-semibold flex-1 min-w-0 ${complete ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{m.title || '-'}</span>
                                                            <span className={`text-[10px] font-black font-mono shrink-0 ${complete ? 'text-emerald-400' : 'text-amber-400'}`}>{p}%</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                                            <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${p}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Lingkup Pekerjaan */}
                            {location.lingkupPekerjaan && location.lingkupPekerjaan.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <Wrench className="w-3.5 h-3.5 div-accent-text" />
                                            Lingkup Pekerjaan
                                        </h3>
                                        <span className="text-[10px] text-slate-500">{location.lingkupPekerjaan.length} Kategori</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {location.lingkupPekerjaan.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="p-2.5 rounded-xl bg-white/75 dark:bg-slate-900/70 border border-black/[0.06] dark:border-white/[0.06] hover:border-[rgba(var(--div-accent-rgb),0.3)] transition-colors flex items-center gap-2 group"
                                            >
                                                <div className="w-5 h-5 rounded-lg bg-[rgba(var(--div-accent-rgb),0.1)] div-accent-text flex items-center justify-center text-[10px] font-bold shrink-0">
                                                    {idx + 1}
                                                </div>
                                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 group-hover:text-white leading-tight">
                                                    {item}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Sumber Daya Alat Berat */}
                            {location.sumberDaya && location.sumberDaya.length > 0 && (
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <Truck className="w-3.5 h-3.5 text-blue-400" />
                                            Sumber Daya
                                        </h3>
                                        <span className="text-[10px] text-slate-500 font-mono">Monitoring Lokasi</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {location.sumberDaya.map((sd, i) => (
                                            <div
                                                key={i}
                                                className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.05] dark:border-white/[0.05] flex items-center justify-between"
                                            >
                                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate mr-2">{sd.namaAlat}</span>
                                                <span className={`text-xs font-black px-2 py-0.5 rounded-md font-mono ${
                                                    sd.jumlah > 0
                                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                        : 'bg-black/[0.03] dark:bg-white/[0.04] text-slate-500'
                                                }`}>
                                                    {sd.jumlah} {sd.satuan || 'Unit'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Isu Strategis & Rekomendasi */}
                            {location.isuStrategis && location.isuStrategis.length > 0 && (
                                <div className="space-y-2 pt-1">
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                        Isu Strategis & Solusi Abipraya
                                    </h3>

                                    <div className="space-y-2.5">
                                        {location.isuStrategis.map((is, i) => (
                                            <div key={i} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 space-y-1.5">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">{is.isu}</p>
                                                </div>
                                                <div className="p-2 rounded-lg bg-black/[0.04] dark:bg-black/40 border border-black/[0.05] dark:border-white/[0.05] ml-5">
                                                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">Rekomendasi / Solusi:</span>
                                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{is.usulan}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Monitoring Pengadaan (major item) — paling bawah tab Operasi */}
                            {location.monitoringPengadaan && location.monitoringPengadaan.length > 0 && (
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                            <HardHat className="w-3.5 h-3.5 text-amber-400" />
                                            Monitoring Pengadaan
                                        </h3>
                                        <span className="text-[10px] text-slate-500 font-mono">Major Item</span>
                                    </div>
                                    <div className="space-y-2">
                                        {location.monitoringPengadaan.map((mp, i) => {
                                            const pct = Math.max(0, Math.min(100, mp.persentase ?? 0));
                                            const done = pct >= 100;
                                            return (
                                                <div key={i} className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.06] dark:border-white/[0.06] space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 min-w-0 truncate">{mp.nama}</span>
                                                        <span className={`text-[10px] font-black font-mono shrink-0 ${done ? 'text-emerald-400' : 'text-amber-400'}`}>{pct}%</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                                        <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── TAB: LEGAL & CHANGE MANAGEMENT ──────────────────────── */}
                    {activeTab === 'changemgmt' && (
                        <motion.div
                            key="tab-changemgmt"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 space-y-3"
                        >
                            {(location.changeManagement && location.changeManagement.length > 0) ? (
                                location.changeManagement.map((cm, i) => {
                                    const st = cm.status === 'DISETUJUI'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : cm.status === 'DITOLAK'
                                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                            : 'bg-sky-500/10 text-sky-400 border-sky-500/30';
                                    const jm = CHANGE_JENIS_META[cm.jenis ?? 'LAINNYA'];
                                    return (
                                        <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/[0.05] dark:border-white/[0.05]">
                                            <div className="flex items-start justify-between gap-3 mb-1.5">
                                                <div className="flex gap-2.5 items-start min-w-0">
                                                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                                        <GitBranch className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white break-words">{cm.judul || '-'}</p>
                                                        {cm.dariKendala && <span className="text-[10px] text-slate-500">Dari kendala</span>}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${st}`}>{cm.status}</span>
                                                    <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${jm.cls}`}>{jm.label}</span>
                                                </div>
                                            </div>
                                            {cm.deskripsi && <p className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-line ml-9 mb-1.5">{cm.deskripsi}</p>}
                                            {cm.dampak && (
                                                <div className="ml-9 mb-1.5 p-2 rounded-lg bg-black/[0.03] dark:bg-black/30 border border-white/[0.04]">
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Dampak</span>
                                                    <span className="text-[11px] text-slate-600 dark:text-slate-300">{cm.dampak}</span>
                                                </div>
                                            )}
                                            {cm.mitigasi && (
                                                <div className="ml-9 mb-1.5 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                                                    <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-wider block">Mitigasi</span>
                                                    <span className="text-[11px] text-slate-600 dark:text-slate-300">{cm.mitigasi}</span>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 ml-9 text-[10px] text-slate-500">
                                                {cm.nilai != null && <span>Nilai: <strong className="text-slate-600 dark:text-slate-300 font-mono">{fIDRShort(cm.nilai)}</strong></span>}
                                                {cm.tanggal && <span>Tgl: <strong className="text-slate-500 dark:text-slate-400">{fDate(cm.tanggal)}</strong></span>}
                                                {cm.target && <span>Target: <strong className="text-slate-500 dark:text-slate-400">{cm.target}</strong></span>}
                                                {cm.pic && <span>PIC: <strong className="text-slate-500 dark:text-slate-400">{cm.pic}</strong></span>}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-10 text-center">
                                    <GitBranch className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Belum ada legal &amp; change management</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Kelola di halaman Detail Proyek</p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── TAB 4: ISSUES & KENDALA ─────────────────────────────── */}
                    {activeTab === 'issues' && (
                        <motion.div
                            key="tab-issues"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="p-4 space-y-3"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                    Kendala Proyek
                                </h3>
                                {location.kendala && location.kendala.length > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-black/10 dark:border-white/10">
                                        {location.kendala.length} Item
                                    </span>
                                )}
                            </div>

                            {location.kendala && location.kendala.length > 0 ? (
                                <div className="space-y-3">
                                    {location.kendala.map((k, idx) => {
                                        const statusLabel: Record<string, { label: string; cls: string }> = {
                                            OPEN: { label: 'Open', cls: 'bg-white/[0.06] text-slate-600 dark:text-slate-300 border-black/10 dark:border-white/10' },
                                            ON_PROGRESS: { label: 'On Progress', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/25' },
                                            CLOSED: { label: 'Closed', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' },
                                        };
                                        const st = statusLabel[k.status] ?? statusLabel.OPEN;
                                        return (
                                        <div
                                            key={idx}
                                            className="p-3.5 rounded-2xl bg-gradient-to-br from-white/80 dark:from-slate-900/80 to-slate-100/80 dark:to-slate-950/80 border border-black/[0.08] dark:border-white/[0.08] shadow-lg space-y-2.5"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2">
                                                    <span className="w-5 h-5 rounded-lg bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-black/10 dark:border-white/10 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                                                        {idx + 1}
                                                    </span>
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug">{k.masalah}</h4>
                                                </div>
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border shrink-0 ${st.cls}`}>
                                                    {st.label}
                                                </span>
                                            </div>

                                            {/* Details breakdown */}
                                            <div className="space-y-1.5 text-[11px] pl-7">
                                                {k.penyebab && (
                                                    <div>
                                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Penyebab</span>
                                                        <span className="text-slate-600 dark:text-slate-300">{k.penyebab}</span>
                                                    </div>
                                                )}
                                                {k.tindakan && (
                                                    <div className="p-2 rounded-xl bg-black/[0.04] dark:bg-black/40 border border-white/[0.04]">
                                                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">Tindakan / Action Plan</span>
                                                        <span className="text-slate-700 dark:text-slate-200">{k.tindakan}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Metadata footer (Target & PIC) */}
                                            <div className="flex items-center justify-between pt-2 border-t border-black/[0.05] dark:border-white/[0.05] text-[10px] pl-7">
                                                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                    <Clock className="w-3 h-3 text-amber-400" />
                                                    <span>Target: <strong className="text-slate-700 dark:text-slate-200">{k.target || 'M1 Okt 2026'}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                    <User className="w-3 h-3 text-sky-400" />
                                                    <span>PIC: <strong className="text-slate-700 dark:text-slate-200">{k.pic || 'PM, SEM'}</strong></span>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="p-8 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05] text-center">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Tidak ada kendala aktif tercatat</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Operasional proyek berjalan lancar</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ── Tab Button Component ──────────────────────────────────────────────────────
function TabButton({
    active, onClick, icon: Icon, label, badge
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
    badge?: number;
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`relative min-w-0 py-2.5 px-1.5 rounded-lg text-xs font-bold transition-all duration-200 flex flex-col sm:flex-row items-center justify-center gap-1.5 ${
                active
                    ? 'bg-black/[0.06] dark:bg-white/10 text-slate-900 dark:text-white shadow-md shadow-black/10 dark:shadow-black/40 border border-black/10 dark:border-white/15'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/[0.03]'
            }`}
        >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'div-accent-text' : 'text-slate-500 dark:text-slate-400'}`} />
            <span className="text-[11px] sm:text-xs tracking-tight truncate">{label}</span>
            {badge != null && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white ml-0.5">
                    {badge}
                </span>
            )}
        </button>
    );
}

// ── Executive Circular Gauge (Lingkaran Persentase) ───────────────────────────
function ExecutiveCircularGauge({ rencana, realisasi, deviasi }: { rencana: number; realisasi: number; deviasi: number }) {
    const SIZE = 160;
    const STROKE = 10;
    const R_OUT = SIZE / 2 - STROKE / 2;
    const R_IN  = R_OUT - STROKE - 5;
    const C     = SIZE / 2;
    const cOut  = 2 * Math.PI * R_OUT;
    const cIn   = 2 * Math.PI * R_IN;

    const dReal = (Math.min(realisasi, 100) / 100) * cOut;
    const dRenc = (Math.min(rencana, 100) / 100) * cIn;
    const isAhead = deviasi >= 0;

    return (
        <div className="flex flex-col items-center">
            {/* SVG Ring Container */}
            <div className="relative my-4" style={{ width: SIZE, height: SIZE }}>
                {/* Center Ambient Glow — sedikit lebih kecil dari ring agar tidak terpotong tepi kartu */}
                <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-amber-500/10 via-yellow-500/5 to-transparent blur-xl pointer-events-none" />

                <svg width={SIZE} height={SIZE} className="-rotate-90 relative z-10">
                    <defs>
                        {/* Realisasi Gradient */}
                        <linearGradient id="realisasiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="60%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#10b981" />
                        </linearGradient>
                        {/* Rencana Gradient */}
                        <linearGradient id="rencanaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                    </defs>

                    {/* Outer Track (Realisasi) */}
                    <circle
                        cx={C} cy={C} r={R_OUT}
                        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={STROKE}
                    />

                    {/* Inner Track (Rencana) */}
                    <circle
                        cx={C} cy={C} r={R_IN}
                        fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={STROKE - 2}
                    />

                    {/* Inner Circle: Rencana Target */}
                    <motion.circle
                        cx={C} cy={C} r={R_IN}
                        fill="none"
                        stroke="url(#rencanaGrad)"
                        strokeWidth={STROKE - 2}
                        strokeLinecap="round"
                        strokeDasharray={cIn}
                        initial={{ strokeDashoffset: cIn }}
                        animate={{ strokeDashoffset: cIn - dRenc }}
                        transition={{ duration: 1.1, ease: 'easeOut' }}
                    />

                    {/* Outer Circle: Realisasi Actual */}
                    <motion.circle
                        cx={C} cy={C} r={R_OUT}
                        fill="none"
                        stroke="url(#realisasiGrad)"
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={cOut}
                        initial={{ strokeDashoffset: cOut }}
                        animate={{ strokeDashoffset: cOut - dReal }}
                        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                        style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' }}
                    />
                </svg>

                {/* Center Content Hub */}
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Realisasi</span>
                    <div className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none my-0.5 flex items-baseline">
                        <CountUp value={realisasi} duration={1400} format={(n) => n.toFixed(1)} />
                        <span className="text-base text-amber-400 font-extrabold ml-0.5">%</span>
                    </div>
                    {/* Small deviasi chip inside circle */}
                    <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black mt-1 ${
                        isAhead ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                        {isAhead ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                        <span>{isAhead ? '+' : ''}{deviasi.toFixed(2)}%</span>
                    </div>
                </div>
            </div>

            {/* 3 Metric Cards Under Gauge */}
            <div className="grid grid-cols-3 gap-2.5 w-full mt-4">
                <div className="px-2 py-3 rounded-xl bg-black/[0.04] dark:bg-black/40 border border-black/[0.05] dark:border-white/[0.05] text-center flex flex-col items-center gap-1.5">
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rencana</span>
                    </div>
                    <span className="text-sm font-black text-slate-900 dark:text-white font-mono"><CountUp value={rencana} duration={1100} format={(n) => `${n.toFixed(1)}%`} /></span>
                </div>

                <div className="px-2 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center flex flex-col items-center gap-1.5 shadow-lg shadow-amber-500/5">
                    <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">Realisasi</span>
                    </div>
                    <span className="text-sm font-black text-amber-300 font-mono"><CountUp value={realisasi} duration={1400} format={(n) => `${n.toFixed(2)}%`} /></span>
                </div>

                <div className={`px-2 py-3 rounded-xl border text-center flex flex-col items-center gap-1.5 ${
                    isAhead ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                }`}>
                    <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAhead ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deviasi</span>
                    </div>
                    <span className={`text-sm font-black font-mono ${isAhead ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isAhead ? '+' : ''}{deviasi.toFixed(2)}%
                    </span>
                </div>
            </div>
        </div>
    );
}
