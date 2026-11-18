"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, use, useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    ArrowLeft, Loader2, MapPin, FileText, Image as ImageIcon, TrendingUp, Info, Upload, Trash2, Pencil, Check, X,
    User, Clock, CircleDollarSign, ExternalLink,
    AlertTriangle, ShieldCheck, Plus, Minus,
    ArrowUpRight, ArrowDownRight, Layers, Target, Wallet, Receipt,
    Menu, GitBranch, ChevronLeft, ChevronRight, BookOpen, CalendarDays, Video, FolderOpen, Download, LayoutDashboard
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import OptimizedVideoPlayer from '@/components/OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { useCameraStatusSSE } from '@/hooks/useCameraStatusSSE';
import type { FootprintPoint } from '@/components/FootprintEditor';
import { getDivisionCssVars } from '@/lib/divisionTheme';
import { BULAN_NAMA, computeEvm, derivedFromLaporan, isLaporanFresh, isValidPeriode, kontrakHari, latestLaporan, periodeLabel, type LaporanBulanan, type RencanaKurvaS } from '@/lib/projectReport';
import { QhsseTrendChart } from '@/components/project/QhsseChart';
import QhsseCard from '@/components/project/QhsseCard';
import {
    QHSSE_DIMS, QHSSE_DIM_BY_ID, computedNilai, filledCount, fmtNum, fmtRupiah, fmtValue, nextPeriode, periodeFull, qpassOverall, seriesFor, summarize,
    type QhsseData, type QhsseDimId, type QhsseKey, type QhsseGlossary, type QhsseNilai,
} from '@/lib/qhsse';
import LaporanBulananTab from '@/components/project/LaporanBulananTab';
import ProjectDashboard from '@/components/project/ProjectDashboard';
import { dashboardForCategory } from '@/lib/categoryDashboards';
import HariKontrakRow from '@/components/project/HariKontrakRow';
import { fRpShort } from '@/components/PanelCharts';
import { formatStampTime, formatStampActor, type ProjectSection, type SectionStamp, type SectionUpdates } from '@/lib/projectSections';

// Leaflet butuh browser (window) -> muat hanya di klien.
const FootprintEditor = dynamic(() => import('@/components/FootprintEditor'), {
    ssr: false,
    loading: () => (
        <div className="h-[360px] rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" aria-label="Memuat peta" />
    ),
});

// Menu halaman = 5 tab yang sama dengan panel peta + Laporan Bulanan (menu sendiri).
type Tab = 'ikhtiar' | 'finansial' | 'operasi' | 'changemgmt' | 'qhsse' | 'laporan';
// Sub-tampilan (pil di atas isi tab): tiap sub-tampilan tetap setinggi layar tanpa scroll di desktop.
type RingkasanView = 'dashboard' | 'info' | 'progres' | 'cctv';
type FinansialView = 'keuangan' | 'kontrak';
// Panel geser "Kelola Data": berkas dan pengaturan yang tidak ada di panel peta.
type KelolaView = 'galeri' | 'dokumen' | 'lokasi' | 'pic';
/** Tujuan navigasi: tab, tab:sub-tampilan, atau kelola:bagian. */
type Dest = Tab | 'ikhtiar:info' | 'ikhtiar:progres' | 'ikhtiar:cctv' | 'finansial:kontrak' | `kelola:${KelolaView}`;

/** Nilai ?tab= di URL (dipakai tombol Detail di panel peta). */
const TAB_QUERY: Record<string, Tab> = {
    ringkasan: 'ikhtiar', finansial: 'finansial', operasi: 'operasi', change: 'changemgmt', qhsse: 'qhsse', laporan: 'laporan',
};
function initialTabFromUrl(): Tab {
    if (typeof window === 'undefined') return 'ikhtiar';
    return TAB_QUERY[new URLSearchParams(window.location.search).get('tab') ?? ''] ?? 'ikhtiar';
}

const RINGKASAN_VIEWS: { id: RingkasanView; label: string; icon: typeof Info }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'info', label: 'Informasi', icon: Info },
    { id: 'progres', label: 'Progres Fisik', icon: TrendingUp },
    { id: 'cctv', label: 'CCTV', icon: Video },
];
const FINANSIAL_VIEWS: { id: FinansialView; label: string; icon: typeof Info }[] = [
    { id: 'keuangan', label: 'Keuangan', icon: Wallet },
    { id: 'kontrak', label: 'Kontrak', icon: FileText },
];

interface DocumentItem { name: string; key?: string; size?: number; contentType?: string; uploadedAt: string; url?: string | null; }
interface GalleryItem { key: string; caption?: string; uploadedAt: string; url: string | null; }
interface Milestone { title: string; done: boolean; date?: string; progress?: number; }
interface HasilUsaha { pendapatan: number; biaya: number; laba: number; }
interface ProgressKeuangan { tahun: number; rencana: number; realisasi: number; }
interface SumberDaya { namaAlat: string; jumlah: number; kategori?: string; satuan?: string; }
type ChangeJenis = 'PERUBAHAN_HARGA' | 'PERUBAHAN_LINGKUP' | 'KLAIM' | 'LEGAL_ISSUE' | 'LAINNYA';
interface ChangeManagement { judul: string; jenis?: ChangeJenis; deskripsi?: string; dampak?: string; mitigasi?: string; nilai?: number; tanggal?: string; target?: string; pic?: string; status: 'USULAN' | 'DISETUJUI' | 'DITOLAK'; }
interface MonitoringPengadaan { nama: string; persentase: number; }
interface ProgressMinggu {
    bulan: string; tahun: number;
    w1Ra: number; w1Ri: number;
    w2Ra: number; w2Ri: number;
    w3Ra: number; w3Ri: number;
    w4Ra: number; w4Ri: number;
}

const CHANGE_JENIS_OPTIONS: { value: ChangeJenis; label: string }[] = [
    { value: 'PERUBAHAN_HARGA', label: 'Perubahan Harga' },
    { value: 'PERUBAHAN_LINGKUP', label: 'Perubahan Lingkup' },
    { value: 'KLAIM', label: 'Klaim' },
    { value: 'LEGAL_ISSUE', label: 'Legal Issue' },
    { value: 'LAINNYA', label: 'Lain-lain' },
];

interface Project {
    _id: string;
    name: string;
    category: string;
    description?: string;
    lat: number;
    lng: number;
    footprint?: FootprintPoint[];
    footprintHeight?: number;
    pmName?: string;
    pmPhone?: string;
    // Hierarki organisasi
    division?: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';
    projectType?: 'JO' | 'NON_JO';
    // Identitas
    penggunaJasa?: string;
    pengawas?: string;
    penyediaJasa?: string;
    // Ikhtiar
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
    hasilUsaha?: HasilUsaha;
    // Operasi (ringkas)
    pu?: number;
    bk?: number;
    lk?: number;
    // Status & kontrak
    status?: 'planning' | 'ongoing' | 'completed';
    contractor?: string;
    startDate?: string;
    endDate?: string;
    contractNumber?: string;
    contractValue?: number;
    // Progress fisik
    progressPercent?: number;
    progressRencana?: number;
    progressDeviasi?: number;
    progressPeriode?: string;
    // Progress keuangan
    progressKeuangan?: ProgressKeuangan[];
    tagihanBelumDiproses?: number;
    // Operasional
    lingkupPekerjaan?: string[];
    sumberDaya?: SumberDaya[];
    monitoringPengadaan?: MonitoringPengadaan[];
    qhsse?: QhsseData;
    // Field pelengkap dashboard "model RRB" (hanya kategori ber-dashboard; diisi di tab Finansial).
    program?: { mcCair?: number; mcCairLabel?: string; cutOffLabel?: string };
    changeManagement?: ChangeManagement[];
    laporanBulanan?: LaporanBulanan[];
    rencanaKurvaS?: RencanaKurvaS[];
    cashInAwal?: number;
    cashOutAwal?: number;
    milestones?: Milestone[];
    gallery?: GalleryItem[];
    documents?: DocumentItem[];
    cameras?: { _id: string; name: string; status: string }[];
    progressMinggu?: ProgressMinggu[];
    // Kontrol akses (dihitung server) — gating kosmetik; server tetap penegak.
    access?: { canEdit: boolean; isSuperAdmin: boolean; isPic: boolean };
    // Waktu & pelaku pembaruan terakhir per dimensi data
    sectionUpdates?: SectionUpdates;
    // Timestamp (dikirim sebagai JSON string dari API)
    createdAt?: string;
    updatedAt?: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
    planning: { label: 'Perencanaan', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    ongoing: { label: 'Berjalan', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
    completed: { label: 'Selesai', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

interface TabItem { id: Tab; label: string; icon: typeof Info }
interface TabGroup { group: string; items: TabItem[] }

const TAB_GROUPS: TabGroup[] = [
    { group: 'Ringkasan', items: [{ id: 'ikhtiar', label: 'Ringkasan', icon: Target }] },
    { group: 'Finansial', items: [{ id: 'finansial', label: 'Finansial', icon: Wallet }] },
    { group: 'Operasi', items: [{ id: 'operasi', label: 'Operasi', icon: Layers }] },
    { group: 'Change', items: [{ id: 'changemgmt', label: 'Change', icon: GitBranch }] },
    { group: 'QHSSE', items: [{ id: 'qhsse', label: 'QHSSE', icon: ShieldCheck }] },
    { group: 'Laporan', items: [{ id: 'laporan', label: 'Laporan Bulanan', icon: CalendarDays }] },
];

// Phone: simpan tinggi header sticky ke --ph-h (dipakai bar Simpan yang menempel di bawahnya).
// Fungsi tingkat modul agar identitas ref stabil (tidak re-observe tiap render).
function trackHeaderHeight(el: HTMLElement | null) {
    const root = el?.parentElement;
    if (!el || !root) return;
    const set = () => root.style.setProperty('--ph-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
}

// Phone (< sm): strip tab horizontal di dalam header sticky. Desktop/tablet tetap sidebar/drawer.
function PhoneTabStrip({ tab, onSelect, tabs }: { tab: Tab; onSelect: (t: Tab) => void; tabs: TabItem[] }) {
    const listRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useReducedMotion();
    // Tab aktif selalu terlihat, juga saat berpindah lewat tombol lain (mis. "Buka Laporan Bulanan").
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
        el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }, [tab, reduceMotion]);
    return (
        <nav aria-label="Bagian proyek" className="sm:hidden border-t border-black/5 dark:border-white/5">
            <div ref={listRef} className="flex gap-1.5 overflow-x-auto overscroll-x-contain snap-x px-4 py-2 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => onSelect(t.id)}
                            aria-current={active ? 'page' : undefined}
                            className={`snap-start shrink-0 min-h-11 inline-flex items-center gap-2 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
                                active
                                    ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text border-[rgba(var(--div-accent-rgb),0.3)]'
                                    : 'text-slate-600 dark:text-slate-400 border-transparent bg-black/[0.03] dark:bg-white/5'
                            }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {t.label}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

function formatIDR(v?: number) {
    if (v == null) return '-';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
}
/** Angka dari input form; '' atau '-' saja = kosong (null). */
function numOrNull(v: string): number | null {
    const t = (v ?? '').trim();
    return t === '' || t === '-' ? null : Number(t);
}
function formatIDRShort(v?: number): string {
    if (v == null) return '-';
    if (v < 0) return `-${formatIDRShort(-v)}`;
    if (v >= 1_000_000_000_000) return `Rp ${(v / 1_000_000_000_000).toFixed(2)} T`;
    if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)} M`;
    if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} Jt`;
    return formatIDR(v);
}
function formatDate(d?: string) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Kerangka pemuatan: menjaga tata letak stabil (tanpa lompatan) saat data masuk.
function ProjectSkeleton() {
    const bar = "rounded-xl bg-black/[0.06] dark:bg-white/[0.07] animate-pulse";
    return (
        <div className="min-h-dvh bg-slate-100 dark:bg-slate-950" role="status" aria-live="polite" aria-label="Memuat detail proyek">
            <div className="border-b border-black/5 dark:border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-3">
                    <div className={`${bar} w-11 h-11`} />
                    <div className="flex-1 space-y-2">
                        <div className={`${bar} h-6 w-2/3 max-w-md`} />
                        <div className={`${bar} h-4 w-1/2 max-w-xs`} />
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex gap-6">
                <div className={`${bar} hidden lg:block w-60 h-96 shrink-0`} />
                <div className="flex-1 min-w-0 space-y-4">
                    <div className={`${bar} h-32`} />
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${bar} h-24`} />)}
                    </div>
                    <div className={`${bar} h-64`} />
                </div>
            </div>
            <span className="sr-only">Memuat detail proyek...</span>
        </div>
    );
}

// Pesan error simpan yang informatif: bedakan sesi habis, tidak berhak, dan
// kesalahan isian (pesan validasi dari server aman — sudah disusun di API).
function saveErrorMessage(err: unknown): string {
    if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const serverMsg = err.response?.data?.error;
        if (status === 401) return 'Sesi berakhir. Silakan masuk kembali, lalu simpan ulang.';
        if (status === 403) return 'Anda tidak memiliki hak mengubah proyek ini.';
        if (status === 400 && typeof serverMsg === 'string') return `Data belum valid: ${serverMsg}`;
        if (!err.response) return 'Tidak dapat terhubung ke server. Periksa koneksi Anda.';
    }
    return 'Gagal menyimpan. Silakan coba lagi.';
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>(initialTabFromUrl);
    const [ringkasanView, setRingkasanView] = useState<RingkasanView>('dashboard');
    const [finansialView, setFinansialView] = useState<FinansialView>('keuangan');
    const [kelola, setKelola] = useState<KelolaView | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [loadError, setLoadError] = useState<{ status: number | null; message: string } | null>(null);

    const fetchProject = useCallback(async () => {
        try {
            const res = await axios.get(`/api/projects/${id}`);
            if (res.data.success) {
                setProject(res.data.data);
                setLoadError(null);
            }
        } catch (err) {
            const status = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
            let message = 'Terjadi gangguan saat memuat detail proyek. Silakan coba lagi.';
            if (status === 401) message = 'Sesi Anda berakhir. Silakan masuk kembali.';
            else if (status === 403) message = 'Detail proyek hanya dapat dibuka dengan login SSO.';
            else if (status === 404) message = 'Proyek tidak ditemukan.';
            setLoadError({ status, message });
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchProject(); }, [fetchProject]);

    // Drawer menu mobile: tutup dengan Esc, dan fokus pindah ke tombol tutup saat dibuka.
    const drawerCloseRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!sidebarOpen) return;
        drawerCloseRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [sidebarOpen]);

    if (loading) {
        return <ProjectSkeleton />;
    }
    if (!project) {
        return (
            <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center gap-4 px-6 text-center text-slate-500 dark:text-slate-400">
                <p className="text-lg font-bold text-balance max-w-md">{loadError?.message ?? 'Proyek tidak ditemukan.'}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => router.back()} className="px-5 py-2.5 bg-black/[0.04] dark:bg-white/5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-sm font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">Kembali</button>
                    {loadError?.status === 401 && (
                        <button onClick={() => router.push('/login')} className="px-5 py-2.5 div-accent-solid hover:brightness-110 text-slate-950 rounded-xl transition-colors text-sm font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">Masuk</button>
                    )}
                    {loadError && loadError.status !== 401 && loadError.status !== 403 && loadError.status !== 404 && (
                        <button onClick={() => { setLoading(true); fetchProject(); }} className="px-5 py-2.5 div-accent-solid hover:brightness-110 text-slate-950 rounded-xl transition-colors text-sm font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">Coba lagi</button>
                    )}
                </div>
            </div>
        );
    }

    const status = STATUS_META[project.status || 'ongoing'] || STATUS_META.ongoing;
    const onlineCams = (project.cameras || []).filter(c => c.status === 'online').length;

    const tabGroups = TAB_GROUPS;
    const allTabs = tabGroups.flatMap(g => g.items);
    const activeLabel = allTabs.find(t => t.id === tab)?.label ?? '';

    // Kemampuan edit berbasis akses nyata (super-admin atau PIC) — dari server.
    const canEdit = project.access?.canEdit ?? false;
    const isSuperAdmin = project.access?.isSuperAdmin ?? false;

    const selectTab = (d: Dest) => {
        setSidebarOpen(false);
        if (d.startsWith('kelola:')) { setKelola(d.slice('kelola:'.length) as KelolaView); return; }
        const [t, sub] = d.split(':') as [Tab, string | undefined];
        setTab(t);
        if (t === 'ikhtiar') setRingkasanView((sub as RingkasanView | undefined) ?? 'dashboard');
        if (t === 'finansial') setFinansialView((sub as FinansialView | undefined) ?? 'keuangan');
    };

    // compact = rail ikon di desktop (label muncul saat hover/fokus); false = daftar penuh (drawer mobile).
    const renderNav = (compact: boolean) => (
        <nav className="space-y-3" aria-label="Bagian proyek">
            {tabGroups.map(grp => (
                <div key={grp.group}>
                    <div className={`px-3 mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-600 ${compact ? 'h-4 overflow-hidden whitespace-nowrap opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 transition-opacity' : ''}`}>{grp.group}</div>
                    <div className="space-y-0.5">
                        {grp.items.map(t => {
                            const Icon = t.icon;
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => selectTab(t.id)}
                                    title={t.label}
                                    aria-label={t.label}
                                    aria-current={active ? 'page' : undefined}
                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full max-sm:min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                                        active
                                            ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text border border-[rgba(var(--div-accent-rgb),0.3)]'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                                    <span className={compact ? 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 transition-opacity' : ''}>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );

    const pageStyle = getDivisionCssVars(project.division) as React.CSSProperties;

    return (
        <div style={pageStyle} className="phone-input-16 min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white">
            {/* Grid HUD tipis beraksen divisi (dekorasi, tidak menangkap klik) */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 z-0 opacity-[0.05] dark:opacity-[0.08]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(var(--div-accent-rgb),0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--div-accent-rgb),0.8) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(ellipse 90% 70% at 50% 20%, #000 20%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 20%, #000 20%, transparent 100%)',
                }}
            />

            {/* Header */}
            <header ref={trackHeaderHeight} className={`sticky top-0 ${sidebarOpen ? 'z-[1]' : 'z-30'} bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5`}>
                {/* Garis aksen divisi bercahaya di tepi bawah header */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                    style={{
                        background:
                            'linear-gradient(90deg, transparent, rgba(var(--div-accent-rgb),0.7), transparent)',
                        boxShadow: '0 0 12px rgba(var(--div-accent-rgb),0.45)',
                    }}
                />
                <div className="px-4 sm:px-6 py-3 max-sm:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] max-sm:pb-3 flex items-center gap-3">
                    <button onClick={() => router.back()} aria-label="Kembali" className="p-3 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                    </button>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-3 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                        aria-label="Buka menu proyek"
                        aria-expanded={sidebarOpen}
                    >
                        <Menu className="w-5 h-5" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{project.name}</h1>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${status.color}`}>{status.label}</span>
                            {project.division && <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">{project.division}</span>}
                            {project.projectType && <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{project.projectType === 'JO' ? 'JO' : 'NON-JO'}</span>}
                            <span className="max-sm:hidden text-[11px] text-slate-500 font-medium uppercase tracking-wider">{project.category}</span>
                            {project.updatedAt && (
                                <span className="max-sm:hidden inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    Terakhir diperbarui: {formatStampTime(project.updatedAt)}
                                </span>
                            )}
                        </div>
                    </div>
                    <a
                        href="/Panduan-Input-Detail-Proyek.pdf?v=20261117"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Buka panduan pengisian (PDF)"
                        className="max-sm:hidden p-3 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                    >
                        <BookOpen className="w-5 h-5" aria-hidden="true" />
                    </a>
                    <ThemeToggle />
                    <button
                        onClick={() => setKelola('galeri')}
                        aria-label="Kelola data: galeri, dokumen, lokasi, PIC"
                        title="Kelola data: galeri, dokumen, lokasi, PIC"
                        className="flex items-center gap-2 p-3 sm:px-4 sm:py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-sm font-bold transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                        <FolderOpen className="w-4 h-4" aria-hidden="true" /> <span className="max-sm:hidden">Kelola Data</span>
                    </button>
                    <button
                        onClick={() => {
                            const divisionParam = project.division ? `&division=${encodeURIComponent(project.division)}` : '';
                            router.push(`/map?category=${encodeURIComponent(project.category)}${divisionParam}&project=${encodeURIComponent(project._id)}`);
                        }}
                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text text-sm font-bold hover:bg-[rgba(var(--div-accent-rgb),0.2)] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                        <MapPin className="w-4 h-4" /> Lihat di Peta
                    </button>
                </div>
                <PhoneTabStrip tab={tab} onSelect={selectTab} tabs={allTabs} />
            </header>

            <div className="relative z-[1] w-full px-3 sm:px-4 py-3 flex gap-3">
                {/* Sidebar (desktop) */}
                <aside className="hidden lg:block w-[3.75rem] shrink-0 relative z-20">
                    <div className="group sticky top-[calc(var(--ph-h,5.5rem)+0.75rem)] w-[3.75rem] hover:w-56 has-[:focus-visible]:w-56 transition-[width] duration-200 motion-reduce:transition-none overflow-x-hidden overflow-y-auto max-h-[calc(100dvh-var(--ph-h,5.5rem)-1.5rem)] p-1.5 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-black/5 dark:border-white/10 shadow-sm">
                        {renderNav(true)}
                    </div>
                </aside>

                {/* Sidebar drawer (mobile) */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <>
                            <motion.div
                                className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setSidebarOpen(false)}
                                aria-hidden="true"
                            />
                            <motion.aside
                                role="dialog"
                                aria-modal="true"
                                aria-label="Menu proyek"
                                className="fixed inset-y-0 left-0 z-50 w-72 bg-slate-100 dark:bg-slate-950 border-r border-black/10 dark:border-white/10 p-4 overflow-y-auto overscroll-contain max-sm:pt-[calc(1rem+env(safe-area-inset-top,0px))] max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:hidden"
                                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                                transition={{ type: 'tween', duration: 0.22 }}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">Menu Proyek</span>
                                    <button ref={drawerCloseRef} onClick={() => setSidebarOpen(false)} aria-label="Tutup menu" className="p-3 max-sm:p-3.5 rounded-lg bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><X className="w-4 h-4" aria-hidden="true" /></button>
                                </div>
                                {renderNav(false)}
                                {/* Phone: aksi header yang disembunyikan di layar kecil dipindah ke sini */}
                                <div className="sm:hidden mt-5 pt-4 border-t border-black/10 dark:border-white/10 space-y-2">
                                    <button
                                        onClick={() => {
                                            const divisionParam = project.division ? `&division=${encodeURIComponent(project.division)}` : '';
                                            router.push(`/map?category=${encodeURIComponent(project.category)}${divisionParam}&project=${encodeURIComponent(project._id)}`);
                                        }}
                                        className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-sm font-bold bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    >
                                        <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" /> Lihat di Peta
                                    </button>
                                    <a
                                        href="/Panduan-Input-Detail-Proyek.pdf?v=20261117"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 bg-black/[0.04] dark:bg-white/5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    >
                                        <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" /> Panduan pengisian (PDF)
                                    </a>
                                </div>
                            </motion.aside>
                        </>
                    )}
                </AnimatePresence>

                {/* Content */}
                <main className="flex-1 min-w-0">
                    <div className={tab === 'laporan' ? 'w-full pb-8 pt-1 lg:pb-0 lg:pt-0' : ''}>
                    <div className="mb-4 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest lg:hidden max-sm:hidden">
                        {activeLabel}
                    </div>
                    <AnimatePresence mode="wait">
                        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                            {tab === 'ikhtiar'    && <IkhtiarTab project={project} status={status} onlineCams={onlineCams} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} view={ringkasanView} onView={setRingkasanView} />}
                            {tab === 'finansial'  && (
                                <SubViews label="Bagian Finansial" views={FINANSIAL_VIEWS} active={finansialView} onChange={setFinansialView}>
                                    {finansialView === 'keuangan' && <FinansialTab project={project} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} />}
                                    {finansialView === 'kontrak' && <ContractTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                                </SubViews>
                            )}
                            {tab === 'operasi'    && <OperasiTab project={project} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} />}
                            {tab === 'laporan'    && <LaporanBulananTab projectId={project._id} laporan={project.laporanBulanan ?? []} rencana={project.rencanaKurvaS ?? []} saldoAwal={{ cashInAwal: project.cashInAwal, cashOutAwal: project.cashOutAwal }} contractValue={project.contractValue} onGoContract={() => selectTab('finansial:kontrak')} lastUpdated={project.sectionUpdates?.laporan ?? null} isAdmin={canEdit} onSaved={fetchProject} errorMessage={saveErrorMessage} />}
                            {tab === 'changemgmt' && <ChangeManagementTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                            {tab === 'qhsse'      && <QhsseTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                        </motion.div>
                    </AnimatePresence>
                    </div>
                </main>
            </div>

            <AnimatePresence>
                {kelola && (
                    <KelolaDrawer
                        project={project}
                        view={kelola}
                        onView={setKelola}
                        onClose={() => setKelola(null)}
                        isAdmin={canEdit}
                        isSuperAdmin={isSuperAdmin}
                        onChanged={fetchProject}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Ikhtiar (CPI / SPI) ───────────────────────────────────────────────────────
// Status mengikuti kaidah EVA:
//  CPI < 1 → Over Budget (boros) ; CPI ≥ 1 → Under Budget (efisien)
//  SPI < 1 → Behind Schedule (terlambat) ; SPI ≥ 1 → Ahead Schedule (sesuai/lebih cepat)
function cpiStatus(v?: number) {
    if (v == null) return { label: 'Belum ada data', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
    return v >= 1
        ? { label: 'Under Budget', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
        : { label: 'Over Budget', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
}
function spiStatus(v?: number) {
    if (v == null) return { label: 'Belum ada data', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
    return v >= 1
        ? { label: 'Ahead Schedule', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
        : { label: 'Behind Schedule', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
}

// Catatan untuk field yang diisi otomatis dari Laporan Bulanan (satu sumber kebenaran).
function DerivedNote({ periode, onGo, what, tail = 'Ubah di sana agar tidak perlu mengetik dua kali.' }: { periode?: string; onGo?: () => void; what: string; tail?: string }) {
    return (
        <div role="note" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[rgba(var(--div-accent-rgb),0.08)] border border-[rgba(var(--div-accent-rgb),0.25)] text-xs text-slate-600 dark:text-slate-300">
            <span>
                {what} diisi otomatis dari <span className="font-bold">Laporan Bulanan{periode ? ` (${periodeLabel(periode)})` : ''}</span>. {tail}
            </span>
            {onGo && (
                <button type="button" onClick={onGo} className="px-3 py-2 rounded-lg div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                    Buka Laporan Bulanan
                </button>
            )}
        </div>
    );
}

function IndeksCompact({ title, value, meta }: { title: string; value?: number; meta: { label: string; color: string } }) {
    return (
        <div className="flex-1 min-h-0 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-2 py-2 text-center flex flex-col items-center justify-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{title}</div>
            <div className="text-3xl font-black leading-none text-slate-900 dark:text-white my-1.5">{value != null ? value.toFixed(2) : '—'}</div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
        </div>
    );
}

function IkhtiarTab({ project, status, onlineCams, isAdmin, onSaved, onGoTab, view, onView }: { project: Project; status: { label: string; color: string }; onlineCams: number; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Dest) => void; view: RingkasanView; onView: (v: RingkasanView) => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        cpi: project.cpi?.toString() ?? '',
        spi: project.spi?.toString() ?? '',
    });
    const [saving, setSaving] = useState(false);

    // CPI/SPI diturunkan dari laporan bulanan terbaru bila BCWP/ACWP/BCWS tersedia.
    const latest = latestLaporan(project.laporanBulanan);
    const derived = derivedFromLaporan(project);
    const evm = computeEvm(latest?.evm);
    const cpiLocked = derived.cpi !== undefined;
    const spiLocked = derived.spi !== undefined;
    const anyLocked = cpiLocked || spiLocked;
    const canEditIndeks = isAdmin && !(cpiLocked && spiLocked);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                ...(cpiLocked ? {} : { cpi: numOrNull(form.cpi) }),
                ...(spiLocked ? {} : { spi: numOrNull(form.spi) }),
            });
            toast.success('Ringkasan tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };
    const cancel = () => { setForm({ cpi: project.cpi?.toString() ?? '', spi: project.spi?.toString() ?? '' }); setEditing(false); };

    const field = (key: 'cpi' | 'spi', label: string) => (
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            {label}
            <input
                type="number" min={0} max={5} step="0.01" inputMode="decimal"
                value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-mono outline-none focus-visible:ring-2 focus-visible:ring-[var(--div-accent)]"
            />
        </label>
    );

    const indeks = (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
            <UpdatedStamp stamp={stampOf(project, 'ikhtiar')} className="!mt-0 justify-center" />
            {editing ? (
                <>
                    {cpiLocked ? <IndeksCompact title="CPI" value={project.cpi} meta={cpiStatus(project.cpi)} /> : field('cpi', 'CPI (mis. 1.02)')}
                    {spiLocked ? <IndeksCompact title="SPI" value={project.spi} meta={spiStatus(project.spi)} /> : field('spi', 'SPI (mis. 0.98)')}
                    <div className="flex gap-2">
                        <button type="button" onClick={cancel} className="flex-1 min-h-9 rounded-lg bg-black/[0.04] dark:bg-white/5 text-xs font-bold text-slate-700 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">Batal</button>
                        <button type="button" onClick={save} disabled={saving} className="flex-1 min-h-9 rounded-lg div-accent-solid text-slate-950 text-xs font-bold disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">{saving ? 'Menyimpan…' : 'Simpan'}</button>
                    </div>
                </>
            ) : (
                <>
                    <IndeksCompact title="CPI" value={project.cpi} meta={cpiStatus(project.cpi)} />
                    <IndeksCompact title="SPI" value={project.spi} meta={spiStatus(project.spi)} />
                    {(evm.cv !== undefined || evm.sv !== undefined) && (
                        <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 text-center">
                            CV {fRpShort(evm.cv)} · SV {fRpShort(evm.sv)}
                        </p>
                    )}
                    {anyLocked && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center">
                            Otomatis dari Laporan Bulanan{latest ? ` (${periodeLabel(latest.periode)})` : ''}.
                        </p>
                    )}
                    {canEditIndeks && (
                        <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Ubah
                        </button>
                    )}
                </>
            )}
        </div>
    );

    return (
        <SubViews label="Bagian Ringkasan" views={RINGKASAN_VIEWS} active={view} onChange={onView}>
            {view === 'dashboard' && (
                <ProjectDashboard
                    project={project}
                    status={status}
                    onlineCams={onlineCams}
                    fisikSampai={fisikSampai(project)}
                    completeness={computeCompleteness(project)}
                    canEdit={isAdmin}
                    onGoTab={onGoTab}
                    onGoLaporan={() => onGoTab('laporan')}
                    indeks={indeks}
                    fill
                />
            )}
            {view === 'info' && <InfoTab project={project} isAdmin={isAdmin} onSaved={onSaved} />}
            {view === 'progres' && <ProgressFisikTab project={project} isAdmin={isAdmin} onSaved={onSaved} />}
            {view === 'cctv' && <CctvTab project={project} />}
        </SubViews>
    );
}

// ── Finansial (ringkas) ───────────────────────────────────────────────────────
function MoneyCard({ label, value, icon: Icon, tone }: { label: string; value?: number; icon: typeof Wallet; tone: string }) {
    return (
        <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 min-w-0" title={value != null ? formatIDR(value) : undefined}>
            <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 ${tone}`}><Icon className="w-3.5 h-3.5" /></div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 truncate">{label}</span>
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono truncate">{formatIDRShort(value)}</div>
        </div>
    );
}

function FinansialTab({ project, isAdmin, onSaved, onGoTab }: { project: Project; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Dest) => void }) {
    const [editing, setEditing] = useState(false);
    // MC Cair (+ cut-off) dipakai dashboard "model RRB"; hanya untuk kategori ber-dashboard.
    const hasProgram = !!dashboardForCategory(project.category);
    // Tagihan bruto & hasil usaha diisi otomatis dari Laporan Bulanan terbaru bila tersedia.
    const latestLap = latestLaporan(project.laporanBulanan);
    const derivedLap = derivedFromLaporan(project);
    const tagihanLocked = derivedLap.tagihanBruto !== undefined;
    const huLocked = derivedLap.hasilUsaha !== undefined;
    const cashInLocked = derivedLap.cashIn !== undefined;
    const cashOutLocked = derivedLap.cashOut !== undefined;
    // Posisi keuangan (hutang, BAD, piutang, CCC) diisi di Laporan Bulanan; tab ini hanya menampilkan.
    const hutangLocked = derivedLap.saldoHutang !== undefined;
    const badLocked = derivedLap.bad !== undefined;
    const piutangLocked = derivedLap.piutang !== undefined;
    const cccLocked = derivedLap.ccc !== undefined;
    const posisiLocked = hutangLocked || badLocked || piutangLocked || cccLocked;
    const initForm = () => ({
        tagihanBruto: project.tagihanBruto?.toString() ?? '',
        cashIn: project.cashIn?.toString() ?? '',
        cashOut: project.cashOut?.toString() ?? '',
        saldoKas: project.saldoKas?.toString() ?? '',
        saldoHutang: project.saldoHutang?.toString() ?? '',
        bad: project.bad?.toString() ?? '',
        piutang: project.piutang?.toString() ?? '',
        ccc: project.ccc?.toString() ?? '',
        huPendapatan: project.hasilUsaha?.pendapatan?.toString() ?? '',
        huBiaya: project.hasilUsaha?.biaya?.toString() ?? '',
        progressKeuangan: (project.progressKeuangan ?? []) as ProgressKeuangan[],
        tagihanBelumDiproses: project.tagihanBelumDiproses?.toString() ?? '',
        mcCair: project.program?.mcCair?.toString() ?? '',
        mcCairLabel: project.program?.mcCairLabel ?? '',
        cutOffLabel: project.program?.cutOffLabel ?? '',
    });
    const [form, setForm] = useState(initForm);
    const [saving, setSaving] = useState(false);

    const resetForm = () => setForm(initForm());

    // Saldo kas selalu diisi manual (tidak dihitung dari cash in/out).
    const displaySaldoKas = project.saldoKas;
    const displayTagihanBruto = project.tagihanBruto;

    const save = async () => {
        setSaving(true);
        try {
            const huP = numOrNull(form.huPendapatan);
            const huB = numOrNull(form.huBiaya);
            await axios.patch(`/api/projects/${project._id}`, {
                ...(tagihanLocked ? {} : { tagihanBruto: numOrNull(form.tagihanBruto) }),
                ...(cashInLocked ? {} : { cashIn: numOrNull(form.cashIn) }),
                ...(cashOutLocked ? {} : { cashOut: numOrNull(form.cashOut) }),
                saldoKas: numOrNull(form.saldoKas),
                ...(hutangLocked ? {} : { saldoHutang: numOrNull(form.saldoHutang) }),
                ...(badLocked ? {} : { bad: numOrNull(form.bad) }),
                ...(piutangLocked ? {} : { piutang: numOrNull(form.piutang) }),
                ...(cccLocked ? {} : { ccc: numOrNull(form.ccc) }),
                ...(huLocked ? {} : {
                    hasilUsaha: (huP != null || huB != null)
                        ? { pendapatan: huP ?? 0, biaya: huB ?? 0, laba: (huP ?? 0) - (huB ?? 0) }
                        : null,
                }),
                progressKeuangan: form.progressKeuangan,
                tagihanBelumDiproses: numOrNull(form.tagihanBelumDiproses),
                ...(hasProgram ? {
                    program: {
                        mcCair: numOrNull(form.mcCair) ?? undefined,
                        mcCairLabel: form.mcCairLabel,
                        cutOffLabel: form.cutOffLabel,
                    },
                } : {}),
            });
            toast.success('Finansial tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <TabShell header={
            <SectionHeader title="Finansial" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { resetForm(); setEditing(false); }} onSave={save} saving={saving} stamp={stampOf(project, 'finansial')} />
        } scroll={false}>
            <div className="lg:h-full flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
                <div className="lg:col-span-8 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 space-y-3">
            {(tagihanLocked || huLocked || cashInLocked || cashOutLocked || posisiLocked) && (
                <DerivedNote
                    what={[tagihanLocked && 'Tagihan bruto', huLocked && 'hasil usaha', (cashInLocked || cashOutLocked) && 'cash in/out', posisiLocked && 'saldo hutang, BAD, piutang, CCC'].filter(Boolean).join(', ')}
                    periode={latestLap?.periode}
                    tail="Tidak diisi di tab ini. Saldo Kas tetap diisi manual di sini (tombol Edit). Hutang, BAD, piutang, dan CCC tetap tampil di bawah; sisanya di Ringkasan."
                    onGo={isAdmin ? () => onGoTab('laporan') : undefined}
                />
            )}
            {!editing ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {!tagihanLocked && <MoneyCard label="Tagihan Bruto"          value={displayTagihanBruto} icon={Receipt}            tone="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" />}
                        {!cashInLocked && <MoneyCard label="Cash In (Penerimaan)"   value={project.cashIn}      icon={ArrowDownRight}     tone="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" />}
                        {!cashOutLocked && <MoneyCard label="Cash Out (Pengeluaran)" value={project.cashOut}     icon={ArrowUpRight}       tone="bg-rose-500/10 border-rose-500/20 text-rose-400" />}
                        <MoneyCard label="Saldo Kas (Cash Balance)" value={displaySaldoKas}   icon={Wallet}             tone="bg-sky-500/10 border-sky-500/20 text-sky-400" />
                        <MoneyCard label="Saldo Hutang"           value={project.saldoHutang} icon={CircleDollarSign}   tone="bg-amber-500/10 border-amber-500/20 text-amber-400" />
                        <MoneyCard label="BAD (komponen hutang)"  value={project.bad}         icon={CircleDollarSign}   tone="bg-orange-500/10 border-orange-500/20 text-orange-400" />
                        <MoneyCard label="Piutang"                value={project.piutang}     icon={CircleDollarSign}   tone="bg-violet-500/10 border-violet-500/20 text-violet-400" />
                    </div>
                    {project.ccc != null && (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex items-center justify-between">
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 dark:text-slate-400">CCC — Cash Conversion Cycle</div>
                                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">{project.ccc} hari</div>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${project.ccc > 90 ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'}`}>
                                {project.ccc > 90 ? '> 90 · Perhatian' : 'Normal'}
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-2">
                    {!tagihanLocked && <MoneyInput label="Tagihan Bruto" value={form.tagihanBruto} onChange={v => setForm({ ...form, tagihanBruto: v })} hint="Total tagihan bruto proyek (Rp)." />}
                    {!cashInLocked && <MoneyInput label="Cash In" value={form.cashIn} onChange={v => setForm({ ...form, cashIn: v })} hint="Total uang yang sudah masuk/diterima proyek." />}
                    {!cashOutLocked && <MoneyInput label="Cash Out" value={form.cashOut} onChange={v => setForm({ ...form, cashOut: v })} hint="Total uang yang sudah keluar/dibelanjakan." />}
                    {/* Saldo kas selalu diisi manual, juga saat cash in/out berasal dari Laporan Bulanan. */}
                    <MoneyInput label="Saldo Kas (Cash Balance)" value={form.saldoKas} onChange={v => setForm({ ...form, saldoKas: v })} hint="Sisa kas proyek saat ini (Rp). Diisi manual; boleh negatif (ketik '-' atau tekan tombol ± minus)." />
                    {!hutangLocked && <MoneyInput label="Saldo Hutang" value={form.saldoHutang} onChange={v => setForm({ ...form, saldoHutang: v })} hint="Total hutang proyek saat ini." />}
                    {!badLocked && <MoneyInput label="BAD" value={form.bad} onChange={v => setForm({ ...form, bad: v })} hint="Beban yang Akan Dibayar — bagian dari hutang (lihat laporan cashflow)." />}
                    {!piutangLocked && <MoneyInput label="Piutang" value={form.piutang} onChange={v => setForm({ ...form, piutang: v })} hint="Uang yang masih ditunggu/belum dibayar ke proyek." />}
                    {!cccLocked && <div>
                        <Input label="CCC (hari)" type="number" min={-3650} max={3650} step={1} value={form.ccc} onChange={v => setForm({ ...form, ccc: v })} hint="Cash Conversion Cycle — lama perputaran kas dalam hari. Di atas 90 hari ditandai merah." />
                        <p className="mt-1.5 text-[11px] text-slate-500">&gt; 90 hari ditandai perhatian (merah).</p>
                    </div>}
                </div>
            )}

            {/* Hasil Usaha (disembunyikan bila berasal dari Laporan Bulanan: sudah tampil di Ringkasan) */}
            {!editing ? (
                (!huLocked && project.hasilUsaha && (project.hasilUsaha.pendapatan || project.hasilUsaha.biaya)) ? (() => {
                    const { pendapatan, biaya, laba } = project.hasilUsaha!;
                    const margin = pendapatan > 0 ? (laba / pendapatan) * 100 : 0;
                    const rugi = laba < 0;
                    return (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hasil Usaha (s.d periode)</h3>
                                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${rugi ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                    Margin {margin.toFixed(2)}%
                                </span>
                            </div>
                            <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pendapatan</div>
                                    <div className="text-sm font-black text-sky-400 font-mono mt-1">{formatIDRShort(pendapatan)}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Biaya (HPP)</div>
                                    <div className="text-sm font-black text-rose-400 font-mono mt-1">{formatIDRShort(biaya)}</div>
                                </div>
                                <div className={`p-3 rounded-xl text-center border ${rugi ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{rugi ? 'Rugi' : 'Laba'}</div>
                                    <div className={`text-sm font-black font-mono mt-1 ${rugi ? 'text-rose-400' : 'text-emerald-400'}`}>{formatIDRShort(laba)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })() : null
            ) : huLocked ? null : (
                <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hasil Usaha</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <MoneyInput label="Pendapatan Usaha" value={form.huPendapatan} onChange={v => setForm({ ...form, huPendapatan: v })} hint="Total pendapatan proyek sampai periode ini." />
                        <MoneyInput label="Biaya / HPP" value={form.huBiaya} onChange={v => setForm({ ...form, huBiaya: v })} hint="Harga Pokok Penjualan — total biaya untuk menghasilkan pendapatan." />
                    </div>
                    <p className="text-[11px] text-slate-500">Laba dihitung otomatis: {formatIDR((Number(form.huPendapatan) || 0) - (Number(form.huBiaya) || 0))}</p>
                </div>
            )}

                </div>
                <div className="lg:col-span-4 min-w-0 lg:min-h-0 flex flex-col">
            {/* Progress keuangan per DIPA */}
            {!editing ? (
                <div className="lg:flex-1 lg:min-h-0 flex flex-col gap-3">
                    <ProgressKeuanganCard
                        progressKeuangan={project.progressKeuangan || []}
                        tagihanBelumDiproses={project.tagihanBelumDiproses}
                    />
                    {hasProgram && (
                        <div className="shrink-0 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">MC Cair (Dashboard {dashboardForCategory(project.category)?.label})</div>
                            <div className="grid grid-cols-2 gap-3">
                                <MiniField label="MC Cair" value={formatIDR(project.program?.mcCair)} />
                                <MiniField label="Keterangan" value={project.program?.mcCairLabel || '-'} />
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">DIPA tersedia di dashboard diambil dari total Pagu/Rencana di atas — tak perlu diisi lagi.</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex flex-col gap-2 lg:flex-1 lg:min-h-0">
                    <div className="flex items-center justify-between shrink-0">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Progress Keuangan (DIPA)</h3>
                        <button onClick={() => setForm(f => ({ ...f, progressKeuangan: [...f.progressKeuangan, { tahun: new Date().getFullYear(), rencana: 0, realisasi: 0 }] }))}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                            <Plus className="w-3.5 h-3.5" /> Tambah Tahun
                        </button>
                    </div>
                    <Paged
                        items={form.progressKeuangan}
                        itemH={305}
                        empty={<p className="text-sm text-slate-600 dark:text-slate-400 italic">Belum ada data DIPA.</p>}
                        render={(pk, i) => (
                            <div className="p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
                                <div className="flex items-end gap-2">
                                    <div className="flex-1">
                                        <Input label="Tahun" type="number" min={2000} max={2100} step={1} value={String(pk.tahun ?? '')} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], tahun: Number(v) }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                                    </div>
                                    <button type="button" aria-label={`Hapus data tahun ${pk.tahun}`} onClick={() => setForm(f => ({ ...f, progressKeuangan: f.progressKeuangan.filter((_, j) => j !== i) }))} className="shrink-0 min-h-10 inline-flex items-center gap-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                        <Minus className="w-4 h-4" aria-hidden="true" /> Hapus
                                    </button>
                                </div>
                                <MoneyInput label="Pagu/Rencana" value={pk.rencana ? String(pk.rencana) : ''} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], rencana: Number(v) || 0 }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                                <MoneyInput label="Realisasi" value={pk.realisasi ? String(pk.realisasi) : ''} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], realisasi: Number(v) || 0 }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                            </div>
                        )}
                    />
                    <div className="shrink-0">
                        <MoneyInput label="Progress Belum Ditagihkan" value={form.tagihanBelumDiproses} onChange={v => setForm(f => ({ ...f, tagihanBelumDiproses: v }))} />
                    </div>
                    {hasProgram && (
                        <div className="shrink-0 pt-2 border-t border-black/5 dark:border-white/5 space-y-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">MC Cair (Dashboard Program)</div>
                            <MoneyInput label="MC Cair" value={form.mcCair} onChange={v => setForm(f => ({ ...f, mcCair: v }))} />
                            <Input label="Keterangan MC Cair" value={form.mcCairLabel} onChange={v => setForm(f => ({ ...f, mcCairLabel: v }))} />
                            <Input label="Keterangan Cut-off" value={form.cutOffLabel} onChange={v => setForm(f => ({ ...f, cutOffLabel: v }))} />
                        </div>
                    )}
                </div>
            )}
                </div>
            </div>
        </TabShell>
    );
}

// Kunci bulan 'YYYY-MM' dari baris progress mingguan ('Oktober 2026' + tahun, atau 'Oktober' + tahun).
function mingguRowKey(row: { bulan?: string; tahun?: number }): string | undefined {
    const name = (row.bulan || '').toLowerCase();
    const m = BULAN_NAMA.findIndex(n => name.includes(n.toLowerCase()));
    const y = Number(row.tahun) || Number((row.bulan || '').match(/\b(20\d{2})\b/)?.[1]);
    return m >= 0 && y ? `${y}-${String(m + 1).padStart(2, '0')}` : undefined;
}
// Posisi progress terbaru: baris bulan paling akhir, minggu terakhir yang realisasinya terisi (cadangan: rencananya).
function mingguLatest(list: ProgressMinggu[]): { key?: string; bulan: string; week: number; ra: number; ri: number } | undefined {
    const sorted = [...list].sort((a, b) => (mingguRowKey(b) ?? '').localeCompare(mingguRowKey(a) ?? ''));
    const row = sorted[0] as unknown as Record<string, number | string> | undefined;
    if (!row) return undefined;
    const val = (w: number, t: 'Ra' | 'Ri') => Number(row[`w${w}${t}`]) || 0;
    let week = 0;
    for (let w = 4; w >= 1 && !week; w--) if (val(w, 'Ri') > 0) week = w;
    for (let w = 4; w >= 1 && !week; w--) if (val(w, 'Ra') > 0) week = w;
    if (!week) return undefined;
    const key = mingguRowKey(row as unknown as ProgressMinggu);
    return { key, bulan: key ? periodeLabel(key) : String(row.bulan ?? ''), week, ra: val(week, 'Ra'), ri: val(week, 'Ri') };
}
// Nilai RA/RI yang sudah tersimpan untuk bulan + minggu tertentu (minggu 0..3), untuk mengisi form.
function mingguPrefill(list: ProgressMinggu[], bulan: string, minggu: number): { ra: string; ri: string } {
    const row = list.find(r => mingguRowKey(r) === bulan) as unknown as Record<string, number> | undefined;
    const ra = row?.[`w${minggu + 1}Ra`];
    const ri = row?.[`w${minggu + 1}Ri`];
    return { ra: ra ? String(ra) : '', ri: ri ? String(ri) : '' };
}

// ── Operasi (Kinerja Operasi + Progress Mingguan W1-W4 + Milestone + Sumber Daya) ──────────
function OperasiTab({ project, isAdmin, onSaved, onGoTab }: { project: Project; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Dest) => void }) {
    // PU diisi otomatis dari pendapatan s.d bulan ini (Laporan Bulanan terbaru). BK tetap manual
    // karena dasarnya berbeda dari HPP; LK = PU − BK dihitung server.
    const latestLap = latestLaporan(project.laporanBulanan);
    const puLocked = derivedFromLaporan(project).pu !== undefined;
    // ── State untuk Kinerja Operasi PU/BK/LK ──
    const [editingKinerja, setEditingKinerja] = useState(false);
    const [kinerjaForm, setKinerjaForm] = useState({
        pu: project.pu?.toString() ?? '',
        bk: project.bk?.toString() ?? '',
    });
    const [savingKinerja, setSavingKinerja] = useState(false);

    // ── State untuk Progress Mingguan W1-W4 ──
    const [editingMinggu, setEditingMinggu] = useState(false);
    const [mingguList, setMingguList] = useState<ProgressMinggu[]>(project.progressMinggu ?? []);
    const [savingMinggu, setSavingMinggu] = useState(false);
    // Progress "sampai dengan": PIC cukup mengisi satu posisi (bulan + minggu) berisi RA dan RI kumulatif, bukan tiap bulan.
    const [sdBulan, setSdBulan] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [sdMinggu, setSdMinggu] = useState(() => Math.min(3, Math.floor((new Date().getDate() - 1) / 7)));
    const [sdVal, setSdVal] = useState(() => {
        const d = new Date();
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return mingguPrefill(project.progressMinggu ?? [], key, Math.min(3, Math.floor((d.getDate() - 1) / 7)));
    });
    const changeSdPeriod = (bulan: string, minggu: number) => {
        setSdBulan(bulan);
        setSdMinggu(minggu);
        setSdVal(mingguPrefill(mingguList, bulan, minggu));
    };

    // ── State untuk Milestone (reuse MilestonesTab logic) ──
    const [editingMs, setEditingMs] = useState(false);
    const [msList, setMsList] = useState<Milestone[]>(project.milestones ?? []);
    const [savingMs, setSavingMs] = useState(false);

    // ── State untuk Sumber Daya ──
    const [editingSd, setEditingSd] = useState(false);
    const [sumberDaya, setSumberDaya] = useState<SumberDaya[]>(project.sumberDaya ?? []);
    const [savingSd, setSavingSd] = useState(false);
    const [editingMon, setEditingMon] = useState(false);
    const [monitoring, setMonitoring] = useState<MonitoringPengadaan[]>(project.monitoringPengadaan ?? []);
    const [savingMon, setSavingMon] = useState(false);

    const saveKinerja = async () => {
        setSavingKinerja(true);
        try {
            const puV = numOrNull(kinerjaForm.pu);
            const bkV = numOrNull(kinerjaForm.bk);
            await axios.patch(`/api/projects/${project._id}`, puLocked
                ? { bk: bkV }   // PU dari laporan; server menghitung LK = PU − BK
                : {
                    pu: puV,
                    bk: bkV,
                    lk: (puV != null && bkV != null) ? puV - bkV : null,
                });
            toast.success('Kinerja Operasi tersimpan');
            setEditingKinerja(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingKinerja(false); }
    };

    const saveMingguSd = async () => {
        const ra = Number(sdVal.ra);
        const ri = Number(sdVal.ri);
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(sdBulan)) { toast.error('Pilih bulan progres'); return; }
        if (sdVal.ra === '' || sdVal.ri === '' || !Number.isFinite(ra) || !Number.isFinite(ri) || ra < 0 || ra > 100 || ri < 0 || ri > 100) {
            toast.error('RA dan RI harus berupa angka 0 sampai 100');
            return;
        }
        const [y, m] = sdBulan.split('-').map(Number);
        const n = sdMinggu + 1;
        // Gabungkan ke riwayat: baris bulan yang sama diperbarui hanya pada minggu terpilih,
        // bulan lain dipertahankan (tidak lagi menimpa seluruh array).
        const namaBulan = BULAN_NAMA[m - 1];
        const existing = mingguList.find(r => mingguRowKey(r) === sdBulan);
        const base: Record<string, number | string> = existing
            ? { ...(existing as unknown as Record<string, number | string>) }
            : { bulan: namaBulan, tahun: y, w1Ra: 0, w1Ri: 0, w2Ra: 0, w2Ri: 0, w3Ra: 0, w3Ri: 0, w4Ra: 0, w4Ri: 0 };
        base[`w${n}Ra`] = ra;
        base[`w${n}Ri`] = ri;
        const row = base as unknown as ProgressMinggu;
        const list: ProgressMinggu[] = existing
            ? mingguList.map(r => (mingguRowKey(r) === sdBulan ? row : r))
            : [...mingguList, row];
        setSavingMinggu(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { progressMinggu: list });
            toast.success('Progress mingguan tersimpan');
            setMingguList(list);
            setEditingMinggu(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingMinggu(false); }
    };
    const saveMs = async () => {
        setSavingMs(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { milestones: msList });
            toast.success('Milestone tersimpan');
            setEditingMs(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingMs(false); }
    };

    const saveSd = async () => {
        setSavingSd(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { sumberDaya });
            toast.success('Sumber daya tersimpan');
            setEditingSd(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingSd(false); }
    };

    const saveMonitoring = async () => {
        setSavingMon(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { monitoringPengadaan: monitoring });
            toast.success('Monitoring pengadaan tersimpan');
            setEditingMon(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingMon(false); }
    };

    const progMs = (m: Milestone) => (m.progress != null ? m.progress : (m.done ? 100 : 0));
    const overallMs = msList.length ? msList.reduce((a, m) => a + progMs(m), 0) / msList.length : 0;
    const setProgressMs = (i: number, v: number) => {
        const p = Math.max(0, Math.min(100, Math.round(v)));
        const a = [...msList];
        a[i] = { ...a[i], progress: p, done: p >= 100 };
        setMsList(a);
    };

    const lk = project.lk ?? ((project.pu ?? 0) - (project.bk ?? 0));
    const rugiKinerja = lk < 0;
    const marginKinerja = (project.pu && project.pu > 0) ? (lk / project.pu) * 100 : null;

    // W1-W4 visual chart helper
    const WEEKS = ['W1', 'W2', 'W3', 'W4'] as const;

    const cardBtn = 'px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
    const cellCls = 'w-full mt-1 px-2.5 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--div-accent)]';
    const miniLabel = 'text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold';
    const rowCard = 'p-2.5 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-black/5 dark:border-white/5';
    const cur = mingguLatest(mingguList);

    return (
        <TabShell scroll={false}>
        <div className="flex flex-col gap-3 lg:h-full lg:grid lg:grid-cols-3 lg:grid-rows-2">

            {/* ── 1. KINERJA OPERASI PU / BK / LK ── */}
            <SectionCard className="lg:col-start-1 lg:row-start-1">
                <SectionHeader
                    compact
                    title="Kinerja Operasi"
                    stamp={stampOf(project, 'kinerja')}
                    isAdmin={isAdmin}
                    editing={editingKinerja}
                    onEdit={() => setEditingKinerja(true)}
                    onCancel={() => { setKinerjaForm({ pu: project.pu?.toString() ?? '', bk: project.bk?.toString() ?? '' }); setEditingKinerja(false); }}
                    onSave={saveKinerja}
                    saving={savingKinerja}
                />
                <div className="flex-1 min-h-0 flex flex-col gap-2 lg:overflow-hidden">
                    {puLocked && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400">
                            PU otomatis dari Laporan Bulanan{latestLap ? ` (${periodeLabel(latestLap.periode)})` : ''}.{' '}
                            {isAdmin && <button type="button" onClick={() => onGoTab('laporan')} className="font-bold underline focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none rounded">Buka</button>}
                        </p>
                    )}
                    {!editingKinerja ? (
                        (project.pu != null || project.bk != null || project.lk != null) ? (
                            <>
                                {marginKinerja != null && (
                                    <span className={`self-start text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${rugiKinerja ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'}`}>
                                        Margin LK {marginKinerja.toFixed(1)}%
                                    </span>
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="p-2 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center min-w-0" title={project.pu != null ? formatIDR(project.pu) : undefined}>
                                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">PU</div>
                                        <div className="text-sm font-black text-sky-700 dark:text-sky-400 font-mono truncate">{formatIDRShort(project.pu)}</div>
                                    </div>
                                    <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center min-w-0" title={project.bk != null ? formatIDR(project.bk) : undefined}>
                                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">BK</div>
                                        <div className="text-sm font-black text-rose-700 dark:text-rose-400 font-mono truncate">{formatIDRShort(project.bk)}</div>
                                    </div>
                                    <div className={`p-2 rounded-xl text-center border min-w-0 ${rugiKinerja ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`} title={formatIDR(lk)}>
                                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{rugiKinerja ? 'LK (Rugi)' : 'LK'}</div>
                                        <div className={`text-sm font-black font-mono truncate ${rugiKinerja ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatIDRShort(lk)}</div>
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">PU pendapatan usaha · BK beban konstruksi · LK laba kotor (PU − BK)</p>
                            </>
                        ) : <EmptyState compact text="Belum ada data kinerja operasi." action={isAdmin ? { label: 'Isi sekarang', onClick: () => setEditingKinerja(true) } : undefined} />
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                {puLocked
                                    ? <MoneyCard label="PU (Laporan Bulanan)" value={project.pu} icon={CircleDollarSign} tone="bg-sky-500/10 border-sky-500/20 text-sky-400" />
                                    : <MoneyInput label="PU: Pendapatan" value={kinerjaForm.pu} onChange={v => setKinerjaForm({ ...kinerjaForm, pu: v })} hint="Pendapatan usaha dari sisi operasi proyek (IDR)." />}
                                <MoneyInput label="BK: Beban Konstruksi" value={kinerjaForm.bk} onChange={v => setKinerjaForm({ ...kinerjaForm, bk: v })} hint="Beban/biaya konstruksi operasi (IDR)." />
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">LK otomatis: {formatIDR(((puLocked ? project.pu : Number(kinerjaForm.pu)) || 0) - (Number(kinerjaForm.bk) || 0))}</p>
                        </>
                    )}
                </div>
            </SectionCard>

            {/* ── 2. PROGRESS MINGGUAN W1–W4 RA/RI ── */}
            <SectionCard className="lg:col-start-1 lg:row-start-2">
                <div className="flex items-center justify-between gap-2 mb-2 min-w-0 shrink-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">Progress Mingguan · RA / RI</h3>
                        <UpdatedStamp stamp={stampOf(project, 'mingguan')} />
                    </div>
                    {isAdmin && (editingMinggu ? (
                        <div className="flex gap-2 shrink-0">
                            <button onClick={() => { setMingguList(project.progressMinggu ?? []); setEditingMinggu(false); }} className={cardBtn}><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveMingguSd} disabled={savingMinggu} className="px-2.5 py-1.5 rounded-lg div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                {savingMinggu ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => { setSdVal(mingguPrefill(mingguList, sdBulan, sdMinggu)); setEditingMinggu(true); }} className={`${cardBtn} shrink-0`}><Pencil className="w-3.5 h-3.5" /> Isi progress s.d.</button>
                    ))}
                </div>
                <div className="flex-1 min-h-0 flex flex-col gap-2 lg:overflow-hidden">
                    {editingMinggu ? (
                        <>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">Isi posisi terakhir (sampai dengan). Menyimpan memperbarui minggu yang dipilih; bulan lain tidak berubah.</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label htmlFor="sd-bulan" className={miniLabel}>Progres s.d. bulan</label>
                                    <input id="sd-bulan" type="month" min="2000-01" max="2099-12" value={sdBulan} onChange={e => { if (/^20\d{2}-\d{2}$/.test(e.target.value)) changeSdPeriod(e.target.value, sdMinggu); }} className={cellCls} />
                                </div>
                                <div>
                                    <label htmlFor="sd-minggu" className={miniLabel}>Minggu ke-</label>
                                    <select id="sd-minggu" value={sdMinggu} onChange={e => changeSdPeriod(sdBulan, Number(e.target.value))} className={cellCls}>
                                        {WEEKS.map((w, i) => <option key={w} value={i} className="bg-white dark:bg-slate-900">{w}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="sd-ra" className={miniLabel}>RA, rencana (%)</label>
                                    <input id="sd-ra" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={sdVal.ra} onChange={e => setSdVal(v => ({ ...v, ra: e.target.value }))} className={cellCls} />
                                </div>
                                <div>
                                    <label htmlFor="sd-ri" className={miniLabel}>RI, realisasi (%)</label>
                                    <input id="sd-ri" type="number" inputMode="decimal" min={0} max={100} step={0.01} value={sdVal.ri} onChange={e => setSdVal(v => ({ ...v, ri: e.target.value }))} className={cellCls} />
                                </div>
                            </div>
                            {sdVal.ra !== '' && sdVal.ri !== '' && Number.isFinite(Number(sdVal.ra)) && Number.isFinite(Number(sdVal.ri)) && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] text-slate-600 dark:text-slate-400">Deviasi (RI − RA)</span>
                                    <span className={`text-sm font-bold font-mono ${Number(sdVal.ri) - Number(sdVal.ra) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                        {Number(sdVal.ri) - Number(sdVal.ra) >= 0 ? '+' : ''}{(Number(sdVal.ri) - Number(sdVal.ra)).toFixed(2)}%
                                    </span>
                                </div>
                            )}
                        </>
                    ) : !cur ? (
                        <EmptyState compact text="Belum ada data progress mingguan." action={isAdmin ? { label: 'Isi sekarang', onClick: () => { setSdVal(mingguPrefill(mingguList, sdBulan, sdMinggu)); setEditingMinggu(true); } } : undefined} />
                    ) : (() => {
                        const dev = cur.ri - cur.ra;
                        const bar = (label: string, v: number, cls: string) => (
                            <div>
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300"><span>{label}</span><span className="font-mono">{v.toFixed(2)}%</span></div>
                                <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden mt-1"><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(Math.max(v, 0), 100)}%` }} /></div>
                            </div>
                        );
                        return (
                            <>
                                <div className="text-xs font-bold text-slate-900 dark:text-white">Progress s.d. W{cur.week} <span className="font-mono font-normal text-slate-600 dark:text-slate-400">· {cur.bulan}</span></div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="p-2 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center">
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">RA</div>
                                        <div className="text-sm font-black font-mono text-sky-700 dark:text-sky-400">{cur.ra.toFixed(2)}%</div>
                                    </div>
                                    <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">RI</div>
                                        <div className="text-sm font-black font-mono text-amber-700 dark:text-amber-400">{cur.ri.toFixed(2)}%</div>
                                    </div>
                                    <div className={`p-2 rounded-xl border text-center ${dev >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Deviasi</div>
                                        <div className={`text-sm font-black font-mono ${dev >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{dev >= 0 ? '+' : ''}{dev.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {bar('RA (Rencana)', cur.ra, 'bg-sky-500')}
                                    {bar('RI (Realisasi)', cur.ri, dev >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                                </div>
                            </>
                        );
                    })()}
                </div>
            </SectionCard>

            {/* ── 3. SUMBER DAYA ── */}
            <SectionCard className="lg:col-start-2 lg:row-start-1">
                <SectionHeader compact title="Sumber Daya" isAdmin={isAdmin} editing={editingSd} onEdit={() => setEditingSd(true)} onCancel={() => { setSumberDaya(project.sumberDaya ?? []); setEditingSd(false); }} onSave={saveSd} saving={savingSd} stamp={stampOf(project, 'sumberDaya')} />
                {editingSd && (
                    <button onClick={() => setSumberDaya(s => [...s, { namaAlat: '', jumlah: 0, kategori: '', satuan: 'Unit' }])} className={`${cardBtn} self-start`}>
                        <Plus className="w-3.5 h-3.5" /> Tambah Sumber Daya
                    </button>
                )}
                <Paged
                    items={sumberDaya}
                    itemH={editingSd ? 140 : 80}
                    cols={editingSd ? 1 : 2}
                    empty={<EmptyState compact text="Belum ada data sumber daya." action={isAdmin ? { label: 'Isi sekarang', onClick: () => setEditingSd(true) } : undefined} />}
                    render={(sd, i) => editingSd ? (
                        <div key={i} className={`${rowCard} grid grid-cols-12 gap-2 items-end`}>
                            <div className="col-span-12">
                                <label className={miniLabel}>Nama</label>
                                <input aria-label="Nama sumber daya" placeholder="mis. Excavator, Tukang, Besi Beton" value={sd.namaAlat} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], namaAlat: e.target.value }; setSumberDaya(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-4">
                                <label className={miniLabel}>Kategori</label>
                                <input aria-label="Kategori" list="sd-kategori-op" placeholder="Alat Berat…" value={sd.kategori ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], kategori: e.target.value }; setSumberDaya(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-3">
                                <label className={miniLabel}>Jumlah</label>
                                <input aria-label="Jumlah" type="number" min={0} value={sd.jumlah} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], jumlah: Math.max(0, Number(e.target.value)) }; setSumberDaya(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-3">
                                <label className={miniLabel}>Satuan</label>
                                <input aria-label="Satuan" list="sd-satuan-op" placeholder="Unit" value={sd.satuan ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], satuan: e.target.value }; setSumberDaya(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-2 flex justify-end">
                                <button onClick={() => setSumberDaya(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                            </div>
                        </div>
                    ) : (
                        <div key={i} className={`${rowCard} text-center min-w-0`}>
                            <div className={`text-xl font-black leading-none ${sd.jumlah > 0 ? 'div-accent-text' : 'text-slate-600 dark:text-slate-400'}`}>{sd.jumlah} <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{sd.satuan || 'Unit'}</span></div>
                            <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate mt-1" title={sd.namaAlat}>{sd.namaAlat || '-'}</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">{(sd.kategori || '').trim() || 'Lainnya'}</div>
                        </div>
                    )}
                />
                <datalist id="sd-kategori-op">
                    <option value="Alat Berat" /><option value="Tenaga Kerja" /><option value="Material" /><option value="Kendaraan" /><option value="Peralatan" />
                </datalist>
                <datalist id="sd-satuan-op">
                    <option value="Unit" /><option value="Orang" /><option value="m³" /><option value="Ton" /><option value="Set" /><option value="Buah" />
                </datalist>
            </SectionCard>

            {/* ── 3b. LINGKUP PEKERJAAN ── */}
            <LingkupCard project={project} isAdmin={isAdmin} onSaved={onSaved} className="lg:col-start-2 lg:row-start-2" />

            {/* ── 4. MILESTONE ── */}
            <SectionCard className="lg:col-start-3 lg:row-start-1">
                <SectionHeader compact title="Milestone" isAdmin={isAdmin} editing={editingMs} onEdit={() => setEditingMs(true)} onCancel={() => { setMsList(project.milestones ?? []); setEditingMs(false); }} onSave={saveMs} saving={savingMs} stamp={stampOf(project, 'milestone')} />
                {msList.length > 0 && (
                    <div className="shrink-0 flex items-center gap-2 text-[11px]">
                        <span className="text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Keseluruhan</span>
                        <div className="flex-1 h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-emerald-500" style={{ width: `${overallMs}%` }} />
                        </div>
                        <span className="text-slate-900 dark:text-white font-bold font-mono">{overallMs.toFixed(0)}%</span>
                    </div>
                )}
                {editingMs && (
                    <button onClick={() => setMsList(s => [...s, { title: '', done: false, progress: 0 }])} className={`${cardBtn} self-start`}>
                        <Plus className="w-3.5 h-3.5" /> Tambah Milestone
                    </button>
                )}
                <Paged
                    items={msList}
                    itemH={editingMs ? 100 : 68}
                    empty={<EmptyState compact text="Belum ada milestone." action={isAdmin ? { label: 'Isi sekarang', onClick: () => setEditingMs(true) } : undefined} />}
                    render={(m, i) => editingMs ? (
                        <div key={i} className={`${rowCard} space-y-2`}>
                            <div className="flex gap-2 items-center">
                                <input aria-label="Judul milestone" placeholder="Judul milestone" value={m.title} onChange={e => { const a = [...msList]; a[i] = { ...a[i], title: e.target.value }; setMsList(a); }} className={`${cellCls} !mt-0 flex-1 min-w-0`} />
                                <input aria-label="Tanggal milestone" type="date" value={typeof m.date === 'string' ? m.date.slice(0, 10) : ''} onChange={e => { const a = [...msList]; a[i] = { ...a[i], date: e.target.value }; setMsList(a); }} className={`${cellCls} !mt-0 !w-32 shrink-0 text-xs`} />
                                <button onClick={() => setMsList(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 shrink-0 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                            </div>
                            <div className="flex items-center gap-2">
                                <input aria-label="Progres milestone (slider)" type="range" min={0} max={100} step={1} value={progMs(m)} onChange={e => setProgressMs(i, Number(e.target.value))} className="flex-1 accent-[var(--div-accent)]" />
                                <input aria-label="Progres milestone (persen)" type="number" min={0} max={100} value={progMs(m)} onChange={e => setProgressMs(i, Number(e.target.value))} className="w-14 px-1.5 py-1 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--div-accent)]" />
                                <span className="text-sm font-black div-accent-text">%</span>
                            </div>
                        </div>
                    ) : (() => {
                        const p = progMs(m);
                        const complete = p >= 100;
                        return (
                            <div key={i} className={rowCard}>
                                <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px] font-black ${complete ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-black/10 dark:border-white/10'}`}>
                                        {complete ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate" title={m.title}>{m.title || '-'}</div>
                                        {m.date && <div className="text-[11px] text-slate-600 dark:text-slate-400">{formatDate(typeof m.date === 'string' ? m.date : undefined)}</div>}
                                    </div>
                                    <span className={`text-xs font-black font-mono shrink-0 ${complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-yellow-400'}`}>{p}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden mt-1.5">
                                    <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'}`} style={{ width: `${p}%` }} />
                                </div>
                            </div>
                        );
                    })()}
                />
            </SectionCard>

            {/* ── 5. MONITORING PENGADAAN ── */}
            <SectionCard className="lg:col-start-3 lg:row-start-2">
                <SectionHeader compact title="Monitoring Pengadaan" isAdmin={isAdmin} editing={editingMon} onEdit={() => setEditingMon(true)} onCancel={() => { setMonitoring(project.monitoringPengadaan ?? []); setEditingMon(false); }} onSave={saveMonitoring} saving={savingMon} stamp={stampOf(project, 'monitoring')} />
                <p className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">Progres per item major. Jumlah paket dan pagu keseluruhan diisi di <button type="button" onClick={() => onGoTab('laporan')} className="font-bold underline focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none rounded">Laporan Bulanan</button>.</p>
                {editingMon && (
                    <button onClick={() => setMonitoring(s => [...s, { nama: '', persentase: 0 }])} className={`${cardBtn} self-start`}>
                        <Plus className="w-3.5 h-3.5" /> Tambah Item
                    </button>
                )}
                <Paged
                    items={monitoring}
                    itemH={editingMon ? 66 : 56}
                    empty={<EmptyState compact text="Belum ada data monitoring pengadaan." action={isAdmin ? { label: 'Isi sekarang', onClick: () => setEditingMon(true) } : undefined} />}
                    render={(mp, i) => editingMon ? (
                        <div key={i} className={`${rowCard} grid grid-cols-12 gap-2 items-end`}>
                            <div className="col-span-8">
                                <label className={miniLabel}>Nama Item</label>
                                <input aria-label="Nama item" placeholder="mis. Pengadaan Besi Beton" value={mp.nama} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], nama: e.target.value }; setMonitoring(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-3">
                                <label className={miniLabel}>%</label>
                                <input aria-label="Persentase" type="number" min={0} max={100} value={mp.persentase} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], persentase: Math.max(0, Math.min(100, Number(e.target.value))) }; setMonitoring(a); }} className={cellCls} />
                            </div>
                            <div className="col-span-1 flex justify-end">
                                <button onClick={() => setMonitoring(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                            </div>
                        </div>
                    ) : (() => {
                        const p = Math.max(0, Math.min(100, mp.persentase ?? 0));
                        const done = p >= 100;
                        return (
                            <div key={i} className={rowCard}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 min-w-0 truncate" title={mp.nama}>{mp.nama || '-'}</span>
                                    <span className={`text-xs font-black font-mono shrink-0 ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-yellow-400'}`}>{p}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden mt-1.5">
                                    <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'}`} style={{ width: `${p}%` }} />
                                </div>
                            </div>
                        );
                    })()}
                />
            </SectionCard>
        </div>
        </TabShell>
    );
}

// ── Change Management ─────────────────────────────────────────────────────────
const CM_STATUS: Record<string, { label: string; color: string }> = {
    USULAN:    { label: 'USULAN',    color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    DISETUJUI: { label: 'DISETUJUI', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    DITOLAK:   { label: 'DITOLAK',   color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
};

function ChangeManagementTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [list, setList] = useState<ChangeManagement[]>(project.changeManagement ?? []);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try { await axios.patch(`/api/projects/${project._id}`, { changeManagement: list }); toast.success('Change management tersimpan'); setEditing(false); onSaved(); }
        catch (err) { toast.error(saveErrorMessage(err)); } finally { setSaving(false); }
    };

    const rowLabel = 'text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400';
    const addBtn = 'px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
    const upd = (i: number, patch: Partial<ChangeManagement>) => setList(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

    return (
        <TabShell scroll={false}>
        <SectionCard className="lg:h-full">
            <SectionHeader title="Change Management" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setList(project.changeManagement ?? []); setEditing(false); }} onSave={save} saving={saving} stamp={stampOf(project, 'changeMgmt')} compact />
            <div className="flex items-center justify-between gap-2 shrink-0">
                <p className="text-[11px] text-slate-600 dark:text-slate-400">Daftar perubahan lingkup/kontrak.</p>
                {editing && (
                    <button onClick={() => setList(s => [...s, { judul: '', status: 'USULAN' }])} className={`${addBtn} shrink-0`}>
                        <Plus className="w-3.5 h-3.5" /> Tambah Perubahan
                    </button>
                )}
            </div>
            <Paged
                items={list}
                itemH={editing ? 400 : 226}
                cols={editing ? 1 : 2}
                fixed={!editing}
                empty={<EmptyState compact text="Belum ada change management." action={isAdmin ? { label: 'Isi sekarang', onClick: () => setEditing(true) } : undefined} />}
                render={(cm, i) => editing ? (
                    <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-black/5 dark:border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className={rowLabel}>Perubahan #{i + 1}</span>
                            <button onClick={() => setList(s => s.filter((_, j) => j !== i))} className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none rounded"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
                        </div>
                        <div className="grid lg:grid-cols-2 gap-x-3 gap-y-1">
                            <div className="space-y-1">
                                <Input label="Judul Perubahan" required value={cm.judul} onChange={v => upd(i, { judul: v })} />
                                <div className="grid grid-cols-2 gap-2">
                                    <Select label="Jenis" value={cm.jenis ?? 'LAINNYA'} onChange={v => upd(i, { jenis: v as ChangeJenis })} options={CHANGE_JENIS_OPTIONS.map(o => [o.value, o.label])} />
                                    <Select label="Status" value={cm.status} onChange={v => upd(i, { status: v as ChangeManagement['status'] })} options={[['USULAN', 'USULAN'], ['DISETUJUI', 'DISETUJUI'], ['DITOLAK', 'DITOLAK']]} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Nilai Perubahan (Rp)" type="number" value={cm.nilai?.toString() ?? ''} onChange={v => upd(i, { nilai: v === '' ? undefined : Number(v) })} hint="Boleh negatif untuk pengurangan nilai." />
                                    <Input label="Tanggal" type="date" value={typeof cm.tanggal === 'string' ? cm.tanggal.slice(0, 10) : ''} onChange={v => upd(i, { tanggal: v })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input label="Target Implementasi" value={cm.target ?? ''} onChange={v => upd(i, { target: v })} />
                                    <Input label="Penanggung Jawab" value={cm.pic ?? ''} onChange={v => upd(i, { pic: v })} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Textarea rows={2} label="Deskripsi / Latar Belakang" value={cm.deskripsi ?? ''} onChange={v => upd(i, { deskripsi: v })} />
                                <Textarea rows={2} label="Dampak (biaya / waktu / mutu)" value={cm.dampak ?? ''} onChange={v => upd(i, { dampak: v })} />
                                <Textarea rows={2} label="Mitigasi (langkah penanganan)" value={cm.mitigasi ?? ''} onChange={v => upd(i, { mitigasi: v })} />
                            </div>
                        </div>
                    </div>
                ) : (() => {
                    const st = CM_STATUS[cm.status] ?? CM_STATUS.USULAN;
                    return (
                        <div className="h-full p-3 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-black/5 dark:border-white/5 flex flex-col gap-2 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex gap-2 items-start min-w-0">
                                    <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0 font-black text-[11px]">{i + 1}</div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2" title={cm.judul}>{cm.judul || '-'}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[45%]">
                                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${st.color}`}>{st.label}</span>
                                    <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-slate-600 dark:text-slate-300">
                                        {(CHANGE_JENIS_OPTIONS.find(o => o.value === (cm.jenis ?? 'LAINNYA'))?.label) ?? 'Lain-lain'}
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 min-h-0 overflow-hidden">
                                {cm.deskripsi && <MiniField clamp label="Deskripsi" value={cm.deskripsi} />}
                                {cm.dampak && <MiniField clamp label="Dampak" value={cm.dampak} />}
                                {cm.mitigasi && <MiniField clamp label="Mitigasi" value={cm.mitigasi} />}
                                {cm.nilai != null && <MiniField clamp label="Nilai Perubahan" value={formatIDR(cm.nilai)} />}
                            </div>
                            <p className="mt-auto text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                {[cm.tanggal && formatDate(typeof cm.tanggal === 'string' ? cm.tanggal : undefined), cm.target && `Target: ${cm.target}`, cm.pic && `PJ: ${cm.pic}`].filter(Boolean).join(' · ') || ' '}
                            </p>
                        </div>
                    );
                })()}
            />
        </SectionCard>
        </TabShell>
    );
}
// ── (B) Indikator kelengkapan data proyek ─────────────────────────────────────
// Mendata bagian-bagian penting + apakah sudah terisi. Memandu user mengisi
// tanpa memaksa. "Terisi" = ada nilai yang bermakna.
function computeCompleteness(p: Project) {
    // "Terisi" = ada nilai. Angka 0 SAH (proyek 0% progres, kas 0); yang dianggap kosong
    // hanya null/undefined, string kosong, dan array/objek kosong.
    const has = (v: unknown) => {
        if (v == null) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (typeof v === 'number') return Number.isFinite(v);
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v as object).length > 0;
        return !!v;
    };
    const hasHasilUsaha = (() => {
        const h = p.hasilUsaha as { pendapatan?: number; biaya?: number } | undefined;
        return !!h && (has(h.pendapatan) || has(h.biaya));
    })();
    const finansialFilled = [p.tagihanBruto, p.cashIn, p.cashOut, p.saldoHutang, p.piutang].filter(has).length;
    // progressPercent default 0 di database, jadi 0% hanya dianggap terisi bila PIC pernah
    // menyimpan bulan progres (progressPeriode) atau nilainya sudah > 0.
    const progresFilled = isValidPeriode(p.progressPeriode) || (p.progressPercent ?? 0) > 0;
    const items: { label: string; done: boolean; tab: Dest }[] = [
        { label: 'Identitas (nama PM, no. HP PM, pengguna jasa)', done: has(p.pmName) && has(p.pmPhone) && has(p.penggunaJasa), tab: 'ikhtiar:info' },
        { label: 'Pelaksana & jadwal (penyedia jasa, tanggal)', done: (has(p.penyediaJasa) || has(p.contractor)) && has(p.startDate) && has(p.endDate), tab: 'ikhtiar:info' },
        { label: 'Kontrak (nomor & nilai)', done: has(p.contractNumber) && has(p.contractValue), tab: 'finansial:kontrak' },
        { label: 'Laporan bulanan (bulan ini / bulan lalu)', done: isLaporanFresh(p.laporanBulanan), tab: 'laporan' },
        { label: 'Ringkasan (CPI / SPI)', done: has(p.cpi) && has(p.spi), tab: 'ikhtiar' },
        { label: 'Finansial (cash / hutang / piutang)', done: finansialFilled >= 2, tab: 'finansial' },
        { label: 'Kinerja Operasi (PU / BK / LK)', done: hasHasilUsaha || (has(p.pu) && has(p.bk)), tab: 'operasi' },
        { label: 'Progres fisik', done: progresFilled, tab: 'ikhtiar:progres' },
        { label: 'Milestone', done: has(p.milestones), tab: 'operasi' },
        { label: 'Sumber Daya', done: has(p.sumberDaya), tab: 'operasi' },
        { label: 'Galeri', done: has(p.gallery), tab: 'kelola:galeri' },
    ];
    const doneCount = items.filter(i => i.done).length;
    const percent = Math.round((doneCount / items.length) * 100);
    return { items, doneCount, total: items.length, percent };
}

/** Bulan progres fisik: isian PIC; proyek lama yang belum mengisi memakai bulan laporan terakhir. */
function fisikSampai(p: Project): string | undefined {
    if (isValidPeriode(p.progressPeriode)) return periodeLabel(p.progressPeriode);
    const l = latestLaporan(p.laporanBulanan);
    return l ? periodeLabel(l.periode) : undefined;
}

// ── 2-Column Progress Charts ──────────────────────────────────────────────────
function ProgressFisikCard({ rencana, realisasi, deviasi, sampai, startDate, endDate }: { rencana: number; realisasi: number; deviasi: number; sampai?: string; startDate?: string; endDate?: string }) {
    const isAhead = deviasi >= 0;
    const SIZE = 156;
    const STROKE = 10;
    const R_OUT = SIZE / 2 - STROKE / 2;
    const R_IN  = R_OUT - STROKE - 4;
    const C     = SIZE / 2;
    const cOut  = 2 * Math.PI * R_OUT;
    const cIn   = 2 * Math.PI * R_IN;
    const dReal = (Math.min(realisasi, 100) / 100) * cOut;
    const dRenc = (Math.min(rencana, 100) / 100) * cIn;

    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex flex-col justify-between space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[rgba(var(--div-accent-rgb),0.1)] flex items-center justify-center border border-[rgba(var(--div-accent-rgb),0.2)]">
                        <TrendingUp className="w-3.5 h-3.5 div-accent-text" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Fisik</h3>
                        {sampai && <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">s.d. {sampai}</p>}
                    </div>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isAhead ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}>
                    {isAhead ? '● On Schedule' : '● Deviasi Negatif'}
                </span>
            </div>

            {/* Circular Gauge */}
            <div className="flex flex-col items-center justify-center py-2">
                <div className="relative" style={{ width: SIZE, height: SIZE }}>
                    <div className="absolute inset-0 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
                    <svg width={SIZE} height={SIZE} className="-rotate-90 relative z-10">
                        <defs>
                            <linearGradient id="chartFisikRealisasi" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#f59e0b" />
                                <stop offset="60%" stopColor="#fbbf24" />
                                <stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                            <linearGradient id="chartFisikRencana" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#64748b" />
                            </linearGradient>
                        </defs>
                        {/* Background Tracks */}
                        <circle cx={C} cy={C} r={R_OUT} fill="none" className="stroke-black/10 dark:stroke-white/[0.06]" strokeWidth={STROKE} />
                        <circle cx={C} cy={C} r={R_IN}  fill="none" className="stroke-black/5 dark:stroke-white/[0.03]" strokeWidth={STROKE - 2} />

                        {/* Rencana Inner Ring */}
                        <motion.circle
                            cx={C} cy={C} r={R_IN}
                            fill="none" stroke="url(#chartFisikRencana)" strokeWidth={STROKE - 2} strokeLinecap="round"
                            strokeDasharray={cIn}
                            initial={{ strokeDashoffset: cIn }}
                            animate={{ strokeDashoffset: cIn - dRenc }}
                            transition={{ duration: 1.0, ease: 'easeOut' }}
                        />
                        {/* Realisasi Outer Ring */}
                        <motion.circle
                            cx={C} cy={C} r={R_OUT}
                            fill="none" stroke="url(#chartFisikRealisasi)" strokeWidth={STROKE} strokeLinecap="round"
                            strokeDasharray={cOut}
                            initial={{ strokeDashoffset: cOut }}
                            animate={{ strokeDashoffset: cOut - dReal }}
                            transition={{ duration: 1.3, ease: 'easeOut', delay: 0.1 }}
                            style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.45))' }}
                        />
                    </svg>

                    {/* Center Hub */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Realisasi</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-white leading-none my-0.5">
                            {realisasi.toFixed(2)}<span className="text-sm text-amber-400 font-extrabold">%</span>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[11px] font-bold ${isAhead ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isAhead ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            <span>{isAhead ? '+' : ''}{deviasi.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom 3-Card Metrics */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/5 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rencana</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white font-mono">{rencana.toFixed(2)}%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Realisasi</span>
                    </div>
                    <span className="text-xs font-black text-amber-300 font-mono">{realisasi.toFixed(2)}%</span>
                </div>
                <div className={`p-2.5 rounded-xl border text-center ${
                    isAhead ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                }`}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${isAhead ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deviasi</span>
                    </div>
                    <span className={`text-xs font-black font-mono ${isAhead ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isAhead ? '+' : ''}{deviasi.toFixed(2)}%
                    </span>
                </div>
            </div>

            {/* Hari kontrak: dari tanggal mulai & selesai (Ringkasan › Informasi) */}
            <div className="pt-2 border-t border-black/5 dark:border-white/5">
                <HariKontrakRow startDate={startDate} endDate={endDate} hint />
            </div>
        </div>
    );
}

function ProgressKeuanganCard({
    progressKeuangan,
    tagihanBelumDiproses,
}: {
    progressKeuangan: ProgressKeuangan[];
    tagihanBelumDiproses?: number;
}) {
    const totalRencana = progressKeuangan.reduce((acc, curr) => acc + (curr.rencana || 0), 0);
    const totalRealisasi = progressKeuangan.reduce((acc, curr) => acc + (curr.realisasi || 0), 0);
    const totalPct = totalRencana > 0 ? (totalRealisasi / totalRencana) * 100 : 0;

    const SIZE = 124;
    const STROKE = 10;
    const R = SIZE / 2 - STROKE / 2;
    const C = SIZE / 2;
    const circ = 2 * Math.PI * R;
    const dPct = (Math.min(totalPct, 100) / 100) * circ;

    return (
        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex flex-col gap-2 lg:flex-1 lg:min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                        <CircleDollarSign className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Keuangan</h3>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                    {totalPct.toFixed(1)}% Terserap
                </span>
            </div>

            {/* Donut Chart */}
            <div className="flex flex-col items-center justify-center shrink-0">
                <div className="relative" style={{ width: SIZE, height: SIZE }}>
                    <div className="absolute inset-0 rounded-full bg-sky-500/5 blur-xl pointer-events-none" />
                    <svg width={SIZE} height={SIZE} className="-rotate-90 relative z-10">
                        <defs>
                            <linearGradient id="chartKeuanganRealisasi" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#0284c7" />
                                <stop offset="50%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                        </defs>
                        {/* Background Track (Sisa Anggaran) */}
                        <circle cx={C} cy={C} r={R} fill="none" className="stroke-black/10 dark:stroke-white/[0.06]" strokeWidth={STROKE} />

                        {/* Realisasi Arc */}
                        <motion.circle
                            cx={C} cy={C} r={R}
                            fill="none" stroke="url(#chartKeuanganRealisasi)" strokeWidth={STROKE} strokeLinecap="round"
                            strokeDasharray={circ}
                            initial={{ strokeDashoffset: circ }}
                            animate={{ strokeDashoffset: circ - dPct }}
                            transition={{ duration: 1.3, ease: 'easeOut', delay: 0.1 }}
                            style={{ filter: 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.45))' }}
                        />
                    </svg>

                    {/* Center Hub */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Total Serapan</span>
                        <div className="text-2xl font-black text-slate-900 dark:text-white leading-none my-0.5">
                            {totalPct.toFixed(1)}<span className="text-sm text-sky-700 dark:text-sky-400 font-extrabold">%</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-bold truncate max-w-[130px]">
                            {formatIDRShort(totalRealisasi)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Per-DIPA Breakdown List */}
            <div className="flex-1 min-h-0 flex flex-col gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                <Paged
                    items={progressKeuangan}
                    itemH={74}
                    fixed
                    empty={<p className="text-xs text-slate-600 dark:text-slate-400 italic text-center py-2">Belum ada data DIPA keuangan.</p>}
                    render={(pk) => {
                        const pct = pk.rencana > 0 ? (pk.realisasi / pk.rencana) * 100 : 0;
                        return (
                            <div className="h-full p-2.5 rounded-xl bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/5 text-xs space-y-1">
                                <div className="flex justify-between items-center text-[11px]">
                                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                        DIPA {pk.tahun}
                                    </span>
                                    <span className="text-sky-700 dark:text-sky-400 font-mono font-bold">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-400">
                                    <span>Realisasi: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{formatIDRShort(pk.realisasi)}</strong></span>
                                    <span>Pagu: <strong className="text-slate-600 dark:text-slate-400 font-normal">{formatIDRShort(pk.rencana)}</strong></span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                            </div>
                        );
                    }}
                />
                {/* Belum ditagihkan callout */}
                {tagihanBelumDiproses != null && (
                    <div className="shrink-0 flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 text-[11px]">Belum ditagihkan:</span>
                        <span className="text-amber-700 dark:text-amber-400 font-bold font-mono">{formatIDR(tagihanBelumDiproses)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
// ── Info (editable) ──────────────────────────────────────────────────────────
function InfoTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        description: project.description || '',
        contractor: project.contractor || '',
        penggunaJasa: project.penggunaJasa || '',
        pengawas: project.pengawas || '',
        penyediaJasa: project.penyediaJasa || '',
        status: project.status || 'ongoing',
        startDate: project.startDate?.slice(0, 10) || '',
        endDate: project.endDate?.slice(0, 10) || '',
        pmName: project.pmName || '',
        pmPhone: project.pmPhone || '',
    });
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, form);
            toast.success('Informasi tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <TabShell header={
            <SectionHeader title="Informasi Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} saving={saving} stamp={stampOf(project, 'info')} />
        } scroll={false}>
            <div className="lg:h-full flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
            <div className="lg:col-span-12 min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                {!editing ? (
                    <>
                        <Field label="Pengguna Jasa"  value={project.penggunaJasa} />
                        <Field label="Pengawas"       value={project.pengawas} />
                        <Field label="Penyedia Jasa"  value={project.penyediaJasa} />
                        <Field label="Kontraktor"     value={project.contractor} />
                        <Field label="Status"         value={STATUS_META[project.status || 'ongoing']?.label} />
                        <Field label="Tanggal Mulai"  value={formatDate(project.startDate)} />
                        <Field label="Tanggal Selesai" value={formatDate(project.endDate)} />
                        <Field label="Nama PM / PIC"  value={project.pmName} />
                        <Field label="No. HP PM"      value={project.pmPhone} />
                        <div className="sm:col-span-2 lg:col-span-3"><Field label="Deskripsi" value={project.description} clamp={6} /></div>
                    </>
                ) : (
                    <>
                        <Input label="Pengguna Jasa"  value={form.penggunaJasa}  onChange={v => setForm({ ...form, penggunaJasa: v })} />
                        <Input label="Pengawas"       value={form.pengawas}      onChange={v => setForm({ ...form, pengawas: v })} />
                        <Input label="Penyedia Jasa"  value={form.penyediaJasa}  onChange={v => setForm({ ...form, penyediaJasa: v })} />
                        <Input label="Kontraktor"     value={form.contractor}    onChange={v => setForm({ ...form, contractor: v })} />
                        <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v as 'planning' | 'ongoing' | 'completed' })} options={[['planning', 'Perencanaan'], ['ongoing', 'Berjalan'], ['completed', 'Selesai']]} />
                        <Input label="Tanggal Mulai"  type="date" value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} />
                        <Input label="Tanggal Selesai" type="date" value={form.endDate} onChange={v => setForm({ ...form, endDate: v })} />
                        <Input label="Nama PM / PIC"  value={form.pmName}        onChange={v => setForm({ ...form, pmName: v })} />
                        <Input label="No. HP PM"      value={form.pmPhone}       onChange={v => setForm({ ...form, pmPhone: v })} hint="Nomor yang bisa dihubungi, 8-15 digit (boleh diawali +62)." />
                        <div className="sm:col-span-2 lg:col-span-3"><Textarea rows={4} label="Deskripsi" value={form.description} onChange={v => setForm({ ...form, description: v })} /></div>
                    </>
                )}
            </div>

            </div>
        </TabShell>
    );
}

// ── Panel PIC Proyek (hanya super-admin) ──────────────────────────────────────
// Menetapkan daftar PIC (cognito_sub) yang boleh mengedit proyek ini. Server
// menegakkan via requireSuperAdmin pada PATCH /api/projects/[id]/pic.
interface PicUser { cognitoSub: string; username: string; fullName: string | null; jobTitle: string | null; email: string | null; }
interface PicSearchResult { cognitoSub: string; username: string; fullName: string | null; jobTitle: string | null; email: string | null; }

function PicPanel({ projectId }: { projectId: string }) {
    const [loading, setLoading] = useState(true);
    const [picSubs, setPicSubs] = useState<string[]>([]);
    const [pics, setPics] = useState<PicUser[]>([]);
    const [saving, setSaving] = useState(false);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PicSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`/api/projects/${projectId}/pic`);
            if (res.data?.success) {
                setPicSubs(Array.isArray(res.data.data?.picSubs) ? res.data.data.picSubs : []);
                setPics(Array.isArray(res.data.data?.pics) ? res.data.data.pics : []);
            }
        } catch {
            toast.error('Gagal memuat PIC proyek');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.trim().length === 0) {
            setResults([]);
            setSearchError(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await axios.get('/api/sso-users/search', { params: { q: query.trim(), limit: 20 } });
                if (res.data?.success) {
                    setResults(Array.isArray(res.data.data) ? res.data.data : []);
                    setSearchError(null);
                }
            } catch (err) {
                setResults([]);
                if (axios.isAxiosError(err) && err.response?.status === 503) {
                    setSearchError('Direktori user SSO sedang tidak tersedia; coba lagi nanti.');
                } else {
                    setSearchError('Gagal mencari user.');
                }
            } finally {
                setSearching(false);
            }
        }, 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query]);

    const nameFor = (sub: string) => {
        const p = pics.find(x => x.cognitoSub === sub);
        if (p && (p.fullName || p.username)) return p.fullName || p.username;
        // Jaring pengaman terakhir: jangan tampilkan UUID mentah.
        const m = /^ldap_(.+)$/.exec(sub);
        if (m) return m[1];
        return 'User (belum login)';
    };

    const addPic = async (u: PicSearchResult) => {
        if (picSubs.includes(u.cognitoSub)) { setQuery(''); setResults([]); return; }
        const next = [...picSubs, u.cognitoSub];
        setPicSubs(next);
        setPics(prev => prev.some(p => p.cognitoSub === u.cognitoSub) ? prev : [...prev, u]);
        setQuery('');
        setResults([]);
        await persist(next);
    };

    const removePic = async (sub: string) => {
        const next = picSubs.filter(s => s !== sub);
        setPicSubs(next);
        await persist(next);
    };

    const persist = async (next: string[]) => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${projectId}/pic`, { picSubs: next });
            toast.success('PIC proyek diperbarui');
            await load();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
            toast.error(msg || 'Gagal menyimpan PIC');
            await load();   // sinkron ulang dari server bila gagal
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-6 p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 div-accent-text" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">PIC Proyek</h3>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin div-accent-text ml-1" />}
            </div>
            <p className="text-[11px] text-slate-500 mb-4">PIC dapat mengedit data proyek ini. Hanya super-admin yang dapat menetapkan PIC.</p>

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Memuat PIC...</div>
            ) : (
                <>
                    {/* Chips PIC saat ini */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {picSubs.length === 0 && <span className="text-xs text-slate-500">Belum ada PIC. Proyek ini hanya dapat diedit super-admin.</span>}
                        {picSubs.map(sub => (
                            <span key={sub} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.2)] text-xs font-bold div-accent-text">
                                {nameFor(sub)}
                                <button
                                    onClick={() => removePic(sub)}
                                    disabled={saving}
                                    className="w-6 h-6 min-w-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-rose-500/30 flex items-center justify-center transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    aria-label="Hapus PIC"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>

                    {/* Typeahead tambah PIC */}
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label="Cari user SSO untuk ditambahkan sebagai PIC"
                            placeholder="Cari user SSO untuk ditambahkan sebagai PIC..."
                            className="w-full px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-[rgba(var(--div-accent-rgb),0.5)] outline-none"
                        />
                    </div>

                    {searchError && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {searchError}
                        </div>
                    )}
                    {searching && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari...</div>
                    )}
                    {!searching && !searchError && results.length > 0 && (
                        <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                            {results.map(u => (
                                <button
                                    key={u.cognitoSub}
                                    onClick={() => addPic(u)}
                                    disabled={saving || picSubs.includes(u.cognitoSub)}
                                    className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-[rgba(var(--div-accent-rgb),0.1)] border border-transparent hover:border-[rgba(var(--div-accent-rgb),0.2)] transition-colors text-left disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.fullName || u.username}</div>
                                        <div className="text-[11px] text-slate-500 truncate">@{u.username}{u.jobTitle ? ` · ${u.jobTitle}` : ''}</div>
                                    </div>
                                    {picSubs.includes(u.cognitoSub)
                                        ? <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                        : <Plus className="w-4 h-4 text-slate-400 shrink-0" />}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Location ─────────────────────────────────────────────────────────────────
function LocationTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const saveFootprint = async (points: FootprintPoint[], height: number | null) => {
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                footprint: points,
                footprintHeight: height,
            });
            toast.success(points.length === 0 ? 'Footprint dihapus' : 'Footprint tersimpan');
            onSaved();
        } catch (err) {
            toast.error(saveErrorMessage(err));
            throw err; // editor tetap terbuka
        }
    };
    return (
        <TabShell scroll={false}>
            <div className="lg:h-full flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
                <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                    <FootprintEditor
                        lat={project.lat}
                        lng={project.lng}
                        footprint={project.footprint ?? []}
                        height={project.footprintHeight}
                        canEdit={isAdmin}
                        onSave={saveFootprint}
                    />
                </div>
                <div className="min-w-0 lg:min-h-0 flex flex-col gap-4">
                    <UpdatedStamp stamp={stampOf(project, 'location')} className="shrink-0 !mt-0" />
                    <div className="grid sm:grid-cols-2 gap-4 shrink-0">
                        <Field label="Latitude"  value={String(project.lat)} />
                        <Field label="Longitude" value={String(project.lng)} />
                    </div>
                    <a
                        href={`https://www.google.com/maps?q=${project.lat},${project.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        className="shrink-0 self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                        <ExternalLink className="w-4 h-4" aria-hidden="true" /> Buka di Google Maps
                    </a>
                    <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 max-lg:aspect-video lg:flex-1 lg:min-h-0">
                        <iframe
                            title="Peta lokasi"
                            className="w-full h-full"
                            src={`https://www.openstreetmap.org/export/embed.html?bbox=${project.lng - 0.01},${project.lat - 0.01},${project.lng + 0.01},${project.lat + 0.01}&marker=${project.lat},${project.lng}`}
                        />
                    </div>
                </div>
            </div>
        </TabShell>
    );
}

// ── Contract ─────────────────────────────────────────────────────────────────
function ContractTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        contractNumber: project.contractNumber || '',
        contractValue: project.contractValue?.toString() || '',
    });
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                contractNumber: form.contractNumber,
                contractValue: numOrNull(form.contractValue),
            });
            toast.success('Kontrak tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    // Waktu kontrak dihitung dari tanggal mulai dan selesai (Ringkasan › Informasi).
    const kh = kontrakHari(project.startDate, project.endDate);
    const hasSpan = !!kh;
    const totalHari = kh?.total;
    const sisaHari = kh?.sisa;
    const terpakai = kh?.persen;

    return (
        <TabShell header={
            <SectionHeader title="Kontrak Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} saving={saving} stamp={stampOf(project, 'contract')} />
        } scroll={false}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                {!editing ? (
                    <>
                        <Field label="Nomor Kontrak" value={project.contractNumber} />
                        <Field label="Nilai Kontrak" value={formatIDR(project.contractValue)} />
                        <Field label="Masa Pelaksanaan" value={project.startDate && project.endDate ? `${formatDate(project.startDate)} s/d ${formatDate(project.endDate)}` : '-'} />
                    </>
                ) : (
                    <>
                        <Input label="Nomor Kontrak"   value={form.contractNumber} onChange={v => setForm({ ...form, contractNumber: v })} />
                        <MoneyInput allowNegative={false} label="Nilai Kontrak" value={form.contractValue} onChange={v => setForm({ ...form, contractValue: v })} hint="Nilai kontrak dalam Rupiah penuh. Dipakai sebagai pembagi persen Kurva S di Laporan Bulanan." />
                    </>
                )}


                {!editing && (
                    <div className="sm:col-span-2 lg:col-span-3 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-3">Waktu Kontrak</div>
                        {hasSpan ? (
                            <>
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <MiniField label="Durasi" value={`${totalHari} hari`} />
                                    <MiniField label="Sisa waktu" value={sisaHari! >= 0 ? `${sisaHari} hari` : `Lewat ${Math.abs(sisaHari!)} hari`} />
                                    <MiniField label="Waktu terpakai" value={`${terpakai!.toFixed(1)}%`} />
                                </div>
                                <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                    <div className={`h-full rounded-full ${sisaHari! < 0 ? 'bg-rose-500' : 'div-accent-solid'}`} style={{ width: `${terpakai}%` }} />
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-slate-600 dark:text-slate-400">Isi tanggal mulai dan selesai di Ringkasan › Informasi untuk melihat sisa waktu kontrak.</p>
                        )}
                    </div>
                )}
            </div>
        </TabShell>
    );
}

// ── Progres fisik (Ringkasan › Progres Fisik) ────────────────────────────────
/** "63,74" / "63.74" -> 63.74; null bila kosong, bukan angka, atau di luar 0..100. */
function parsePercent(text: string): number | null {
    const t = text.trim().replace(',', '.');
    if (t === '' || !/^\d+(\.\d*)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Input persen berupa teks: menerima koma atau titik desimal, galat inline di luar 0-100. */
function PercentInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const uid = useId();
    const errId = `${uid}-err`;
    const bad = value.trim() !== '' && parsePercent(value) == null;
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}</label>
            <input
                id={uid}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                placeholder="mis. 63,74"
                aria-invalid={bad || undefined}
                aria-describedby={bad ? errId : undefined}
                onChange={e => onChange(e.target.value)}
                className={controlCls(bad)}
            />
            <FieldError id={errId} message={bad ? 'Isi angka 0 sampai 100 (boleh koma, mis. 63,74)' : undefined} />
        </div>
    );
}

function ProgressFisikTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    // Persen diketik sebagai teks supaya koma desimal ("63,74") dan titik ("63.74") sama-sama bisa.
    const pctText = (v?: number) => (v == null ? '' : String(v).replace('.', ','));
    const initForm = () => ({
        progressPercent: pctText(project.progressPercent ?? 0),
        progressRencana: pctText(project.progressRencana ?? 0),
        progressPeriode: isValidPeriode(project.progressPeriode)
            ? project.progressPeriode
            : latestLaporan(project.laporanBulanan)?.periode ?? new Date().toISOString().slice(0, 7),
    });
    const [form, setForm] = useState(initForm);
    const [saving, setSaving] = useState(false);
    const realNum = parsePercent(form.progressPercent);
    const rencanaNum = parsePercent(form.progressRencana);

    const save = async () => {
        if (realNum == null || rencanaNum == null) {
            toast.error('Rencana dan realisasi harus berupa angka 0 sampai 100');
            return;
        }
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                progressPercent: Math.round(realNum * 100) / 100,
                progressRencana: Math.round(rencanaNum * 100) / 100,
                progressPeriode: form.progressPeriode,
            });
            toast.success('Progres tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    const deviasi = editing
        ? ((realNum ?? 0) - (rencanaNum ?? 0))
        : (project.progressDeviasi ?? ((project.progressPercent ?? 0) - (project.progressRencana ?? 0)));

    return (
        <TabShell header={
            <SectionHeader title="Progres Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => { setForm(initForm()); setEditing(true); }} onCancel={() => { setForm(initForm()); setEditing(false); }} onSave={save} saving={saving} stamp={stampOf(project, 'progress')} />
        } scroll={false}>
            <div className="lg:h-full flex flex-col gap-4 lg:grid lg:grid-cols-1 lg:grid-rows-[minmax(0,1fr)] lg:max-w-3xl">
                <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-1 space-y-4">
            {!editing ? (
                <ProgressFisikCard
                    rencana={project.progressRencana ?? 0}
                    realisasi={project.progressPercent ?? 0}
                    deviasi={deviasi}
                    sampai={fisikSampai(project)}
                    startDate={project.startDate}
                    endDate={project.endDate}
                />
            ) : (
                <div className="space-y-4">
                    {/* Progress fisik edit */}
                    <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Progress Fisik</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="progress-periode" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Progres s.d. bulan</label>
                                <input id="progress-periode" type="month" required value={form.progressPeriode} onChange={e => setForm({ ...form, progressPeriode: e.target.value })} className="block mt-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <PercentInput label="Rencana (%)" value={form.progressRencana} onChange={v => setForm({ ...form, progressRencana: v })} />
                                <PercentInput label="Realisasi (%)" value={form.progressPercent} onChange={v => setForm({ ...form, progressPercent: v })} />
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-black/5 dark:border-white/5">
                            <span className="text-xs text-slate-500 dark:text-slate-400">Deviasi</span>
                            <span className={`text-sm font-bold ${deviasi >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {deviasi >= 0 ? '+' : ''}{deviasi.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-500 px-1">Progress Keuangan (DIPA) kini dikelola di tab <span className="font-bold text-slate-500 dark:text-slate-400">Finansial</span>.</p>
                </div>
            )}

            
                </div>
            </div>
        </TabShell>
    );
}

// ── Lingkup pekerjaan (Operasi) ──────────────────────────────────────────────
function LingkupCard({ project, isAdmin, onSaved, className = '' }: { project: Project; isAdmin: boolean; onSaved: () => void; className?: string }) {
    const [editing, setEditing] = useState(false);
    const [list, setList] = useState<string[]>(project.lingkupPekerjaan ?? []);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { lingkupPekerjaan: list });
            toast.success('Lingkup pekerjaan tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <SectionCard className={className}>
            <SectionHeader
                compact
                title="Lingkup Pekerjaan"
                stamp={stampOf(project, 'progress')}
                isAdmin={isAdmin}
                editing={editing}
                onEdit={() => { setList(project.lingkupPekerjaan ?? []); setEditing(true); }}
                onCancel={() => { setList(project.lingkupPekerjaan ?? []); setEditing(false); }}
                onSave={save}
                saving={saving}
            />
            {editing && (
                <button onClick={() => setList(l => [...l, ''])}
                    className="self-start flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                    <Plus className="w-3.5 h-3.5" /> Tambah
                </button>
            )}
            <Paged
                items={editing ? list : (project.lingkupPekerjaan ?? [])}
                itemH={editing ? 46 : 36}
                cols={editing ? 1 : 2}
                baseClass={editing ? '' : 'grid-cols-1 sm:grid-cols-2'}
                empty={<EmptyState compact text="Belum ada lingkup pekerjaan." action={isAdmin ? { label: 'Isi sekarang', onClick: () => { setList(project.lingkupPekerjaan ?? []); setEditing(true); } } : undefined} />}
                render={(lp, i) => editing ? (
                    <div className="flex gap-2">
                        <input aria-label="Lingkup pekerjaan" value={lp} onChange={e => { const a = [...list]; a[i] = e.target.value; setList(a); }} className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                        <button onClick={() => setList(l => l.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-10 min-h-10 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"><Minus className="w-4 h-4" aria-hidden="true" /></button>
                    </div>
                ) : (
                    <span className="block truncate px-3 py-1.5 rounded-full text-xs font-medium bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.2)] div-accent-text" title={lp}>{lp}</span>
                )}
            />
        </SectionCard>
    );
}

// ── QHSSE ─────────────────────────────────────────────────────────────────────
type QhsseRow = Record<string, string>;
interface QhsseCol { k: string; label: string; kind: 'int' | 'num' | 'money' | 'text'; max?: number; computed?: boolean }
const QHSSE_COLS: Record<QhsseKey, QhsseCol[]> = {
    nc: [
        { k: 'totalNC', label: 'Total NC', kind: 'int' },
        { k: 'open', label: 'Open', kind: 'int' },
        { k: 'closed', label: 'Closed', kind: 'int' },
        { k: 'totalCost', label: 'Cost of NC', kind: 'money' },
    ],
    qpass: [
        { k: 'struktur', label: 'Struktur', kind: 'num', max: 100 },
        { k: 'arsitektur', label: 'Arsitektur', kind: 'num', max: 100 },
        { k: 'mep', label: 'MEP', kind: 'num', max: 100 },
        { k: 'overall', label: 'Overall', kind: 'num', max: 100 },
    ],
    trir: [
        { k: 'incidents', label: 'Insiden Tercatat', kind: 'int' },
        { k: 'workHours', label: 'Total Jam Kerja', kind: 'num' },
        { k: 'nilai', label: 'TRIR (otomatis)', kind: 'num', computed: true },
        { k: 'catatan', label: 'Catatan', kind: 'text' },
    ],
    smk3l: [{ k: 'nilai', label: 'Skor (0–100)', kind: 'num', max: 100 }, { k: 'catatan', label: 'Catatan', kind: 'text' }],
    r5: [{ k: 'jumlah', label: 'Jumlah Laporan', kind: 'int' }, { k: 'durasi', label: 'Rata-rata Durasi (menit)', kind: 'num' }, { k: 'catatan', label: 'Catatan', kind: 'text' }],
    pak: [{ k: 'nilai', label: 'Jumlah kasus', kind: 'int' }, { k: 'catatan', label: 'Catatan', kind: 'text' }],
    energi: [
        { k: 'energyKwh', label: 'Energi Listrik (kWh)', kind: 'num' },
        { k: 'areaM2', label: 'Luas Bangunan (m²)', kind: 'num' },
        { k: 'nilai', label: 'Kepatuhan (%) (otomatis)', kind: 'num', computed: true },
        { k: 'catatan', label: 'Catatan', kind: 'text' },
    ],
    keamanan: [{ k: 'nilai', label: 'Jumlah kasus', kind: 'int' }, { k: 'catatan', label: 'Catatan', kind: 'text' }],
};

const qhsseToDraft = (rows: object[]): QhsseRow[] =>
    [...rows as Record<string, unknown>[]]
        .sort((a, b) => String(b.periode).localeCompare(String(a.periode)))
        .map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])));

function qhsseFromDraft(key: QhsseKey, draft: QhsseRow[]): Record<string, unknown>[] {
    return draft.map(r => {
        const out: Record<string, unknown> = { periode: (r.periode ?? '').trim() };
        for (const c of QHSSE_COLS[key]) {
            if (c.computed) continue; // kolom hasil diisi otomatis dari elemen, bukan dari input
            const v = (r[c.k] ?? '').trim();
            if (v === '') continue;
            out[c.k] = c.kind === 'text' ? v : Number(v.replace(',', '.'));
        }
        // Dimensi berumus: hitung & simpan 'nilai' dari elemen agar grafik/ringkasan konsisten.
        if (key === 'trir' || key === 'energi') {
            const n = computedNilai(key, out as unknown as QhsseNilai);
            if (typeof n === 'number' && Number.isFinite(n)) out.nilai = n;
            else delete out.nilai;
        }
        return out;
    });
}

/** Nilai hasil (terformat) sebuah kolom computed dari baris draft/tampilan (string → angka). */
function computedCell(dim: QhsseDimId, c: QhsseCol, r: QhsseRow): string {
    if (!c.computed) return '-';
    const num = (s?: string) => { const v = Number((s ?? '').replace(',', '.')); return (s ?? '').trim() !== '' && Number.isFinite(v) ? v : undefined; };
    const e: QhsseNilai = {
        periode: r.periode ?? '',
        incidents: num(r.incidents), workHours: num(r.workHours),
        energyKwh: num(r.energyKwh), areaM2: num(r.areaM2),
        nilai: num(r.nilai),
    };
    const v = computedNilai(dim, e);
    return v == null ? '-' : fmtValue(dim, v);
}

/** Field read-only bergaya seperti Input tapi menampilkan nilai yang dihitung otomatis. */
function ComputedField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className={LABEL_CLS}>{label}</span>
            <div className="mt-1.5 w-full px-3 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-dashed border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-mono">
                {value}
            </div>
        </div>
    );
}

function QhsseTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    // 'all' = ringkasan semua dimensi (tampilan awal); selain itu = detail satu dimensi + input data.
    const [view, setView] = useState<QhsseDimId | 'all'>('all');
    const active: QhsseDimId = view === 'all' ? 'nc' : view;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<QhsseRow[]>([]);
    const [saving, setSaving] = useState(false);

    const dim = QHSSE_DIM_BY_ID[active];
    const key = dim.key;
    const cols = QHSSE_COLS[key];
    const data = project.qhsse;
    const stored = (data?.[key] ?? []) as object[];
    const viewRows = qhsseToDraft(stored);
    const series = seriesFor(active, data);
    const sum = summarize(active, data);
    const fmt = (v: number) => fmtValue(active, v);

    const startEdit = (add: boolean) => {
        const base = qhsseToDraft(stored);
        if (add) base.unshift({ periode: nextPeriode(base[0]?.periode) });
        setDraft(base);
        setEditing(true);
    };
    const cancel = () => { setEditing(false); setDraft([]); };
    const upd = (i: number, patch: QhsseRow) => setDraft(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const addRow = () => setDraft(l => [{ periode: nextPeriode(l[0]?.periode) }, ...l]);

    const save = async () => {
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {};
            for (const k of Object.keys(QHSSE_COLS) as QhsseKey[]) payload[k] = data?.[k] ?? [];
            payload[key] = qhsseFromDraft(key, draft);
            await axios.patch(`/api/projects/${project._id}`, { qhsse: payload });
            toast.success('Data QHSSE tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); } finally { setSaving(false); }
    };

    const smallBtn = 'px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
    const saveBtn = 'px-2.5 py-1.5 rounded-lg div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
    const delBtn = 'text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none rounded';
    const rowCard = 'p-3 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-black/5 dark:border-white/5';
    const gridStyle = { gridTemplateColumns: `minmax(0,1.1fr) repeat(${cols.length}, minmax(0,1fr))` };
    const trendCls = sum.trend === 'good' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
        : sum.trend === 'bad' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30'
        : 'text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/20';
    const cellText = (c: QhsseCol, v?: string) => {
        if (v == null || v === '') return '-';
        if (c.kind === 'text') return v;
        const n = Number(v);
        if (c.kind === 'money') return fmtRupiah(n);
        return fmtNum(n, c.kind === 'int' ? 0 : 2);
    };

    return (
        <TabShell scroll={false}>
        <div className="flex flex-col gap-3 lg:h-full">
            {/* Pemilih dimensi */}
            <SectionCard>
                <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">QHSSE · {filledCount(data)}/{QHSSE_DIMS.length} dimensi terisi</h3>
                        <UpdatedStamp stamp={stampOf(project, 'qhsse')} />
                    </div>
                    <div role="tablist" aria-label="Dimensi QHSSE" className="flex flex-wrap gap-1.5">
                        <button
                            role="tab"
                            aria-selected={view === 'all'}
                            disabled={editing}
                            onClick={() => setView('all')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none ${
                                view === 'all' ? 'div-accent-solid text-slate-950 border-transparent'
                                    : 'bg-black/[0.04] dark:bg-white/5 border-black/5 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'}`}
                        >
                            Semua
                        </button>
                        {QHSSE_DIMS.map(d => {
                            const on = d.id === view;
                            return (
                                <button
                                    key={d.id}
                                    role="tab"
                                    aria-selected={on}
                                    disabled={editing && !on}
                                    onClick={() => setView(d.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none ${
                                        on ? 'div-accent-solid text-slate-950 border-transparent'
                                           : 'bg-black/[0.04] dark:bg-white/5 border-black/5 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'}`}
                                >
                                    {d.short}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </SectionCard>

            {view === 'all' ? (
                <div className="flex flex-col gap-2 lg:flex-1 lg:min-h-0">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        Panah dibandingkan bulan lalu (hijau membaik, merah memburuk). Klik kartu untuk melihat grafik detail{isAdmin ? ' dan mengisi data' : ''}.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:flex-1 lg:min-h-0 lg:grid-rows-3">
                        {QHSSE_DIMS.map(d => <QhsseCard key={d.id} dim={d} data={data} onClick={() => setView(d.id)} className="lg:min-h-0" />)}
                    </div>
                </div>
            ) : (
            <div className="flex flex-col gap-3 lg:flex-1 lg:min-h-0 lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
                {/* Grafik tren */}
                <SectionCard>
                    <div className="shrink-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{dim.bidang}</p>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{dim.label}{dim.glossary ? <InfoTip glossary={dim.glossary} /> : dim.hint && <InfoTip text={dim.hint} />}</h3>
                    </div>
                    <div className="flex items-end gap-3 shrink-0">
                        <div>
                            <div className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">{fmtValue(active, sum.latest)}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{active === 'nc' ? 'NC open · ' : ''}{sum.periode ? periodeFull(sum.periode) : 'Belum ada data'}</div>
                        </div>
                        {sum.delta != null && sum.trend && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold ${trendCls}`} title="Dibanding bulan sebelumnya">
                                {sum.delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" /> : sum.delta < 0 ? <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" /> : <Minus className="w-3.5 h-3.5" aria-hidden="true" />}
                                {sum.delta > 0 ? '+' : ''}{active === 'cost' ? fmtRupiah(sum.delta) : fmtNum(sum.delta, 2)}
                                <span className="sr-only">{sum.trend === 'good' ? ' membaik' : sum.trend === 'bad' ? ' memburuk' : ' tetap'}</span>
                            </span>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 flex flex-col justify-center">
                        <QhsseTrendChart label={dim.label} series={series} fmt={fmt} />
                    </div>
                    {dim.sumber && <p className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">Sumber: {dim.sumber}</p>}
                </SectionCard>

                {/* Data bulanan */}
                <SectionCard>
                    <div className="flex items-center justify-between gap-2 shrink-0">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Data Bulanan{active === 'cost' ? ' (bersama NC Status)' : ''}</h3>
                        {isAdmin && (editing ? (
                            <div className="flex gap-2">
                                <button onClick={addRow} className={smallBtn}><Plus className="w-3.5 h-3.5" /> Bulan</button>
                                <button onClick={cancel} className={smallBtn}><X className="w-3.5 h-3.5" /> Batal</button>
                                <button onClick={save} disabled={saving} className={saveBtn}>{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(true)} className={smallBtn}><Plus className="w-3.5 h-3.5" /> Tambah</button>
                                <button onClick={() => startEdit(false)} className={smallBtn}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                            </div>
                        ))}
                    </div>
                    {!editing && viewRows.length > 0 && (
                        <div className="hidden lg:grid shrink-0 gap-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" style={gridStyle}>
                            <span>Periode</span>{cols.map(c => <span key={c.k}>{c.label}</span>)}
                        </div>
                    )}
                    <Paged<QhsseRow>
                        items={editing ? draft : viewRows}
                        itemH={editing ? (key === 'nc' || key === 'qpass' || key === 'trir' || key === 'energi' ? 196 : 168) : 44}
                        fixed={!editing}
                        empty={<EmptyState compact text="Belum ada data bulanan." />}
                        render={(r, i) => editing ? (
                            <div className={rowCard}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">{r.periode ? periodeFull(r.periode) : `Bulan #${i + 1}`}</span>
                                    <button onClick={() => setDraft(l => l.filter((_, j) => j !== i))} aria-label="Hapus bulan" className={delBtn}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Hapus</button>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-1">
                                    <Input label="Periode" type="month" required value={r.periode ?? ''} onChange={v => upd(i, { periode: v })} />
                                    {cols.map(c => c.computed
                                        ? <ComputedField key={c.k} label={c.label} value={computedCell(active, c, r)} />
                                        : c.kind === 'money'
                                        ? <MoneyInput allowNegative={false} key={c.k} label={c.label} value={r[c.k] ?? ''} onChange={v => upd(i, { [c.k]: v })} />
                                        : <Input key={c.k} label={c.label} type={c.kind === 'text' ? 'text' : 'number'} min={0} max={c.max} step={c.kind === 'int' ? 1 : 'any'} value={r[c.k] ?? ''} onChange={v => upd(i, { [c.k]: v })} />)}
                                </div>
                            </div>
                        ) : (
                            <div className={`${rowCard} h-full grid items-center gap-2 text-sm`} style={gridStyle}>
                                <span className="font-bold text-slate-900 dark:text-white truncate">{periodeFull(r.periode)}</span>
                                {cols.map(c => {
                                    const display = c.computed
                                        ? computedCell(active, c, r)
                                        : c.k === 'overall' && !r.overall
                                        ? fmtNum(qpassOverall({ periode: r.periode, struktur: r.struktur ? Number(r.struktur) : undefined, arsitektur: r.arsitektur ? Number(r.arsitektur) : undefined, mep: r.mep ? Number(r.mep) : undefined }) ?? NaN, 2).replace('NaN', '-')
                                        : cellText(c, r[c.k]);
                                    return <span key={c.k} className="font-mono text-slate-700 dark:text-slate-200 truncate" title={display}>{display}</span>;
                                })}
                            </div>
                        )}
                    />
                </SectionCard>
            </div>
            )}
        </div>
        </TabShell>
    );
}

// ── Gallery ─────────────────────────────────────────────────────────────────
function GalleryTab({ project, isAdmin, onChanged }: { project: Project; isAdmin: boolean; onChanged: () => void }) {
    const [lightbox, setLightbox] = useState<number | null>(null);
    // Foto yang diklik pertama kali: hanya foto ini yang "terbang" dari thumbnail ke lightbox.
    const [originKey, setOriginKey] = useState<string | null>(null);
    const items = (project.gallery || []).filter(g => g.url);
    const { confirm, ConfirmDialog } = useConfirm();

    const doDelete = async (key: string) => {
        try { await axios.delete(`/api/projects/${project._id}?kind=gallery&key=${encodeURIComponent(key)}`); toast.success('Foto dihapus'); onChanged(); }
        catch { toast.error('Gagal menghapus'); }
    };
    const del = (key: string) => confirm('Hapus Foto', 'Foto ini akan dihapus permanen dari galeri. Lanjutkan?', () => doDelete(key));
    return (
        <TabShell scroll={false}>
            {ConfirmDialog}
            <SectionCard className="lg:h-full">
                <div className="flex items-center justify-between gap-2 shrink-0 min-w-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">Galeri Foto</h3>
                        <UpdatedStamp stamp={stampOf(project, 'gallery')} />
                    </div>
                    {isAdmin && <UploadButton projectId={project._id} kind="gallery" accept="image/jpeg,image/png,image/webp,image/gif" label="Unggah Foto" onDone={onChanged} multiple />}
                </div>
                <Paged
                    items={items}
                    itemH={150}
                    cols={5}
                    fixed
                    baseClass="grid-cols-2 sm:grid-cols-3"
                    empty={<EmptyState compact text="Belum ada foto." />}
                    render={(g, i) => (
                        <div className="relative group h-full max-lg:aspect-[4/3] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900">
                            <button type="button" onClick={() => { setOriginKey(g.key); setLightbox(i); }} className="block w-full h-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                <motion.img layoutId={`gal-${g.key}`} src={g.url!} alt={g.caption || ''} loading="lazy" className="w-full h-full object-cover block transition-transform duration-300 group-hover:scale-[1.03]" />
                            </button>
                            {g.caption && <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-[11px] text-white truncate pointer-events-none">{g.caption}</div>}
                            {isAdmin && (
                                <button onClick={() => del(g.key)} aria-label="Hapus foto" className="absolute top-1.5 right-1.5 min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-black/60 text-rose-400 opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-rose-500/20 transition-all focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    )}
                />
            </SectionCard>

            <AnimatePresence>
                {lightbox !== null && items[lightbox] && (
                    <Lightbox
                        key="lightbox"
                        items={items}
                        index={lightbox}
                        originKey={originKey}
                        onClose={() => setLightbox(null)}
                        onNavigate={setLightbox}
                    />
                )}
            </AnimatePresence>
        </TabShell>
    );
}

// ── Lightbox (preview galeri) ──────────────────────────────────────────────────
function Lightbox({ items, index, originKey, onClose, onNavigate }: {
    items: GalleryItem[];
    index: number;
    originKey: string | null;
    onClose: () => void;
    onNavigate: (i: number) => void;
}) {
    const total = items.length;
    const go = useCallback((dir: number) => {
        onNavigate((index + dir + total) % total);
    }, [index, total, onNavigate]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') go(1);
            else if (e.key === 'ArrowLeft') go(-1);
        };
        window.addEventListener('keydown', onKey);
        // Kunci scroll body selama lightbox terbuka.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    }, [go, onClose]);

    const cur = items[index];
    const reduceMotion = useReducedMotion();
    // Hanya foto asal klik yang berbagi layoutId dengan thumbnail. Foto lain
    // (hasil navigasi panah) cukup crossfade, supaya tidak "terbang" dari thumbnail di luar layar.
    const fromThumb = cur.key === originKey;

    return (
        <motion.div
            role="dialog" aria-modal="true" aria-label="Pratinjau foto"
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
        >
            {/* Tutup */}
            <button onClick={onClose} aria-label="Tutup pratinjau" className="absolute top-4 right-4 max-sm:top-[calc(1rem+env(safe-area-inset-top,0px))] max-sm:right-[calc(1rem+env(safe-area-inset-right,0px))] min-w-11 min-h-11 max-sm:min-w-12 max-sm:min-h-12 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors z-20 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none" title="Tutup (Esc)">
                <X className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Counter */}
            <div className="absolute top-5 left-5 max-sm:top-[calc(1.25rem+env(safe-area-inset-top,0px))] max-sm:left-[calc(1.25rem+env(safe-area-inset-left,0px))] text-xs font-bold text-white/80 bg-white/10 rounded-full px-3 py-1 z-20">
                {index + 1} / {total}
            </div>

            {/* Prev */}
            {total > 1 && (
                <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 sm:left-6 min-w-11 min-h-11 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-20 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none" aria-label="Foto sebelumnya" title="Sebelumnya (←)">
                    <ChevronLeft className="w-6 h-6" aria-hidden="true" />
                </button>
            )}

            {/* Gambar — isi area penuh, proporsional */}
            <div
                className="relative flex flex-col items-center justify-center"
                style={{ width: '90vw', height: '90dvh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <motion.img
                    key={cur.key}
                    layoutId={fromThumb ? `gal-${cur.key}` : undefined}
                    initial={fromThumb || reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }}
                    src={cur.url!}
                    alt={cur.caption || ''}
                    className="w-full h-full object-contain rounded-lg shadow-2xl select-none"
                    draggable={false}
                />
                {cur.caption && (
                    <p className="absolute bottom-0 left-0 right-0 py-2 px-4 bg-black/60 text-sm text-white text-center rounded-b-lg">
                        {cur.caption}
                    </p>
                )}
            </div>

            {/* Next */}
            {total > 1 && (
                <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 sm:right-6 min-w-11 min-h-11 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-20 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none" aria-label="Foto berikutnya" title="Berikutnya (→)">
                    <ChevronRight className="w-6 h-6" aria-hidden="true" />
                </button>
            )}
        </motion.div>
    );
}

// ── Confirm Modal + hook ───────────────────────────────────────────────────────
function useConfirm() {
    const [state, setState] = useState<{ open: boolean; title: string; message: string; onConfirm: (() => void) | null }>({
        open: false, title: '', message: '', onConfirm: null,
    });
    const confirm = useCallback((title: string, message: string, onConfirm: () => void) => {
        setState({ open: true, title, message, onConfirm });
    }, []);
    const close = useCallback(() => setState(s => ({ ...s, open: false, onConfirm: null })), []);
    useEffect(() => {
        if (!state.open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [state.open, close]);

    const ConfirmDialog = (
        <AnimatePresence>
            {state.open && (
                <motion.div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={close}
                >
                    <motion.div
                        role="dialog" aria-modal="true" aria-label={state.title}
                        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 shadow-2xl p-6"
                        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-rose-400" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">{state.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{state.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={close} className="px-4 py-2 max-sm:min-h-11 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">Batal</button>
                            <button
                                onClick={() => { state.onConfirm?.(); close(); }}
                                className="px-4 py-2 max-sm:min-h-11 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-900 dark:text-white text-sm font-bold transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return { confirm, ConfirmDialog };
}


// ── Tata letak "tanpa scroll" (desktop) ───────────────────────────────────────
// Di lg ke atas tiap tab setinggi layar; daftar yang panjang dibagi per halaman
// (jumlah baris dihitung dari tinggi ruang yang tersedia) supaya tidak ada scroll.
// Di bawah lg semua item tampil dan halaman mengalir/scroll seperti biasa.
const LG_QUERY = '(min-width: 1024px)';
function subscribeLg(cb: () => void) {
    const m = window.matchMedia(LG_QUERY);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
}
function useIsDesktop() {
    return useSyncExternalStore(subscribeLg, () => window.matchMedia(LG_QUERY).matches, () => false);
}

/** Jumlah item yang muat di kotak terukur (tinggi ditentukan layout, bukan isi). */
function useFit<E extends HTMLElement>(itemH: number, gap = 8, cols = 1) {
    const ref = useRef<E>(null);
    const desktop = useIsDesktop();
    const [h, setH] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setH(Math.round(e.contentRect.height)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const rows = h > 0 ? Math.max(1, Math.floor((h + gap) / (itemH + gap))) : 3;
    const perPage = desktop ? rows * cols : Number.MAX_SAFE_INTEGER;
    return [ref, perPage] as const;
}

function usePaged<T>(items: T[], perPage: number) {
    const [page, setPage] = useState(0);
    const [prevLen, setPrevLen] = useState(items.length);
    // Item baru ditambahkan: lompat ke halaman terakhir agar baris baru terlihat.
    if (items.length !== prevLen) {
        setPrevLen(items.length);
        if (items.length > prevLen) setPage(Number.MAX_SAFE_INTEGER);
    }
    const pages = Math.max(1, Math.ceil(items.length / Math.max(1, perPage)));
    const cur = Math.min(page, pages - 1);
    const start = cur * perPage;
    return { page: cur, pages, start, items: items.slice(start, start + perPage), setPage };
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
    if (pages <= 1) return null;
    const btn = 'min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
    return (
        <div className="shrink-0 flex items-center justify-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400" role="navigation" aria-label="Halaman daftar">
            <button type="button" className={btn} disabled={page <= 0} onClick={() => onChange(page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></button>
            <span className="font-mono">{page + 1} / {pages}</span>
            <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label="Halaman berikutnya"><ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
        </div>
    );
}

/**
 * Daftar berhalaman yang mengisi sisa tinggi induknya (induk harus flex-col dengan tinggi pasti di lg).
 * itemH = perkiraan tinggi satu item (px) untuk menghitung jumlah per halaman.
 */
function Paged<T>({ items, itemH, gap = 8, cols = 1, fixed = false, baseClass = '', render, empty }: {
    items: T[]; itemH: number; gap?: number; cols?: number; fixed?: boolean; baseClass?: string;
    render: (item: T, index: number) => React.ReactNode; empty?: React.ReactNode;
}) {
    const [ref, perPage] = useFit<HTMLDivElement>(itemH, gap, cols);
    const desktop = useIsDesktop();
    const p = usePaged(items, perPage);
    return (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div
                ref={ref}
                className={`flex-1 min-h-0 lg:overflow-hidden grid content-start ${baseClass}`}
                style={{ gap, gridTemplateColumns: desktop && cols > 1 ? `repeat(${cols}, minmax(0, 1fr))` : undefined }}
            >
                {items.length === 0 ? empty : p.items.map((it, i) => (
                    <div key={p.start + i} className={`min-w-0 min-h-0 ${fixed && desktop ? 'overflow-hidden' : ''}`} style={fixed && desktop ? { height: itemH } : undefined}>
                        {render(it, p.start + i)}
                    </div>
                ))}
            </div>
            <Pager page={p.page} pages={p.pages} onChange={p.setPage} />
        </div>
    );
}

/** Kartu satu bagian untuk tata letak grid satu layar. */
function SectionCard({ className = '', children }: { className?: string; children: React.ReactNode }) {
    return (
        <section className={`min-w-0 lg:min-h-0 flex flex-col gap-2 p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 ${className}`}>
            {children}
        </section>
    );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
/**
 * Kerangka tab setinggi layar (lg ke atas): header tetap, isi mengisi sisa tinggi.
 * Di bawah lg mengalir biasa. scroll=true: isi bisa di-scroll di dalam kerangka (tab berisi daftar/form).
 * Di dalam SubViews / KelolaDrawer (ShellCtx = true) tinggi mengikuti induk, bukan tinggi layar.
 */
const ShellCtx = createContext(false);
function TabShell({ header, children, scroll = true }: { header?: React.ReactNode; children: React.ReactNode; scroll?: boolean }) {
    const nested = useContext(ShellCtx);
    return (
        <div className={`flex flex-col gap-3 ${nested ? 'max-lg:pb-2 lg:h-full lg:min-h-0' : 'max-lg:pb-8 lg:h-[calc(100dvh-var(--ph-h,5.5rem)-1.5rem)]'}`}>
            {header && <div className="shrink-0">{header}</div>}
            <div className={`flex-1 min-h-0 ${scroll ? 'lg:overflow-y-auto lg:pr-1' : ''}`}>{children}</div>
        </div>
    );
}

/** Pil pemilih sub-tampilan (gaya sama dengan pil di Laporan Bulanan). */
function ViewPills<V extends string>({ label, views, active, onChange }: {
    label: string; views: { id: V; label: string; icon: typeof Info }[]; active: V; onChange: (v: V) => void;
}) {
    return (
        <div role="tablist" aria-label={label} className="inline-flex flex-wrap p-1 rounded-xl bg-black/[0.04] dark:bg-white/5 gap-1">
            {views.map(v => {
                const on = v.id === active;
                const Icon = v.icon;
                return (
                    <button
                        key={v.id}
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(v.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 max-sm:min-h-11 rounded-lg text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none ${
                            on ? 'div-accent-solid text-slate-950' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'}`}
                    >
                        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {v.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Tab dengan pil sub-tampilan di atas; tiap sub-tampilan tetap setinggi layar tanpa scroll di desktop. */
function SubViews<V extends string>({ label, views, active, onChange, children }: {
    label: string; views: { id: V; label: string; icon: typeof Info }[]; active: V; onChange: (v: V) => void; children: React.ReactNode;
}) {
    return (
        <TabShell header={<ViewPills label={label} views={views} active={active} onChange={onChange} />} scroll={false}>
            <ShellCtx.Provider value={true}>
                <div className="lg:h-full lg:min-h-0 lg:overflow-y-auto">{children}</div>
            </ShellCtx.Provider>
        </TabShell>
    );
}

/**
 * Panel geser "Kelola Data": galeri, dokumen, lokasi/footprint, dan PIC proyek (super-admin).
 * Bagian ini tidak ada di panel peta, jadi tidak jadi menu tab.
 */
function KelolaDrawer({ project, view, onView, onClose, isAdmin, isSuperAdmin, onChanged }: {
    project: Project; view: KelolaView; onView: (v: KelolaView) => void; onClose: () => void;
    isAdmin: boolean; isSuperAdmin: boolean; onChanged: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });
    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Pratinjau foto / dialog konfirmasi sedang terbuka: Esc menutup itu dulu, bukan panel ini.
            if (document.querySelectorAll('[role="dialog"]').length > 1) return;
            onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const views: { id: KelolaView; label: string; icon: typeof Info }[] = [
        { id: 'galeri', label: 'Galeri', icon: ImageIcon },
        { id: 'dokumen', label: 'Dokumen', icon: FolderOpen },
        { id: 'lokasi', label: 'Lokasi & Footprint', icon: MapPin },
        ...(isSuperAdmin ? [{ id: 'pic' as const, label: 'PIC Proyek', icon: User }] : []),
    ];
    const active: KelolaView = view === 'pic' && !isSuperAdmin ? 'galeri' : view;

    return (
        <>
            <motion.div
                className="fixed inset-0 z-40 bg-black/60"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
                aria-hidden="true"
            />
            <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label="Kelola data proyek"
                className="fixed inset-y-0 right-0 z-[41] w-full max-w-6xl flex flex-col bg-slate-100 dark:bg-slate-950 border-l border-black/10 dark:border-white/10 shadow-2xl"
                style={getDivisionCssVars(project.division) as React.CSSProperties}
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
            >
                <div className="shrink-0 px-4 py-3 max-sm:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b border-black/5 dark:border-white/10">
                    {/* Baris 1: judul + tombol tutup */}
                    <div className="flex items-center gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Kelola Data</h2>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{project.name}</p>
                        </div>
                        <button
                            ref={closeRef}
                            onClick={onClose}
                            aria-label="Tutup kelola data"
                            title="Tutup (Esc)"
                            className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                        >
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </div>
                    {/* Baris 2: tab pills (scrollable horizontal di mobile) */}
                    <div className="overflow-x-auto">
                        <ViewPills label="Bagian kelola data" views={views} active={active} onChange={onView} />
                    </div>
                </div>
                <ShellCtx.Provider value={true}>
                    <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden overscroll-contain p-3 sm:p-4 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                        <div className="lg:h-full lg:min-h-0">
                            {active === 'galeri' && <GalleryTab project={project} isAdmin={isAdmin} onChanged={onChanged} />}
                            {active === 'dokumen' && <DocumentsTab project={project} isAdmin={isAdmin} onChanged={onChanged} />}
                            {active === 'lokasi' && <LocationTab project={project} isAdmin={isAdmin} onSaved={onChanged} />}
                            {active === 'pic' && isSuperAdmin && (
                                <TabShell><PicPanel projectId={project._id} /></TabShell>
                            )}
                        </div>
                    </div>
                </ShellCtx.Provider>
            </motion.aside>
        </>
    );
}

/**
 * Penanda "terakhir diperbarui" per dimensi data: ikon jam + teks ringkas +
 * tombol (i) yang menampilkan detail lengkap (tanggal + oleh siapa) saat
 * di-hover/klik. Teks "Belum ada catatan pembaruan" bila dimensi belum disimpan.
 */
function UpdatedStamp({ stamp, className = '' }: { stamp: SectionStamp | null; className?: string }) {
    const t = stamp ? formatStampTime(stamp.at) : undefined;
    const actor = stamp?.by ? formatStampActor(stamp.by) : undefined;
    const fullTime = stamp ? formatStampTime(stamp.at, { showYear: true }) : undefined;
    const detail = fullTime
        ? `Terakhir diperbarui ${fullTime}${stamp?.by ? ` oleh ${stamp.by}` : ''}.`
        : 'Dimensi ini belum pernah disimpan. Catatan pembaruan muncul setelah data disimpan sekali.';
    return (
        <span
            className={`text-[11px] font-normal normal-case tracking-normal text-slate-600 dark:text-slate-400 inline-flex items-center gap-1 mt-0.5 min-w-0 max-w-full ${className}`}
            title={detail}
        >
            <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate min-w-0">{t ? `Diperbarui ${t}${actor ? ` · ${actor}` : ''}` : 'Belum ada catatan pembaruan'}</span>
            <InfoTip text={detail} />
        </span>
    );
}
const stampOf = (p: Project, k: ProjectSection): SectionStamp | null => p.sectionUpdates?.[k] ?? null;

function SectionHeader({ title, isAdmin, editing, onEdit, onCancel, onSave, saving, compact = false, stamp }: {
    title: string; isAdmin: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void; saving: boolean; compact?: boolean;
    /** undefined = tidak ditampilkan; null = belum pernah diperbarui. */
    stamp?: SectionStamp | null;
}) {
    const pad = compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5';
    return (
        <div className={`flex items-center justify-between gap-2 min-w-0 ${editing && isAdmin ? 'max-sm:sticky max-sm:top-[calc(var(--ph-h,0px)+0.25rem)] max-sm:z-20 max-sm:-mx-4 max-sm:px-4 max-sm:py-2 max-sm:bg-slate-100/90 dark:max-sm:bg-slate-950/90 max-sm:backdrop-blur max-sm:border-b max-sm:border-black/5 dark:max-sm:border-white/5' : ''}`}>
            <div className="min-w-0 flex-1">
                <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate`}>{title}</h3>
                {stamp !== undefined && <UpdatedStamp stamp={stamp} />}
            </div>
            {isAdmin && (editing ? (
                <div className="flex gap-2 shrink-0">
                    <button onClick={onCancel} aria-label="Batalkan perubahan" className={`${pad} max-sm:min-h-11 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none`}><X className="w-3.5 h-3.5" /> Batal</button>
                    <button onClick={onSave} disabled={saving} aria-label="Simpan perubahan" className={`${pad} max-sm:min-h-11 max-sm:px-5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none`}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                    </button>
                </div>
            ) : (
                <button onClick={onEdit} aria-label={`Edit ${title}`} className={`${pad} max-sm:min-h-11 shrink-0 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none`}><Pencil className="w-3.5 h-3.5" /> Edit</button>
            ))}
        </div>
    );
}

function Field({ label, value, clamp }: { label: string; value?: string; clamp?: number }) {
    return (
        <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">{label}</div>
            <div className={`text-sm text-slate-900 dark:text-white break-words ${clamp ? 'lg:overflow-hidden' : ''}`} style={clamp ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical' } : undefined} title={clamp ? value : undefined}>{value || '-'}</div>
        </div>
    );
}
function MiniField({ label, value, clamp = false }: { label: string; value: string; clamp?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-0.5">{label}</div>
            <div className={`text-xs text-slate-600 dark:text-slate-300 ${clamp ? 'line-clamp-2' : ''}`} title={clamp ? value : undefined}>{value}</div>
        </div>
    );
}
// Kelas label & border bersama untuk kontrol form (terbaca di mobile: min 11px).
const LABEL_CLS = 'text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center';
const controlCls = (invalid: boolean) =>
    `w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border text-slate-900 dark:text-white text-sm outline-none ${
        invalid
            ? 'border-rose-500/60 focus:border-rose-500'
            : 'border-black/10 dark:border-white/10 focus:border-[rgba(var(--div-accent-rgb),0.5)]'
    }`;

/** Pesan galat inline untuk angka di luar rentang (kosong = tidak ada galat). */
function rangeError(value: string, min?: number, max?: number): string | undefined {
    if (value === '' || value == null) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Harus berupa angka';
    if (min != null && n < min) return `Minimal ${min}`;
    if (max != null && n > max) return `Maksimal ${max}`;
    return undefined;
}

function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-1 text-[11px] font-semibold text-rose-500 dark:text-rose-400">{message}</p>
    );
}

function Input({ label, value, onChange, type = 'text', hint, required, error, min, max, step }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string;
    required?: boolean; error?: string; min?: number; max?: number; step?: number | string;
}) {
    const uid = useId();
    const errId = `${uid}-err`;
    // Galat otomatis untuk angka di luar rentang bila tidak ada galat eksplisit.
    const msg = error ?? (type === 'number' ? rangeError(value, min, max) : undefined);
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>
                {label}{required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}{hint && <InfoTip text={hint} />}
            </label>
            <input
                id={uid}
                type={type}
                value={value}
                min={min}
                max={max}
                step={step}
                required={required}
                inputMode={type === 'number' ? 'decimal' : undefined}
                aria-invalid={msg ? true : undefined}
                aria-describedby={msg ? errId : undefined}
                onChange={e => onChange(e.target.value)}
                // Cegah nilai angka berubah tak sengaja saat scroll.
                onWheel={type === 'number' ? (e => (e.target as HTMLInputElement).blur()) : undefined}
                className={controlCls(!!msg)}
            />
            <FieldError id={errId} message={msg} />
        </div>
    );
}

// ── (C) Tooltip penjelasan istilah — ikon "?" kecil di samping label ──────────
function InfoTip({ text, glossary }: { text?: string; glossary?: QhsseGlossary }) {
    const [open, setOpen] = useState(false);
    // Posisi fixed tooltip (dihitung dari rect tombol) — dirender via portal ke
    // document.body supaya tidak terpotong overflow kartu/tab mana pun.
    const [pos, setPos] = useState<{ left: number; top: number; place: 'up' | 'down' } | null>(null);
    const rootRef = useRef<HTMLSpanElement>(null);
    const tipId = useId();

    const W = glossary ? 256 : 224;         // lebar tooltip (w-64 / w-56)
    const GAP = 6;                          // jarak dari tombol

    const show = () => {
        const r = rootRef.current?.getBoundingClientRect();
        if (!r) return;
        const vw = window.innerWidth;
        const half = Math.min(W, vw - 16) / 2;
        const cx = r.left + r.width / 2;
        const left = Math.max(8 + half, Math.min(cx, vw - 8 - half)); // clamp ke viewport
        // Taruh di atas bila ada ruang; kalau mepet (dekat atas layar) taruh di bawah.
        const place: 'up' | 'down' = r.top < 180 ? 'down' : 'up';
        const top = place === 'up' ? r.top - GAP : r.bottom + GAP;
        setPos({ left, top, place });
        setOpen(true);
    };

    // Tutup dengan Esc atau klik/sentuh di luar (penting di layar sentuh).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDown);
        };
    }, [open]);

    return (
        <span ref={rootRef} className="relative inline-flex items-center ml-0.5 align-middle">
            {/* Area sentuh 28px; ikon visual tetap kecil di dalamnya. */}
            <button
                type="button"
                onClick={() => (open ? setOpen(false) : show())}
                onMouseEnter={show}
                onMouseLeave={() => setOpen(false)}
                className="group w-7 h-7 flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                aria-label="Penjelasan istilah"
                aria-expanded={open}
                aria-describedby={open ? tipId : undefined}
            >
                <span className="w-4 h-4 rounded-full bg-black/[0.08] dark:bg-white/10 group-hover:bg-[rgba(var(--div-accent-rgb),0.3)] text-slate-700 dark:text-slate-300 flex items-center justify-center text-[11px] font-black leading-none transition-colors">?</span>
            </button>
            {open && pos && typeof document !== 'undefined' && createPortal(
                <span
                    id={tipId}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: pos.left,
                        top: pos.top,
                        width: W,
                        maxWidth: 'calc(100vw - 16px)',
                        transform: `translateX(-50%) ${pos.place === 'up' ? 'translateY(-100%)' : ''}`,
                    }}
                    className="z-[9999] p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 border border-black/10 dark:border-white/15 shadow-2xl text-xs font-normal normal-case tracking-normal text-slate-700 dark:text-slate-200 leading-snug pointer-events-none"
                >
                    {glossary ? (
                        <span className="block space-y-2">
                            <span className="block">{glossary.definisi}</span>
                            {glossary.rumus && (
                                <span className="block pt-2 border-t border-black/10 dark:border-white/15">
                                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Rumus</span>
                                    <span className="block font-mono text-[11px] text-slate-800 dark:text-slate-100">{glossary.rumus}</span>
                                </span>
                            )}
                        </span>
                    ) : text}
                </span>,
                document.body,
            )}
        </span>
    );
}

// ── (A) Input angka uang: format ribuan live + preview "Rp ..." + tombol cepat ─
// Nilai internal tetap angka polos (string digit). Tampilan diformat ribuan.
// allowNegative (default true): izinkan tanda minus. Nilai dikirim sebagai "-123"; "-" saja = belum diisi
// (pakai numOrNull saat menyimpan). Matikan untuk kolom yang memang tak boleh negatif (mis. nilai kontrak).
function MoneyInput({ label, value, onChange, hint, allowNegative = true }: { label: string; value: string; onChange: (v: string) => void; hint?: string; allowNegative?: boolean }) {
    const uid = useId();
    const digits = (value ?? '').replace(/\D/g, '');
    // Minus yang diketik sebelum angka: induk yang menyimpan angka (mis. DIPA) tidak bisa menyimpan "-",
    // jadi tanda itu ditahan lokal sampai angka pertama diketik.
    const [pendingNeg, setPendingNeg] = useState(false);
    const neg = allowNegative && ((value ?? '').trim().startsWith('-') || (pendingNeg && !digits));
    const sign = neg ? '-' : '';
    const grouped = digits ? sign + Number(digits).toLocaleString('id-ID') : sign;
    const n = digits ? (neg ? -1 : 1) * Number(digits) : 0;

    const setDigits = (raw: string) => {
        const d = raw.replace(/\D/g, '');
        const isNeg = allowNegative && raw.includes('-');
        setPendingNeg(isNeg && !d);
        onChange(isNeg ? `-${d}` : d);
    };
    const mult = (factor: number) => {
        const base = digits ? Number(digits) : 0;
        onChange(sign + String((base || 1) * factor));
    };
    // Tombol ± untuk keyboard HP yang tidak punya tanda minus.
    const toggleSign = () => {
        setPendingNeg(!neg && !digits);
        onChange(neg ? digits : `-${digits}`);
    };

    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}{hint && <InfoTip text={hint} />}</label>
            <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold pointer-events-none">Rp</span>
                <input
                    id={uid}
                    type="text"
                    inputMode={allowNegative ? 'text' : 'numeric'}
                    value={grouped}
                    onChange={e => setDigits(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-mono focus:border-[rgba(var(--div-accent-rgb),0.5)] outline-none"
                />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
                <div className="flex flex-wrap gap-1.5">
                    {allowNegative && <button type="button" onClick={toggleSign} aria-pressed={neg} aria-label={neg ? 'Ubah jadi positif' : 'Ubah jadi negatif (minus)'} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${neg ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300'}`}>± minus</button>}
                    <button type="button" onClick={() => mult(1_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">×1.000</button>
                    <button type="button" onClick={() => mult(1_000_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">× juta</button>
                    <button type="button" onClick={() => mult(1_000_000_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">× miliar</button>
                    {(digits || neg) && <button type="button" onClick={() => onChange('')} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-rose-500/20 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-rose-500 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">bersihkan</button>}
                </div>
                {digits && <span className={`text-xs font-bold font-mono truncate ${n < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatIDRShort(n)}</span>}
            </div>
        </div>
    );
}
function Textarea({ label, value, onChange, maxLength = 10000, required, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number; required?: boolean; rows?: number }) {
    const uid = useId();
    // Penghitung hanya tampil mendekati batas agar form tidak ramai.
    const nearLimit = value.length > maxLength * 0.8;
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}{required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}</label>
            <textarea id={uid} required={required} value={value} onChange={e => onChange(e.target.value)} rows={rows} maxLength={maxLength} className={controlCls(false) + " resize-y"} />
            {nearLimit && <p className="mt-1 text-[11px] text-slate-500 text-right">{value.length.toLocaleString("id-ID")} / {maxLength.toLocaleString("id-ID")} karakter</p>}
        </div>
    );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
    const uid = useId();
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}</label>
            <select id={uid} value={value} onChange={e => onChange(e.target.value)} className={controlCls(false)}>
                {options.map(([v, l]) => <option key={v} value={v} className="bg-white dark:bg-slate-900">{l}</option>)}
            </select>
        </div>
    );
}
function EmptyState({ text, action, compact = false }: { text: string; action?: { label: string; onClick: () => void }; compact?: boolean }) {
    return (
        <div className={`${compact ? 'py-5' : 'py-16'} px-4 text-center text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-sm`}>
            <p>{text}</p>
            {action && (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {action.label}
                </button>
            )}
        </div>
    );
}

// ── CCTV ─────────────────────────────────────────────────────────────────────
function CctvTab({ project }: { project: Project }) {
    const streamManager = useStreamManager();
    const { realtimeStatuses } = useCameraStatusSSE();
    const [playerStatus, setPlayerStatus] = useState<Record<string, 'online' | 'offline'>>({});
    const cams = project.cameras ?? [];
    const statusOf = (c: { _id: string; status: string }) => realtimeStatuses[c._id] ?? playerStatus[c._id] ?? c.status;
    // Kamera offline turun ke bawah; key tetap _id agar stream online tidak remount saat urutan berubah.
    const sorted = [...cams].sort((a, b) => Number(statusOf(b) === 'online') - Number(statusOf(a) === 'online'));
    const online = cams.filter(c => statusOf(c) === 'online').length;

    return (
        <TabShell scroll={false}>
        <SectionCard className="lg:h-full">
            <div className="flex items-center justify-between gap-3 shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">CCTV Proyek</h3>
                {cams.length > 0 && (
                    <span className="text-[11px] font-bold font-mono px-2.5 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/10">
                        <span className="text-emerald-700 dark:text-emerald-400">{online} ON</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-rose-700 dark:text-rose-400">{cams.length - online} OFF</span>
                    </span>
                )}
            </div>
            <Paged
                items={sorted}
                itemH={250}
                cols={cams.length <= 1 ? 1 : 2}
                fixed
                baseClass="grid-cols-1 md:grid-cols-2"
                empty={<EmptyState compact text="Belum ada CCTV terpasang di proyek ini." />}
                render={(cam) => {
                    const isOnline = statusOf(cam) === 'online';
                    return (
                        <div className={`relative h-full max-lg:aspect-video rounded-xl overflow-hidden border bg-black/5 dark:bg-black/60 ${isOnline ? 'border-emerald-500/30' : 'border-black/10 dark:border-white/10'}`}>
                            <div className="absolute top-0 inset-x-0 z-10 p-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-none flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} aria-hidden="true" />
                                    <span className="text-xs font-bold text-white truncate">{cam.name}</span>
                                </span>
                                <span className={`shrink-0 text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${isOnline ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' : 'bg-rose-500/20 text-rose-200 border-rose-400/40'}`}>
                                    {isOnline ? 'Live' : 'Offline'}
                                </span>
                            </div>
                            <div className="w-full h-full flex items-center justify-center">
                                <OptimizedVideoPlayer
                                    cameraId={cam._id}
                                    manager={streamManager}
                                    onStatusChange={(st) => setPlayerStatus(prev => (prev[cam._id] === st ? prev : { ...prev, [cam._id]: st }))}
                                />
                            </div>
                        </div>
                    );
                }}
            />
        </SectionCard>
        </TabShell>
    );
}
// ── Dokumen pendukung ─────────────────────────────────────────────────────────
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.zip,.rar,.7z,.jpg,.jpeg,.png,.webp';

function docTone(name: string) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return { label: 'PDF', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30' };
    if (['doc', 'docx', 'rtf', 'odt', 'txt'].includes(ext)) return { label: ext.toUpperCase(), cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30' };
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return { label: ext.toUpperCase(), cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' };
    if (['ppt', 'pptx', 'odp'].includes(ext)) return { label: ext.toUpperCase(), cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30' };
}
function formatBytes(n?: number) {
    if (n == null) return '';
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function DocumentsTab({ project, isAdmin, onChanged }: { project: Project; isAdmin: boolean; onChanged: () => void }) {
    const docs = project.documents ?? [];
    const { confirm, ConfirmDialog } = useConfirm();
    const doDelete = async (key: string) => {
        try { await axios.delete(`/api/projects/${project._id}?kind=documents&key=${encodeURIComponent(key)}`); toast.success('Dokumen dihapus'); onChanged(); }
        catch { toast.error('Gagal menghapus'); }
    };

    return (
        <TabShell scroll={false}>
        {ConfirmDialog}
        <SectionCard className="lg:h-full">
            <div className="flex items-center justify-between gap-3 shrink-0 min-w-0">
                <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 truncate">Dokumen Pendukung</h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">PDF, Word, Excel, PowerPoint, teks, arsip, dan gambar. Maksimal 25 MB per file, 100 dokumen per proyek.</p>
                    <UpdatedStamp stamp={stampOf(project, 'documents')} />
                </div>
                {isAdmin && <UploadButton projectId={project._id} kind="documents" accept={DOC_ACCEPT} label="Unggah Dokumen" onDone={onChanged} multiple />}
            </div>
            <Paged
                items={docs}
                itemH={64}
                cols={2}
                baseClass="grid-cols-1"
                empty={<EmptyState compact text="Belum ada dokumen." />}
                render={(d) => {
                    const tone = docTone(d.name);
                    return (
                        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/70 dark:bg-slate-950/40 border border-black/5 dark:border-white/5 h-full">
                            <span className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-[11px] font-black ${tone.cls}`}>{tone.label}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={d.name}>{d.name}</p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                    {[formatBytes(d.size), formatDate(d.uploadedAt)].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            {d.url ? (
                                <a href={d.url} download={d.name} aria-label={`Unduh ${d.name}`} className="shrink-0 min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none">
                                    <Download className="w-4 h-4" aria-hidden="true" />
                                </a>
                            ) : (
                                <span className="shrink-0 text-[11px] text-slate-600 dark:text-slate-400 max-w-[6rem] text-right leading-tight">Unduhan khusus PIC dan admin</span>
                            )}
                            {isAdmin && d.key && (
                                <button
                                    onClick={() => confirm('Hapus Dokumen', `"${d.name}" akan dihapus permanen. Lanjutkan?`, () => doDelete(d.key!))}
                                    aria-label={`Hapus ${d.name}`}
                                    className="shrink-0 min-w-9 min-h-9 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"
                                >
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    );
                }}
            />
        </SectionCard>
        </TabShell>
    );
}

function UploadButton({ projectId, kind, accept, label, onDone, multiple = false }: { projectId: string; kind: string; accept: string; label: string; onDone: () => void; multiple?: boolean }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;
        setUploading(true);
        let ok = 0;
        // Berurutan agar server tidak menerima belasan unggahan 25 MB sekaligus.
        for (const file of files) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('kind', kind);
                await axios.post(`/api/projects/${projectId}/upload`, fd);
                ok++;
            } catch (err: unknown) {
                const apiError = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined;
                toast.error(`${file.name}: ${apiError || 'Gagal mengunggah'}`);
            }
        }
        if (ok > 0) {
            toast.success(files.length > 1 ? `${ok} dari ${files.length} file berhasil diunggah` : 'Berhasil diunggah');
            onDone();
        }
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <>
            <input ref={inputRef} aria-label={label} type="file" accept={accept} multiple={multiple} onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {label}
            </button>
        </>
    );
}
