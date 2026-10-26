"use client";

import { useEffect, useState, useCallback, useRef, use, useId } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    ArrowLeft, Loader2, MapPin, FileText, Image as ImageIcon, TrendingUp, Info, LayoutDashboard, Upload, Trash2, Pencil, Check, X,
    User, Building2, Clock, CircleDollarSign, ExternalLink,
    AlertTriangle, Plus, Minus,
    ArrowUpRight, ArrowDownRight, Layers, Target, Wallet, Receipt,
    Menu, GitBranch, ChevronLeft, ChevronRight, BookOpen, CalendarDays
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import type { FootprintPoint } from '@/components/FootprintEditor';
import { getDivisionCssVars } from '@/lib/divisionTheme';
import { computeEvm, derivedFromLaporan, isLaporanFresh, latestLaporan, periodeLabel, type LaporanBulanan, type RencanaKurvaS } from '@/lib/projectReport';
import LaporanBulananTab from '@/components/project/LaporanBulananTab';
import DashboardRingkasan from '@/components/project/DashboardRingkasan';

// Leaflet butuh browser (window) -> muat hanya di klien.
const FootprintEditor = dynamic(() => import('@/components/FootprintEditor'), {
    ssr: false,
    loading: () => (
        <div className="h-[360px] rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" aria-label="Memuat peta" />
    ),
});

type Tab =
    | 'summary'
    | 'ikhtiar'
    | 'finansial'
    | 'operasi'
    | 'changemgmt'
    | 'issues'
    | 'laporan'
    | 'info' | 'location' | 'contract' | 'progress' | 'gallery';

interface GalleryItem { key: string; caption?: string; uploadedAt: string; url: string | null; }
interface Milestone { title: string; done: boolean; date?: string; progress?: number; }
interface HasilUsaha { pendapatan: number; biaya: number; laba: number; }
interface ProgressKeuangan { tahun: number; rencana: number; realisasi: number; }
interface SumberDaya { namaAlat: string; jumlah: number; kategori?: string; satuan?: string; }
interface IsuStrategis { isu: string; usulan: string; }
interface Kendala { masalah: string; penyebab: string; tindakan: string; harapan?: string; target?: string; pic?: string; status: 'OPEN' | 'CLOSED' | 'ON_PROGRESS'; }
type ChangeJenis = 'PERUBAHAN_HARGA' | 'PERUBAHAN_LINGKUP' | 'KLAIM' | 'LEGAL_ISSUE' | 'LAINNYA';
interface ChangeManagement { judul: string; jenis?: ChangeJenis; deskripsi?: string; dampak?: string; mitigasi?: string; nilai?: number; tanggal?: string; target?: string; pic?: string; status: 'USULAN' | 'DISETUJUI' | 'DITOLAK'; dariKendala?: boolean; }
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
    // Progress keuangan
    progressKeuangan?: ProgressKeuangan[];
    tagihanBelumDiproses?: number;
    // Operasional
    lingkupPekerjaan?: string[];
    sumberDaya?: SumberDaya[];
    monitoringPengadaan?: MonitoringPengadaan[];
    isuStrategis?: IsuStrategis[];
    kendala?: Kendala[];
    changeManagement?: ChangeManagement[];
    laporanBulanan?: LaporanBulanan[];
    rencanaKurvaS?: RencanaKurvaS[];
    cashInAwal?: number;
    cashOutAwal?: number;
    milestones?: Milestone[];
    gallery?: GalleryItem[];
    cameras?: { _id: string; name: string; status: string }[];
    progressMinggu?: ProgressMinggu[];
    // Kontrol akses (dihitung server) — gating kosmetik; server tetap penegak.
    access?: { canEdit: boolean; isSuperAdmin: boolean; isPic: boolean };
    // Timestamp (dikirim sebagai JSON string dari API)
    createdAt?: string;
    updatedAt?: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
    planning: { label: 'Perencanaan', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    ongoing: { label: 'Berjalan', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
    completed: { label: 'Selesai', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};
const KENDALA_STATUS: Record<string, { label: string; color: string }> = {
    OPEN: { label: 'OPEN', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    ON_PROGRESS: { label: 'ON PROGRESS', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
    CLOSED: { label: 'CLOSED', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

interface TabItem { id: Tab; label: string; icon: typeof Info }
interface TabGroup { group: string; items: TabItem[] }

const TAB_GROUPS: TabGroup[] = [
    {
        group: 'Beranda',
        items: [
            { id: 'summary', label: 'Beranda', icon: LayoutDashboard },
        ],
    },
    {
        group: 'Ringkasan',
        items: [
            { id: 'ikhtiar', label: 'Ringkasan', icon: Target },
        ],
    },
    {
        group: 'Finansial',
        items: [
            { id: 'finansial', label: 'Cash & Keuangan', icon: Wallet },
        ],
    },
    {
        group: 'Operasi',
        items: [
            { id: 'operasi', label: 'Operasi', icon: Layers },
        ],
    },
    {
        group: 'Laporan',
        items: [
            { id: 'laporan', label: 'Laporan Bulanan', icon: CalendarDays },
        ],
    },
    {
        group: 'Change',
        items: [
            { id: 'changemgmt', label: 'Change Management', icon: GitBranch },
        ],
    },
    {
        group: 'Kendala',
        items: [
            { id: 'issues', label: 'Isu & Kendala', icon: AlertTriangle },
        ],
    },
    {
        group: 'Lainnya',
        items: [
            { id: 'info',      label: 'Informasi', icon: Info },
            { id: 'location',  label: 'Lokasi',    icon: MapPin },
            { id: 'contract',  label: 'Kontrak',   icon: FileText },
            { id: 'progress',  label: 'Progres',   icon: TrendingUp },
            { id: 'gallery',   label: 'Galeri',    icon: ImageIcon },
        ],
    },
];

const ALL_TABS: TabItem[] = TAB_GROUPS.flatMap(g => g.items);

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
function PhoneTabStrip({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
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
                {ALL_TABS.map(t => {
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
function formatIDRShort(v?: number) {
    if (v == null) return '-';
    if (v >= 1_000_000_000_000) return `Rp ${(v / 1_000_000_000_000).toFixed(2)} T`;
    if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(2)} M`;
    if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} Jt`;
    return formatIDR(v);
}
function formatDate(d?: string) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function pct(n?: number) { return `${(n ?? 0).toFixed(2)}%`; }

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
    const [tab, setTab] = useState<Tab>('summary');
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
    const activeLabel = ALL_TABS.find(t => t.id === tab)?.label ?? '';

    // Kemampuan edit berbasis akses nyata (super-admin atau PIC) — dari server.
    const canEdit = project.access?.canEdit ?? false;
    const isSuperAdmin = project.access?.isSuperAdmin ?? false;

    const selectTab = (t: Tab) => { setTab(t); setSidebarOpen(false); };

    const sidebarNav = (
        <nav className="space-y-5">
            {TAB_GROUPS.map(grp => (
                <div key={grp.group}>
                    <div className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-600">{grp.group}</div>
                    <div className="space-y-0.5">
                        {grp.items.map(t => {
                            const Icon = t.icon;
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => selectTab(t.id)}
                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full max-sm:min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                                        active
                                            ? 'bg-[rgba(var(--div-accent-rgb),0.15)] div-accent-text border border-[rgba(var(--div-accent-rgb),0.3)]'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 shrink-0" /> {t.label}
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
            <header ref={trackHeaderHeight} className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5">
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
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 max-sm:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] max-sm:pb-3 flex items-center gap-3">
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
                                    Terakhir diperbarui: {new Date(project.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                            )}
                        </div>
                    </div>
                    <a
                        href="/Panduan-Input-Detail-Proyek.pdf?v=20261024"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Buka panduan pengisian (PDF)"
                        className="max-sm:hidden p-3 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                    >
                        <BookOpen className="w-5 h-5" aria-hidden="true" />
                    </a>
                    <ThemeToggle />
                    <button
                        onClick={() => {
                            const divisionParam = project.division ? `&division=${encodeURIComponent(project.division)}` : '';
                            router.push(`/map?category=${encodeURIComponent(project.category)}${divisionParam}`);
                        }}
                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text text-sm font-bold hover:bg-[rgba(var(--div-accent-rgb),0.2)] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                        <MapPin className="w-4 h-4" /> Lihat di Peta
                    </button>
                </div>
                <PhoneTabStrip tab={tab} onSelect={selectTab} />
            </header>

            <div className="relative z-[1] max-w-7xl mx-auto px-4 sm:px-8 py-6 flex gap-6">
                {/* Sidebar (desktop) */}
                <aside className="hidden lg:block w-60 shrink-0">
                    <div className="sticky top-24 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/50 border border-black/5 dark:border-white/5">
                        {sidebarNav}
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
                                {sidebarNav}
                                {/* Phone: aksi header yang disembunyikan di layar kecil dipindah ke sini */}
                                <div className="sm:hidden mt-5 pt-4 border-t border-black/10 dark:border-white/10 space-y-2">
                                    <button
                                        onClick={() => {
                                            const divisionParam = project.division ? `&division=${encodeURIComponent(project.division)}` : '';
                                            router.push(`/map?category=${encodeURIComponent(project.category)}${divisionParam}`);
                                        }}
                                        className="w-full min-h-11 flex items-center gap-2.5 px-3 rounded-xl text-sm font-bold bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    >
                                        <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" /> Lihat di Peta
                                    </button>
                                    <a
                                        href="/Panduan-Input-Detail-Proyek.pdf?v=20261024"
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
                    <div className="mb-4 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest lg:hidden max-sm:hidden">
                        {activeLabel}
                    </div>
                    <AnimatePresence mode="wait">
                        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                            {tab === 'summary'    && <SummaryTab project={project} status={status} onlineCams={onlineCams} onGoTab={selectTab} />}
                            {tab === 'ikhtiar'    && <IkhtiarTab project={project} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} />}
                            {tab === 'finansial'  && <FinansialTab project={project} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} />}
                            {tab === 'operasi'    && <OperasiTab project={project} isAdmin={canEdit} onSaved={fetchProject} onGoTab={selectTab} />}
                            {tab === 'laporan'    && <LaporanBulananTab projectId={project._id} laporan={project.laporanBulanan ?? []} rencana={project.rencanaKurvaS ?? []} saldoAwal={{ cashInAwal: project.cashInAwal, cashOutAwal: project.cashOutAwal }} contractValue={project.contractValue} onGoContract={() => selectTab('contract')} isAdmin={canEdit} onSaved={fetchProject} errorMessage={saveErrorMessage} />}
                            {tab === 'changemgmt' && <ChangeManagementTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                            {tab === 'issues'     && <IssuesTab project={project} isAdmin={canEdit} onSaved={fetchProject} onToChangeMgmt={() => setTab('changemgmt')} />}
                            {tab === 'info'       && <InfoTab project={project} isAdmin={canEdit} isSuperAdmin={isSuperAdmin} onSaved={fetchProject} />}
                            {tab === 'location'   && <LocationTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                            {tab === 'contract'   && <ContractTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                            {tab === 'progress'   && <ProgressTab project={project} isAdmin={canEdit} onSaved={fetchProject} />}
                            {tab === 'gallery'    && <GalleryTab project={project} isAdmin={canEdit} onChanged={fetchProject} />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
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

function IndexGauge({ title, hint, value, kind }: { title: string; hint: string; value?: number; kind: 'cpi' | 'spi' }) {
    const meta = kind === 'cpi' ? cpiStatus(value) : spiStatus(value);
    return (
        <div className="p-6 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 div-accent-text" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">{hint}</p>
            <div className="text-5xl font-black text-slate-900 dark:text-white leading-none mb-3">
                {value != null ? value.toFixed(2) : '—'}
            </div>
            <span className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${meta.color}`}>{meta.label}</span>
        </div>
    );
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

function IkhtiarTab({ project, isAdmin, onSaved, onGoTab }: { project: Project; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Tab) => void }) {
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

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                ...(cpiLocked ? {} : { cpi: form.cpi === '' ? undefined : Number(form.cpi) }),
                ...(spiLocked ? {} : { spi: form.spi === '' ? undefined : Number(form.spi) }),
            });
            toast.success('Ringkasan tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Ringkasan: CPI / SPI" isAdmin={isAdmin && !(cpiLocked && spiLocked)} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setForm({ cpi: project.cpi?.toString() ?? '', spi: project.spi?.toString() ?? '' }); setEditing(false); }} onSave={save} saving={saving} />
            {anyLocked && <DerivedNote what={cpiLocked && spiLocked ? 'CPI dan SPI' : cpiLocked ? 'CPI' : 'SPI'} periode={latest?.periode} onGo={isAdmin ? () => onGoTab('laporan') : undefined} />}
            {!editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <IndexGauge title="CPI" hint="Cost Performance Index (kinerja biaya)" value={project.cpi} kind="cpi" />
                    <IndexGauge title="SPI" hint="Schedule Performance Index (kinerja jadwal)" value={project.spi} kind="spi" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cpiLocked ? (
                        <IndexGauge title="CPI" hint="Cost Performance Index (kinerja biaya)" value={project.cpi} kind="cpi" />
                    ) : (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                            <Input label="CPI (mis. 1.02)" type="number" min={0} max={5} step="0.01" value={form.cpi} onChange={v => setForm({ ...form, cpi: v })} hint="Cost Performance Index — nilai kinerja biaya dari laporan EVA. 1 ke atas = hemat/efisien, di bawah 1 = boros." />
                            <p className="mt-2 text-[11px] text-slate-500">≥ 1 = biaya efisien, &lt; 1 = over budget.</p>
                        </div>
                    )}
                    {spiLocked ? (
                        <IndexGauge title="SPI" hint="Schedule Performance Index (kinerja jadwal)" value={project.spi} kind="spi" />
                    ) : (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                            <Input label="SPI (mis. 0.98)" type="number" min={0} max={5} step="0.01" value={form.spi} onChange={v => setForm({ ...form, spi: v })} hint="Schedule Performance Index — nilai kinerja jadwal dari laporan EVA. 1 ke atas = sesuai/lebih cepat, di bawah 1 = terlambat." />
                            <p className="mt-2 text-[11px] text-slate-500">≥ 1 = sesuai/lebih cepat jadwal, &lt; 1 = terlambat.</p>
                        </div>
                    )}
                </div>
            )}
            {(evm.cv !== undefined || evm.sv !== undefined) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MoneyCard label="CV: Cost Variance (BCWP − ACWP)" value={evm.cv} icon={CircleDollarSign} tone={(evm.cv ?? 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} />
                    <MoneyCard label="SV: Schedule Variance (BCWP − BCWS)" value={evm.sv} icon={CircleDollarSign} tone={(evm.sv ?? 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} />
                </div>
            )}
            <DashboardRingkasan project={project} canEdit={isAdmin} onGoLaporan={() => onGoTab('laporan')} />
        </div>
    );
}

// ── Finansial (ringkas) ───────────────────────────────────────────────────────
function MoneyCard({ label, value, icon: Icon, tone }: { label: string; value?: number; icon: typeof Wallet; tone: string }) {
    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${tone}`}><Icon className="w-4 h-4" /></div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 dark:text-slate-400">{label}</span>
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono truncate">{formatIDRShort(value)}</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate">{value != null ? formatIDR(value) : ''}</div>
        </div>
    );
}

function FinansialTab({ project, isAdmin, onSaved, onGoTab }: { project: Project; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Tab) => void }) {
    const [editing, setEditing] = useState(false);
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
    const isKendari = Boolean(project.name?.toLowerCase().includes('kendari'));
    const initForm = () => ({
        tagihanBruto: project.tagihanBruto?.toString() ?? (isKendari ? '49000000000' : ''),
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
    });
    const [form, setForm] = useState(initForm);
    const [saving, setSaving] = useState(false);

    const resetForm = () => setForm(initForm());

    // Saldo kas otomatis bila belum diisi manual.
    const autoSaldoKas = (Number(form.cashIn) || 0) - (Number(form.cashOut) || 0);
    const displaySaldoKas = project.saldoKas ?? ((project.cashIn ?? 0) - (project.cashOut ?? 0));
    const displayTagihanBruto = project.tagihanBruto ?? (isKendari ? 49_000_000_000 : undefined);

    const save = async () => {
        setSaving(true);
        try {
            const huP = form.huPendapatan === '' ? null : Number(form.huPendapatan);
            const huB = form.huBiaya === '' ? null : Number(form.huBiaya);
            await axios.patch(`/api/projects/${project._id}`, {
                ...(tagihanLocked ? {} : { tagihanBruto: form.tagihanBruto === '' ? undefined : Number(form.tagihanBruto) }),
                ...(cashInLocked ? {} : { cashIn: form.cashIn === '' ? undefined : Number(form.cashIn) }),
                ...(cashOutLocked ? {} : { cashOut: form.cashOut === '' ? undefined : Number(form.cashOut) }),
                ...((cashInLocked && cashOutLocked) ? {} : { saldoKas: form.saldoKas === '' ? autoSaldoKas : Number(form.saldoKas) }),
                ...(hutangLocked ? {} : { saldoHutang: form.saldoHutang === '' ? undefined : Number(form.saldoHutang) }),
                ...(badLocked ? {} : { bad: form.bad === '' ? undefined : Number(form.bad) }),
                ...(piutangLocked ? {} : { piutang: form.piutang === '' ? undefined : Number(form.piutang) }),
                ...(cccLocked ? {} : { ccc: form.ccc === '' ? undefined : Number(form.ccc) }),
                ...(huLocked ? {} : {
                    hasilUsaha: (huP != null || huB != null)
                        ? { pendapatan: huP ?? 0, biaya: huB ?? 0, laba: (huP ?? 0) - (huB ?? 0) }
                        : undefined,
                }),
                progressKeuangan: form.progressKeuangan,
                tagihanBelumDiproses: form.tagihanBelumDiproses === '' ? undefined : Number(form.tagihanBelumDiproses),
            });
            toast.success('Finansial tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Finansial" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { resetForm(); setEditing(false); }} onSave={save} saving={saving} />

            {(tagihanLocked || huLocked || cashInLocked || cashOutLocked || posisiLocked) && (
                <DerivedNote
                    what={[tagihanLocked && 'Tagihan bruto', huLocked && 'hasil usaha', (cashInLocked || cashOutLocked) && 'cash in/out', posisiLocked && 'saldo hutang, BAD, piutang, CCC'].filter(Boolean).join(', ')}
                    periode={latestLap?.periode}
                    tail="Tidak diisi di tab ini. Hutang, BAD, piutang, dan CCC tetap tampil di bawah; sisanya di Ringkasan."
                    onGo={isAdmin ? () => onGoTab('laporan') : undefined}
                />
            )}
            {!editing ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!tagihanLocked && <MoneyInput label="Tagihan Bruto" value={form.tagihanBruto} onChange={v => setForm({ ...form, tagihanBruto: v })} hint="Total tagihan bruto proyek (Rp)." />}
                    {!cashInLocked && <MoneyInput label="Cash In" value={form.cashIn} onChange={v => setForm({ ...form, cashIn: v })} hint="Total uang yang sudah masuk/diterima proyek." />}
                    {!cashOutLocked && <MoneyInput label="Cash Out" value={form.cashOut} onChange={v => setForm({ ...form, cashOut: v })} hint="Total uang yang sudah keluar/dibelanjakan." />}
                    {/* Saldo kas = cash in − cash out; bila keduanya dari Laporan Bulanan, dihitung otomatis dan tidak diisi. */}
                    {!(cashInLocked && cashOutLocked) && (
                        <div>
                            <MoneyInput label="Saldo Kas (kosongkan = otomatis)" value={form.saldoKas} onChange={v => setForm({ ...form, saldoKas: v })} hint="Sisa kas. Dikosongkan = dihitung otomatis dari Cash In − Cash Out." />
                            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">Otomatis: {formatIDR(autoSaldoKas)}</p>
                        </div>
                    )}
                    {!hutangLocked && <MoneyInput label="Saldo Hutang" value={form.saldoHutang} onChange={v => setForm({ ...form, saldoHutang: v })} hint="Total hutang proyek saat ini." />}
                    {!badLocked && <MoneyInput label="BAD" value={form.bad} onChange={v => setForm({ ...form, bad: v })} hint="Beban yang Akan Dibayar — bagian dari hutang (lihat laporan cashflow)." />}
                    {!piutangLocked && <MoneyInput label="Piutang" value={form.piutang} onChange={v => setForm({ ...form, piutang: v })} hint="Uang yang masih ditunggu/belum dibayar ke proyek." />}
                    {!cccLocked && <div>
                        <Input label="CCC (hari)" type="number" min={0} max={3650} step={1} value={form.ccc} onChange={v => setForm({ ...form, ccc: v })} hint="Cash Conversion Cycle — lama perputaran kas dalam hari. Di atas 90 hari ditandai merah." />
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

            {/* Progress keuangan per DIPA */}
            {!editing ? (
                <div className="pt-2">
                    <ProgressKeuanganCard
                        progressKeuangan={project.progressKeuangan || []}
                        tagihanBelumDiproses={project.tagihanBelumDiproses}
                    />
                </div>
            ) : (
                <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Progress Keuangan (DIPA)</h3>
                        <button onClick={() => setForm(f => ({ ...f, progressKeuangan: [...f.progressKeuangan, { tahun: new Date().getFullYear(), rencana: 0, realisasi: 0 }] }))}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                            <Plus className="w-3.5 h-3.5" /> Tambah Tahun
                        </button>
                    </div>
                    {form.progressKeuangan.length === 0
                        ? <p className="text-sm text-slate-500 italic">Belum ada data DIPA.</p>
                        : form.progressKeuangan.map((pk, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
                                <Input label="Tahun" type="number" min={2000} max={2100} step={1} value={String(pk.tahun ?? "")} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], tahun: Number(v) }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                                <MoneyInput label="Pagu/Rencana" value={pk.rencana ? String(pk.rencana) : ""} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], rencana: Number(v) || 0 }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                                <MoneyInput label="Realisasi" value={pk.realisasi ? String(pk.realisasi) : ""} onChange={v => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], realisasi: Number(v) || 0 }; setForm(f => ({ ...f, progressKeuangan: a })); }} />
                                <button type="button" aria-label={`Hapus data tahun ${pk.tahun}`} onClick={() => setForm(f => ({ ...f, progressKeuangan: f.progressKeuangan.filter((_, j) => j !== i) }))} className="sm:col-span-3 justify-self-end inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                                    <Minus className="w-4 h-4" aria-hidden="true" /> Hapus tahun ini
                                </button>
                            </div>
                        ))
                    }
                    <MoneyInput label="Progress Belum Ditagihkan" value={form.tagihanBelumDiproses} onChange={v => setForm(f => ({ ...f, tagihanBelumDiproses: v }))} />
                </div>
            )}
        </div>
    );
}

// ── Operasi (Kinerja Operasi + Progress Mingguan W1-W4 + Milestone + Sumber Daya) ──────────
function OperasiTab({ project, isAdmin, onSaved, onGoTab }: { project: Project; isAdmin: boolean; onSaved: () => void; onGoTab: (t: Tab) => void }) {
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

    const reduceMotion = useReducedMotion();

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
            const puV = kinerjaForm.pu === '' ? null : Number(kinerjaForm.pu);
            const bkV = kinerjaForm.bk === '' ? null : Number(kinerjaForm.bk);
            await axios.patch(`/api/projects/${project._id}`, puLocked
                ? { bk: bkV ?? undefined }   // PU dari laporan; server menghitung LK = PU − BK
                : {
                    pu: puV ?? undefined,
                    bk: bkV ?? undefined,
                    lk: (puV != null && bkV != null) ? puV - bkV : undefined,
                });
            toast.success('Kinerja Operasi tersimpan');
            setEditingKinerja(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSavingKinerja(false); }
    };

    const saveMinggu = async () => {
        setSavingMinggu(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { progressMinggu: mingguList });
            toast.success('Progress mingguan tersimpan');
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

    const groupedSd = sumberDaya.reduce<Record<string, { item: SumberDaya; idx: number }[]>>((acc, sd, idx) => {
        const key = (sd.kategori || '').trim() || 'Lainnya';
        (acc[key] ||= []).push({ item: sd, idx });
        return acc;
    }, {});

    const lk = project.lk ?? ((project.pu ?? 0) - (project.bk ?? 0));
    const rugiKinerja = lk < 0;
    const marginKinerja = (project.pu && project.pu > 0) ? (lk / project.pu) * 100 : null;

    // W1-W4 visual chart helper
    const WEEKS = ['W1', 'W2', 'W3', 'W4'] as const;
    type WKey = typeof WEEKS[number];
    const getW = (row: ProgressMinggu, w: WKey, type: 'Ra' | 'Ri') => {
        const key = `${w.toLowerCase()}${type}` as keyof ProgressMinggu;
        return (row[key] as number) ?? 0;
    };

    return (
        <div className="space-y-8">

            {/* ── 1. KINERJA OPERASI PU / BK / LK ── */}
            <div className="space-y-4">
                <SectionHeader
                    title="Kinerja Operasi (PU / BK / LK)"
                    isAdmin={isAdmin}
                    editing={editingKinerja}
                    onEdit={() => setEditingKinerja(true)}
                    onCancel={() => { setKinerjaForm({ pu: project.pu?.toString() ?? '', bk: project.bk?.toString() ?? '' }); setEditingKinerja(false); }}
                    onSave={saveKinerja}
                    saving={savingKinerja}
                />
                {puLocked && <DerivedNote what="PU (pendapatan s.d bulan ini)" periode={latestLap?.periode} onGo={isAdmin ? () => onGoTab('laporan') : undefined} />}
                {!editingKinerja ? (
                    (project.pu != null || project.bk != null || project.lk != null) ? (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400">Hasil kinerja operasi proyek periode berjalan.</span>
                                {marginKinerja != null && (
                                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${rugiKinerja ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                        LK {marginKinerja.toFixed(1)}%
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
                                <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center space-y-1">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">PU</div>
                                    <div className="text-base font-black text-sky-400 font-mono">{formatIDRShort(project.pu)}</div>
                                    <div className="text-[11px] text-slate-500 font-mono break-all">{project.pu != null ? formatIDR(project.pu) : ''}</div>
                                </div>
                                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center space-y-1">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">BK</div>
                                    <div className="text-base font-black text-rose-400 font-mono">{formatIDRShort(project.bk)}</div>
                                    <div className="text-[11px] text-slate-500 font-mono break-all">{project.bk != null ? formatIDR(project.bk) : ''}</div>
                                </div>
                                <div className={`p-4 rounded-xl text-center border space-y-1 ${rugiKinerja ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{rugiKinerja ? 'LK (Rugi)' : 'LK'}</div>
                                    <div className={`text-base font-black font-mono ${rugiKinerja ? 'text-rose-400' : 'text-emerald-400'}`}>{formatIDRShort(lk)}</div>
                                    <div className="text-[11px] text-slate-500 font-mono break-all">{formatIDR(lk)}</div>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold border-t border-black/5 dark:border-white/5 pt-3">
                                PU · Pendapatan Usaha &nbsp;·&nbsp; BK · Beban Konstruksi &nbsp;·&nbsp; LK · Laba Kotor
                            </p>
                        </div>
                    ) : <EmptyState text="Belum ada data Kinerja Operasi (PU / BK / LK)." />
                ) : (
                    <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {puLocked
                                ? <MoneyCard label="PU (dari Laporan Bulanan)" value={project.pu} icon={CircleDollarSign} tone="bg-sky-500/10 border-sky-500/20 text-sky-400" />
                                : <MoneyInput label="PU: Pendapatan Usaha" value={kinerjaForm.pu} onChange={v => setKinerjaForm({ ...kinerjaForm, pu: v })} hint="Pendapatan usaha dari sisi operasi proyek (IDR)." />}
                            <MoneyInput label="BK: Beban Konstruksi" value={kinerjaForm.bk} onChange={v => setKinerjaForm({ ...kinerjaForm, bk: v })} hint="Beban/biaya konstruksi operasi (IDR)." />
                        </div>
                        <p className="text-[11px] text-slate-500">LK (Laba Kotor) dihitung otomatis: {formatIDR(((puLocked ? project.pu : Number(kinerjaForm.pu)) || 0) - (Number(kinerjaForm.bk) || 0))}</p>
                    </div>
                )}
            </div>

            {/* ── 2. PROGRESS MINGGUAN W1–W4 RA/RI ── */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Mingguan (W1–W4) · RA / RI</h3>
                    {isAdmin && (editingMinggu ? (
                        <div className="flex gap-2">
                            <button onClick={() => { setMingguList(project.progressMinggu ?? []); setEditingMinggu(false); }} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveMinggu} disabled={savingMinggu} className="px-3 py-2 max-sm:min-h-11 max-sm:px-4 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">{savingMinggu ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => setMingguList(s => [...s, { bulan: '', tahun: new Date().getFullYear(), w1Ra: 0, w1Ri: 0, w2Ra: 0, w2Ri: 0, w3Ra: 0, w3Ri: 0, w4Ra: 0, w4Ri: 0 }])} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Plus className="w-3.5 h-3.5" /> Tambah Bulan</button>
                            <button onClick={() => setEditingMinggu(true)} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        </div>
                    ))}
                </div>

                {mingguList.length === 0 && !editingMinggu
                    ? <EmptyState text={isAdmin ? "Belum ada data progress mingguan. Klik '+ Tambah Bulan' untuk mengisi." : "Belum ada data progress mingguan. Klik '+ Tambah Bulan' untuk mengisi. Belum diisi oleh PIC proyek."} action={isAdmin ? { label: "Isi sekarang", onClick: () => setEditingMinggu(true) } : undefined} />
                    : editingMinggu ? (
                        <div className="space-y-4">
                            {mingguList.map((row, i) => (
                                <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <input aria-label="Bulan (mis. Oktober 2026)" placeholder="Bulan (mis. Oktober 2026)" value={row.bulan} onChange={e => { const a = [...mingguList]; a[i] = { ...a[i], bulan: e.target.value }; setMingguList(a); }} className="flex-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        <input aria-label="Tahun" type="number" placeholder="Tahun" value={row.tahun} onChange={e => { const a = [...mingguList]; a[i] = { ...a[i], tahun: Number(e.target.value) }; setMingguList(a); }} className="w-24 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        <button onClick={() => setMingguList(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                                    </div>
                                    <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-2">
                                        {WEEKS.map(w => (
                                            <div key={w} className="space-y-2">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 text-center">{w}</div>
                                                <div className="space-y-1">
                                                    <div>
                                                        <label className="text-[11px] text-sky-400 font-bold uppercase">RA (%)</label>
                                                        <input aria-label="Rencana (Ra) minggu" type="number" min={0} max={100} step={0.01} value={getW(row, w, 'Ra')} onChange={e => { const a = [...mingguList]; (a[i] as unknown as Record<string, number>)[`${w.toLowerCase()}Ra`] = Number(e.target.value); setMingguList(a); }} className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-sky-500/20 text-slate-900 dark:text-white text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-sky-500/50" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] text-amber-400 font-bold uppercase">RI (%)</label>
                                                        <input aria-label="Realisasi (Ri) minggu" type="number" min={0} max={100} step={0.01} value={getW(row, w, 'Ri')} onChange={e => { const a = [...mingguList]; (a[i] as unknown as Record<string, number>)[`${w.toLowerCase()}Ri`] = Number(e.target.value); setMingguList(a); }} className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-amber-500/20 text-slate-900 dark:text-white text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-amber-500/50" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {mingguList.map((row, i) => (
                                <div key={i} className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">{row.bulan || `Bulan ${i+1}`}</div>
                                            {row.tahun && <div className="text-[11px] text-slate-500 font-mono">Tahun {row.tahun}</div>}
                                        </div>
                                        <div className="flex gap-2 text-[11px] font-bold">
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> RA (Rencana)</span>
                                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> RI (Realisasi)</span>
                                        </div>
                                    </div>
                                    {/* Bar chart visual */}
                                    <div className="grid grid-cols-4 gap-3">
                                        {WEEKS.map(w => {
                                            const ra = getW(row, w, 'Ra');
                                            const ri = getW(row, w, 'Ri');
                                            const ahead = ri >= ra;
                                            const deviasi = ri - ra;
                                            return (
                                                <div key={w} className="space-y-2">
                                                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 text-center">{w}</div>
                                                    {/* Visual stacked bar */}
                                                    <div className="relative h-20 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 overflow-hidden flex flex-col justify-end">
                                                        {/* RA bar */}
                                                        <div
                                                            className="absolute bottom-0 left-0 right-0 bg-sky-500/20 border-t border-sky-500/40 transition-all duration-700"
                                                            style={{ height: `${Math.min(ra, 100)}%` }}
                                                        />
                                                        {/* RI bar */}
                                                        <motion.div
                                                            className={`absolute bottom-0 left-0 w-1/2 transition-all duration-700 ${ahead ? 'bg-emerald-500/60' : 'bg-rose-500/60'}`}
                                                            initial={{ height: 0 }}
                                                            animate={{ height: `${Math.min(ri, 100)}%` }}
                                                            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                                                        />
                                                    </div>
                                                    <div className="text-center space-y-0.5">
                                                        <div className="text-[11px] text-sky-400 font-mono font-bold">{ra.toFixed(1)}%</div>
                                                        <div className={`text-[11px] font-mono font-bold ${ahead ? 'text-emerald-400' : 'text-rose-400'}`}>{ri.toFixed(1)}%</div>
                                                        <div className={`text-[11px] font-bold ${ahead ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {deviasi >= 0 ? '+' : ''}{deviasi.toFixed(1)}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Tabel ringkas */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-black/5 dark:border-white/5">
                                                    <th className="py-1.5 px-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Minggu</th>
                                                    <th className="py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wider text-sky-400">RA (%)</th>
                                                    <th className="py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wider text-amber-400">RI (%)</th>
                                                    <th className="py-1.5 px-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Deviasi</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {WEEKS.map(w => {
                                                    const ra = getW(row, w, 'Ra');
                                                    const ri = getW(row, w, 'Ri');
                                                    const dev = ri - ra;
                                                    return (
                                                        <tr key={w} className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                                                            <td className="py-1.5 px-2 font-bold text-slate-700 dark:text-slate-200">{w}</td>
                                                            <td className="py-1.5 px-2 text-center font-mono text-sky-400 font-bold">{ra.toFixed(2)}</td>
                                                            <td className="py-1.5 px-2 text-center font-mono text-amber-400 font-bold">{ri.toFixed(2)}</td>
                                                            <td className={`py-1.5 px-2 text-center font-mono font-bold ${dev >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{dev >= 0 ? '+' : ''}{dev.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }
            </div>

            {/* ── 3. MILESTONE ── */}
            <div className="space-y-4">
                <SectionHeader title="Milestone" isAdmin={isAdmin} editing={editingMs} onEdit={() => setEditingMs(true)} onCancel={() => { setMsList(project.milestones ?? []); setEditingMs(false); }} onSave={saveMs} saving={savingMs} />

                {msList.length > 0 && (
                    <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                        <div className="flex justify-between items-center mb-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Progress Keseluruhan</span>
                            <span className="text-slate-900 dark:text-white font-bold">{overallMs.toFixed(0)}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-emerald-500 transition-all duration-500" style={{ width: `${overallMs}%` }} />
                        </div>
                    </div>
                )}

                {editingMs && (
                    <button onClick={() => setMsList(s => [...s, { title: '', done: false, progress: 0 }])} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                        <Plus className="w-3.5 h-3.5" /> Tambah Milestone
                    </button>
                )}

                {msList.length === 0 && !editingMs
                    ? <EmptyState text={isAdmin ? "Belum ada milestone." : "Belum ada milestone. Belum diisi oleh PIC proyek."} action={isAdmin ? { label: "Isi sekarang", onClick: () => setEditingMs(true) } : undefined} />
                    : editingMs
                    ? (
                        <div className="space-y-3">
                            {msList.map((m, i) => (
                                <div key={i} className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                                    <div className="flex gap-2 items-center">
                                        <input aria-label="Judul milestone" placeholder="Judul milestone" value={m.title} onChange={e => { const a = [...msList]; a[i] = { ...a[i], title: e.target.value }; setMsList(a); }} className="flex-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        <input aria-label="Tanggal milestone" type="date" value={typeof m.date === 'string' ? m.date.slice(0, 10) : ''} onChange={e => { const a = [...msList]; a[i] = { ...a[i], date: e.target.value }; setMsList(a); }} className="px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        <button onClick={() => setMsList(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 shrink-0 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16 shrink-0">Progress</span>
                                        <input aria-label="Progres milestone (slider)" type="range" min={0} max={100} step={1} value={progMs(m)} onChange={e => setProgressMs(i, Number(e.target.value))} className="flex-1 accent-[var(--div-accent)]" />
                                        <input aria-label="Progres milestone (persen)" type="number" min={0} max={100} value={progMs(m)} onChange={e => setProgressMs(i, Number(e.target.value))} className="w-16 px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        <span className="text-sm font-black div-accent-text w-6">%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {msList.map((m, i) => {
                                const p = progMs(m);
                                const complete = p >= 100;
                                return (
                                    <motion.div
                                        key={i}
                                        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: '0px 0px -40px 0px' }}
                                        transition={{ duration: 0.4, delay: Math.min(i, 6) * 0.06, ease: [0.23, 1, 0.32, 1] }}
                                        className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5"
                                    >
                                        <div className="flex items-center gap-3 mb-2.5">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${complete ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-black/[0.04] dark:bg-white/5 text-slate-500 border border-black/10 dark:border-white/10'}`}>
                                                {complete ? <Check className="w-4 h-4" /> : <span className="text-xs font-black">{i + 1}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-bold ${complete ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>{m.title || '-'}</div>
                                                {m.date && <div className="text-[11px] text-slate-500">{formatDate(typeof m.date === 'string' ? m.date : undefined)}</div>}
                                            </div>
                                            <span className={`text-sm font-black font-mono shrink-0 ${complete ? 'text-emerald-400' : 'text-yellow-400'}`}>{p}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                            <motion.div
                                                className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'}`}
                                                initial={reduceMotion ? false : { width: 0 }}
                                                whileInView={{ width: `${p}%` }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 0.9, delay: 0.15 + Math.min(i, 6) * 0.06, ease: [0.23, 1, 0.32, 1] }}
                                            />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )
                }
            </div>

            {/* ── 4. SUMBER DAYA ── */}
            <div className="space-y-4">
                <SectionHeader title="Sumber Daya" isAdmin={isAdmin} editing={editingSd} onEdit={() => setEditingSd(true)} onCancel={() => { setSumberDaya(project.sumberDaya ?? []); setEditingSd(false); }} onSave={saveSd} saving={savingSd} />

                {editingSd && (
                    <button onClick={() => setSumberDaya(s => [...s, { namaAlat: '', jumlah: 0, kategori: '', satuan: 'Unit' }])}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                        <Plus className="w-3.5 h-3.5" /> Tambah Sumber Daya
                    </button>
                )}

                {sumberDaya.length === 0 && !editingSd
                    ? <EmptyState text={isAdmin ? "Belum ada data sumber daya." : "Belum ada data sumber daya. Belum diisi oleh PIC proyek."} action={isAdmin ? { label: "Isi sekarang", onClick: () => setEditingSd(true) } : undefined} />
                    : editingSd
                    ? (
                        <div className="space-y-2">
                            {sumberDaya.map((sd, i) => (
                                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                    <div className="sm:col-span-4">
                                        <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Nama</label>
                                        <input aria-label="mis. Excavator, Tukang, Besi Beton" placeholder="mis. Excavator, Tukang, Besi Beton" value={sd.namaAlat} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], namaAlat: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Kategori</label>
                                        <input aria-label="Alat Berat / Tenaga Kerja / Material" list="sd-kategori-op" placeholder="Alat Berat / Tenaga Kerja / Material" value={sd.kategori ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], kategori: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Jumlah</label>
                                        <input aria-label="Jumlah" type="number" min={0} value={sd.jumlah} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], jumlah: Math.max(0, Number(e.target.value)) }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Satuan</label>
                                        <input aria-label="Unit / Orang / m³" list="sd-satuan-op" placeholder="Unit / Orang / m³" value={sd.satuan ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], satuan: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                    </div>
                                    <div className="sm:col-span-1 flex sm:justify-center">
                                        <button onClick={() => setSumberDaya(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                                    </div>
                                </div>
                            ))}
                            <datalist id="sd-kategori-op">
                                <option value="Alat Berat" /><option value="Tenaga Kerja" /><option value="Material" /><option value="Kendaraan" /><option value="Peralatan" />
                            </datalist>
                            <datalist id="sd-satuan-op">
                                <option value="Unit" /><option value="Orang" /><option value="m³" /><option value="Ton" /><option value="Set" /><option value="Buah" />
                            </datalist>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {Object.entries(groupedSd).map(([kategori, items]) => (
                                <div key={kategori}>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{kategori}</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {items.map(({ item: sd }, i) => (
                                            <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 text-center">
                                                <div className={`text-3xl font-black mb-1 ${sd.jumlah > 0 ? 'div-accent-text' : 'text-slate-600'}`}>{sd.jumlah}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{sd.namaAlat || '-'}</div>
                                                <div className="text-[11px] text-slate-600 uppercase tracking-wider">{sd.satuan || 'Unit'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }

                {/* Monitoring Pengadaan */}
                <div className="pt-6 mt-2 border-t border-black/5 dark:border-white/5">
                    <SectionHeader title="Monitoring Pengadaan" isAdmin={isAdmin} editing={editingMon} onEdit={() => setEditingMon(true)} onCancel={() => { setMonitoring(project.monitoringPengadaan ?? []); setEditingMon(false); }} onSave={saveMonitoring} saving={savingMon} />
                    <p className="text-[11px] text-slate-500">Progres per item major. Jumlah paket dan pagu pengadaan keseluruhan diisi di <button type="button" onClick={() => onGoTab('laporan')} className="font-bold underline focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none rounded">Laporan Bulanan</button>.</p>
                    <p className="text-xs text-slate-500 -mt-2 mb-3">Major item pengadaan beserta persentase progresnya.</p>

                    {editingMon && (
                        <button onClick={() => setMonitoring(s => [...s, { nama: '', persentase: 0 }])}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold mb-3 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                            <Plus className="w-3.5 h-3.5" /> Tambah Item
                        </button>
                    )}

                    {monitoring.length === 0 && !editingMon
                        ? <EmptyState text={isAdmin ? "Belum ada data monitoring pengadaan." : "Belum ada data monitoring pengadaan. Belum diisi oleh PIC proyek."} action={isAdmin ? { label: "Isi sekarang", onClick: () => setEditingMon(true) } : undefined} />
                        : editingMon
                        ? (
                            <div className="space-y-2">
                                {monitoring.map((mp, i) => (
                                    <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                        <div className="sm:col-span-8">
                                            <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Nama Item</label>
                                            <input aria-label="mis. Pengadaan Besi Beton" placeholder="mis. Pengadaan Besi Beton" value={mp.nama} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], nama: e.target.value }; setMonitoring(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        </div>
                                        <div className="sm:col-span-3">
                                            <label className="text-[11px] text-slate-600 dark:text-slate-400 uppercase font-bold">Persentase (%)</label>
                                            <input type="number" min={0} max={100} value={mp.persentase} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], persentase: Math.max(0, Math.min(100, Number(e.target.value))) }; setMonitoring(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                                        </div>
                                        <div className="sm:col-span-1 flex sm:justify-center">
                                            <button onClick={() => setMonitoring(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {monitoring.map((mp, i) => {
                                    const p = Math.max(0, Math.min(100, mp.persentase ?? 0));
                                    const done = p >= 100;
                                    return (
                                        <div key={i} className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-0 truncate">{mp.nama || '-'}</span>
                                                <span className={`text-xs font-black font-mono shrink-0 ${done ? 'text-emerald-400' : 'text-yellow-400'}`}>{p}%</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                                <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'}`} style={{ width: `${p}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    }
                </div>
            </div>
        </div>
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

    return (
        <div className="space-y-4">
            <SectionHeader title="Change Management" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setList(project.changeManagement ?? []); setEditing(false); }} onSave={save} saving={saving} />
            <p className="text-xs text-slate-500 -mt-2">Daftar perubahan lingkup/kontrak. Kendala dapat dimasukkan ke sini dari tab Isu &amp; Kendala.</p>

            {editing && (
                <button onClick={() => setList(s => [...s, { judul: '', status: 'USULAN' }])} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                    <Plus className="w-3.5 h-3.5" /> Tambah Perubahan
                </button>
            )}

            {list.length === 0 && !editing
                ? <EmptyState text={isAdmin ? "Belum ada change management." : "Belum ada change management. Belum diisi oleh PIC proyek."} action={isAdmin ? { label: "Isi sekarang", onClick: () => setEditing(true) } : undefined} />
                : editing
                ? (
                    <div className="space-y-3">
                        {list.map((cm, i) => (
                            <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-2">
                                <Input label="Judul Perubahan" value={cm.judul} onChange={v => { const a = [...list]; a[i] = { ...a[i], judul: v }; setList(a); }} />
                                <Select label="Jenis" value={cm.jenis ?? 'LAINNYA'} onChange={v => { const a = [...list]; a[i] = { ...a[i], jenis: v as ChangeJenis }; setList(a); }} options={CHANGE_JENIS_OPTIONS.map(o => [o.value, o.label])} />
                                <Textarea label="Deskripsi / Latar Belakang" value={cm.deskripsi ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], deskripsi: v }; setList(a); }} />
                                <Textarea label="Dampak Perubahan (biaya / waktu / mutu)" value={cm.dampak ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], dampak: v }; setList(a); }} />
                                <Textarea label="Mitigasi (langkah penanganan dampak)" value={cm.mitigasi ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], mitigasi: v }; setList(a); }} />
                                <div className="grid sm:grid-cols-2 gap-2">
                                    <Input label="Nilai Perubahan (Rp)" type="number" value={cm.nilai?.toString() ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], nilai: v === '' ? undefined : Number(v) }; setList(a); }} />
                                    <Input label="Tanggal" type="date" value={typeof cm.tanggal === 'string' ? cm.tanggal.slice(0, 10) : ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], tanggal: v }; setList(a); }} />
                                    <Input label="Target Implementasi" value={cm.target ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], target: v }; setList(a); }} />
                                    <Input label="PIC" value={cm.pic ?? ''} onChange={v => { const a = [...list]; a[i] = { ...a[i], pic: v }; setList(a); }} />
                                    <div className="sm:col-span-2">
                                        <Select label="Status" value={cm.status} onChange={v => { const a = [...list]; a[i] = { ...a[i], status: v as ChangeManagement['status'] }; setList(a); }} options={[['USULAN', 'USULAN'], ['DISETUJUI', 'DISETUJUI'], ['DITOLAK', 'DITOLAK']]} />
                                    </div>
                                </div>
                                <button onClick={() => setList(s => s.filter((_, j) => j !== i))} className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {list.map((cm, i) => {
                            const st = CM_STATUS[cm.status] ?? CM_STATUS.USULAN;
                            return (
                                <div key={i} className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                        <div className="flex gap-3 items-start min-w-0">
                                            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 font-black text-xs">{i + 1}</div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white break-words">{cm.judul || '-'}</p>
                                                {cm.dariKendala && <span className="text-[11px] text-indigo-300/70 inline-flex items-center gap-1"><GitBranch className="w-3 h-3" /> Dari kendala</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${st.color}`}>{st.label}</span>
                                            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-white/15 bg-white/[0.04] text-slate-600 dark:text-slate-300">
                                                {(CHANGE_JENIS_OPTIONS.find(o => o.value === (cm.jenis ?? 'LAINNYA'))?.label) ?? 'Lain-lain'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-3 ml-10">
                                        {cm.deskripsi && <MiniField label="Deskripsi / Latar Belakang" value={cm.deskripsi} />}
                                        {cm.dampak && <MiniField label="Dampak" value={cm.dampak} />}
                                        {cm.mitigasi && <MiniField label="Mitigasi" value={cm.mitigasi} />}
                                        {cm.nilai != null && <MiniField label="Nilai Perubahan" value={formatIDR(cm.nilai)} />}
                                        {cm.tanggal && <MiniField label="Tanggal" value={formatDate(typeof cm.tanggal === 'string' ? cm.tanggal : undefined)} />}
                                        {cm.target && <MiniField label="Target" value={cm.target} />}
                                        {cm.pic && <MiniField label="PIC" value={cm.pic} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            }
        </div>
    );
}

// ── (B) Indikator kelengkapan data proyek ─────────────────────────────────────
// Mendata bagian-bagian penting + apakah sudah terisi. Memandu user mengisi
// tanpa memaksa. "Terisi" = ada nilai yang bermakna.
function computeCompleteness(p: Project) {
    const has = (v: unknown) => {
        if (v == null) return false;
        if (typeof v === 'string') return v.trim() !== '';
        // Angka 0 dianggap belum diisi (default Mongoose / input kosong).
        if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v as object).length > 0;
        return !!v;
    };
    const hasHasilUsaha = (() => {
        const h = p.hasilUsaha as { pendapatan?: number; biaya?: number } | undefined;
        return !!h && ((h.pendapatan ?? 0) > 0 || (h.biaya ?? 0) > 0);
    })();
    // Aturan "terisi" diperketat: bagian dihitung selesai hanya bila field intinya lengkap.
    const finansialFilled = [p.tagihanBruto, p.cashIn, p.cashOut, p.saldoHutang, p.piutang].filter(has).length;
    const items: { label: string; done: boolean; tab: Tab }[] = [
        { label: 'Informasi (PIC, pelaksana, tanggal)', done: has(p.pmName) && (has(p.penyediaJasa) || has(p.contractor)) && has(p.startDate) && has(p.endDate), tab: 'info' },
        { label: 'Kontrak (nomor & nilai)', done: has(p.contractNumber) && has(p.contractValue), tab: 'contract' },
        { label: 'Laporan bulanan (bulan ini / bulan lalu)', done: isLaporanFresh(p.laporanBulanan), tab: 'laporan' },
        { label: 'Ringkasan (CPI / SPI)', done: has(p.cpi) && has(p.spi), tab: 'ikhtiar' },
        { label: 'Finansial (cash / hutang / piutang)', done: finansialFilled >= 2, tab: 'finansial' },
        { label: 'Kinerja Operasi (PU / BK / LK)', done: hasHasilUsaha || (has(p.pu) && has(p.bk)), tab: 'operasi' },
        { label: 'Progres fisik', done: has(p.progressPercent), tab: 'progress' },
        { label: 'Milestone & Sumber Daya', done: has(p.milestones) && has(p.sumberDaya), tab: 'operasi' },
        { label: 'Galeri', done: has(p.gallery), tab: 'gallery' },
    ];
    const doneCount = items.filter(i => i.done).length;
    const percent = Math.round((doneCount / items.length) * 100);
    return { items, doneCount, total: items.length, percent };
}

function CompletenessCard({ project, onGoTab }: { project: Project; onGoTab: (t: Tab) => void }) {
    const { items, doneCount, total, percent } = computeCompleteness(project);
    const missing = items.filter(i => !i.done);
    const tone = percent >= 80 ? 'emerald' : percent >= 40 ? 'amber' : 'rose';
    const barColor = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500';
    const textColor = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-rose-400';
    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kelengkapan Data Proyek</h3>
                <span className={`text-sm font-black font-mono ${textColor}`}>{percent}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{doneCount} dari {total} bagian sudah terisi.</p>
            {missing.length > 0 && (
                <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Belum diisi — klik untuk mengisi:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {missing.map((m, i) => (
                            <button
                                key={i}
                                onClick={() => onGoTab(m.tab)}
                                className="px-2.5 py-1 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-[rgba(var(--div-accent-rgb),0.15)] border border-black/10 dark:border-white/10 hover:border-[rgba(var(--div-accent-rgb),0.4)] text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-[var(--div-accent)] transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Summary ──────────────────────────────────────────────────────────────────
function SummaryTab({ project, status, onlineCams, onGoTab }: { project: Project; status: { label: string; color: string }; onlineCams: number; onGoTab: (t: Tab) => void }) {
    const realisasi = project.progressPercent ?? 0;
    const rencana = project.progressRencana ?? 0;
    const deviasi = project.progressDeviasi ?? (realisasi - rencana);

    const cards = [
        { label: 'Status',        value: status.label,                icon: Info },
        { label: 'Realisasi Fisik', value: pct(realisasi),            icon: TrendingUp },
        { label: 'Nilai Kontrak', value: formatIDR(project.contractValue), icon: CircleDollarSign },
        { label: 'Kontraktor',    value: project.contractor || project.penyediaJasa || '-', icon: Building2 },
        { label: 'CCTV Online',   value: `${onlineCams}/${project.cameras?.length ?? 0}`, icon: MapPin },
        { label: 'PIC',           value: project.pmName || '-',       icon: User },
    ];

    return (
        <div className="space-y-6">
            {/* Indikator kelengkapan data */}
            <CompletenessCard project={project} onGoTab={onGoTab} />

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {cards.map(c => (
                    <div key={c.label} className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 text-slate-500 mb-2">
                            <c.icon className="w-4 h-4" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">{c.label}</span>
                        </div>
                        <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white break-words leading-snug">{c.value}</div>
                    </div>
                ))}
            </div>

            {/* 2 Kolom: Progress Fisik (Kiri) & Progress Keuangan (Kanan) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                <ProgressFisikCard rencana={rencana} realisasi={realisasi} deviasi={deviasi} />
                <ProgressKeuanganCard
                    progressKeuangan={project.progressKeuangan || []}
                    tagihanBelumDiproses={project.tagihanBelumDiproses}
                />
            </div>

            {/* Lingkup pekerjaan */}
            {(project.lingkupPekerjaan || []).length > 0 && (
                <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Lingkup Pekerjaan</h3>
                    <div className="flex flex-wrap gap-2">
                        {(project.lingkupPekerjaan || []).map((lp, i) => (
                            <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.2)] div-accent-text">{lp}</span>
                        ))}
                    </div>
                </div>
            )}

            {project.description && (
                <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Deskripsi</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{project.description}</p>
                </div>
            )}
        </div>
    );
}

// ── 2-Column Progress Charts ──────────────────────────────────────────────────
function ProgressFisikCard({ rencana, realisasi, deviasi }: { rencana: number; realisasi: number; deviasi: number }) {
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
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Fisik</h3>
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

    const SIZE = 156;
    const STROKE = 11;
    const R = SIZE / 2 - STROKE / 2;
    const C = SIZE / 2;
    const circ = 2 * Math.PI * R;
    const dPct = (Math.min(totalPct, 100) / 100) * circ;

    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex flex-col justify-between space-y-4">
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
            <div className="flex flex-col items-center justify-center py-2">
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
                        <div className="text-3xl font-black text-slate-900 dark:text-white leading-none my-0.5">
                            {totalPct.toFixed(1)}<span className="text-sm text-sky-700 dark:text-sky-400 font-extrabold">%</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-bold truncate max-w-[130px]">
                            {formatIDRShort(totalRealisasi)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Per-DIPA Breakdown List */}
            <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                {progressKeuangan.length > 0 ? (
                    progressKeuangan.map(pk => {
                        const pct = pk.rencana > 0 ? (pk.realisasi / pk.rencana) * 100 : 0;
                        return (
                            <div key={pk.tahun} className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/5 text-xs space-y-1">
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
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-500"
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic text-center py-2">Belum ada data DIPA keuangan.</p>
                )}

                {/* Belum ditagihkan callout */}
                {tagihanBelumDiproses != null && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                        <span className="text-slate-600 dark:text-slate-400 text-[11px]">Belum ditagihkan:</span>
                        <span className="text-amber-700 dark:text-amber-400 font-bold font-mono">{formatIDR(tagihanBelumDiproses)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Info (editable) ──────────────────────────────────────────────────────────
function InfoTab({ project, isAdmin, isSuperAdmin, onSaved }: { project: Project; isAdmin: boolean; isSuperAdmin?: boolean; onSaved: () => void }) {
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
        <div className="space-y-4">
            <SectionHeader title="Informasi Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} saving={saving} />
            <div className="grid sm:grid-cols-2 gap-4">
                {!editing ? (
                    <>
                        <Field label="Pengguna Jasa"  value={project.penggunaJasa} />
                        <Field label="Pengawas"       value={project.pengawas} />
                        <Field label="Penyedia Jasa"  value={project.penyediaJasa} />
                        <Field label="Kontraktor"     value={project.contractor} />
                        <Field label="Status"         value={STATUS_META[project.status || 'ongoing']?.label} />
                        <Field label="Tanggal Mulai"  value={formatDate(project.startDate)} />
                        <Field label="Tanggal Selesai" value={formatDate(project.endDate)} />
                        <Field label="PIC"            value={project.pmName} />
                        <Field label="Kontak PIC"     value={project.pmPhone} />
                        <div className="sm:col-span-2"><Field label="Deskripsi" value={project.description} /></div>
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
                        <Input label="PIC"            value={form.pmName}        onChange={v => setForm({ ...form, pmName: v })} />
                        <Input label="Kontak PIC"     value={form.pmPhone}       onChange={v => setForm({ ...form, pmPhone: v })} />
                        <div className="sm:col-span-2"><Textarea label="Deskripsi" value={form.description} onChange={v => setForm({ ...form, description: v })} /></div>
                    </>
                )}
            </div>

            {/* Panel PIC — hanya super-admin. Server tetap penegak via requireSuperAdmin. */}
            {isSuperAdmin && <PicPanel projectId={project._id} />}
        </div>
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
        <div className="space-y-4">
            <FootprintEditor
                lat={project.lat}
                lng={project.lng}
                footprint={project.footprint ?? []}
                height={project.footprintHeight}
                canEdit={isAdmin}
                onSave={saveFootprint}
            />
            <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Latitude"  value={String(project.lat)} />
                <Field label="Longitude" value={String(project.lng)} />
            </div>
            <a
                href={`https://www.google.com/maps?q=${project.lat},${project.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
            >
                <ExternalLink className="w-4 h-4" /> Buka di Google Maps
            </a>
            <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 aspect-video bg-white dark:bg-slate-900">
                <iframe
                    title="Peta lokasi"
                    className="w-full h-full"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${project.lng - 0.01},${project.lat - 0.01},${project.lng + 0.01},${project.lat + 0.01}&marker=${project.lat},${project.lng}`}
                />
            </div>
        </div>
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
                contractValue: form.contractValue ? Number(form.contractValue) : undefined,
            });
            toast.success('Kontrak tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Kontrak Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} saving={saving} />
            <div className="grid sm:grid-cols-2 gap-4">
                {!editing ? (
                    <>
                        <Field label="Nomor Kontrak" value={project.contractNumber} />
                        <Field label="Nilai Kontrak" value={formatIDR(project.contractValue)} />
                        <Field label="Masa Pelaksanaan" value={project.startDate && project.endDate ? `${formatDate(project.startDate)} s/d ${formatDate(project.endDate)}` : '-'} />
                    </>
                ) : (
                    <>
                        <Input label="Nomor Kontrak"   value={form.contractNumber} onChange={v => setForm({ ...form, contractNumber: v })} />
                        <Input label="Nilai Kontrak (IDR)" type="number" value={form.contractValue} onChange={v => setForm({ ...form, contractValue: v })} />
                    </>
                )}
            </div>

        </div>
    );
}

// ── Progress ─────────────────────────────────────────────────────────────────
function ProgressTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        progressPercent: project.progressPercent ?? 0,
        progressRencana: project.progressRencana ?? 0,
        progressDeviasi: project.progressDeviasi ?? 0,
        lingkupPekerjaan: project.lingkupPekerjaan ?? [],
    });
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                lingkupPekerjaan: form.lingkupPekerjaan,
                progressPercent: form.progressPercent,
                progressRencana: form.progressRencana,
                progressDeviasi: Math.round((form.progressPercent - form.progressRencana) * 100) / 100,
            });
            toast.success('Progres tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(saveErrorMessage(err)); }
        finally { setSaving(false); }
    };

    const deviasi = editing
        ? (form.progressPercent - form.progressRencana)
        : (project.progressDeviasi ?? ((project.progressPercent ?? 0) - (project.progressRencana ?? 0)));

    return (
        <div className="space-y-4">
            <SectionHeader title="Progres Proyek" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} saving={saving} />

            {!editing ? (
                <ProgressFisikCard
                    rencana={project.progressRencana ?? 0}
                    realisasi={project.progressPercent ?? 0}
                    deviasi={deviasi}
                />
            ) : (
                <div className="space-y-4">
                    {/* Progress fisik edit */}
                    <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Progress Fisik</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rencana: {form.progressRencana.toFixed(2)}%</label>
                                <input aria-label="Progres rencana (persen)" type="range" min={0} max={100} step={0.01} value={form.progressRencana} onChange={e => setForm({ ...form, progressRencana: Number(e.target.value) })} className="w-full mt-2 accent-slate-400" />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Realisasi: {form.progressPercent.toFixed(2)}%</label>
                                <input aria-label="Progres realisasi (persen)" type="range" min={0} max={100} step={0.01} value={form.progressPercent} onChange={e => setForm({ ...form, progressPercent: Number(e.target.value) })} className="w-full mt-2 accent-[var(--div-accent)]" />
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

            {/* Lingkup pekerjaan */}
            <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lingkup Pekerjaan</h3>
                    {editing && (
                        <button onClick={() => setForm(f => ({ ...f, lingkupPekerjaan: [...f.lingkupPekerjaan, ''] }))}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    )}
                </div>
                {(editing ? form.lingkupPekerjaan : (project.lingkupPekerjaan || [])).length === 0
                    ? <p className="text-sm text-slate-500 italic">Belum ada lingkup pekerjaan.</p>
                    : editing
                    ? form.lingkupPekerjaan.map((lp, i) => (
                        <div key={i} className="flex gap-2">
                            <input aria-label="Lingkup pekerjaan" value={lp} onChange={e => { const a = [...form.lingkupPekerjaan]; a[i] = e.target.value; setForm(f => ({ ...f, lingkupPekerjaan: a })); }} className="flex-1 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus:border-[rgba(var(--div-accent-rgb),0.5)]" />
                            <button onClick={() => setForm(f => ({ ...f, lingkupPekerjaan: f.lingkupPekerjaan.filter((_, j) => j !== i) }))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Minus className="w-4 h-4" aria-hidden="true" /></button>
                        </div>
                    ))
                    : (
                        <div className="flex flex-wrap gap-2">
                            {(project.lingkupPekerjaan || []).map((lp, i) => (
                                <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-[rgba(var(--div-accent-rgb),0.1)] border border-[rgba(var(--div-accent-rgb),0.2)] div-accent-text">{lp}</span>
                            ))}
                        </div>
                    )
                }
            </div>
        </div>
    );
}

// ── Isu & Kendala ─────────────────────────────────────────────────────────────
function IssuesTab({ project, isAdmin, onSaved, onToChangeMgmt }: { project: Project; isAdmin: boolean; onSaved: () => void; onToChangeMgmt?: () => void }) {
    const [editingIsu, setEditingIsu] = useState(false);
    const [editingKendala, setEditingKendala] = useState(false);
    const [isuList, setIsuList] = useState<IsuStrategis[]>(project.isuStrategis ?? []);
    const [kendalaList, setKendalaList] = useState<Kendala[]>(project.kendala ?? []);
    const [saving, setSaving] = useState(false);
    const [promoting, setPromoting] = useState<number | null>(null);

    const saveIsu = async () => {
        setSaving(true);
        try { await axios.patch(`/api/projects/${project._id}`, { isuStrategis: isuList }); toast.success('Isu strategis tersimpan'); setEditingIsu(false); onSaved(); }
        catch (err) { toast.error(saveErrorMessage(err)); } finally { setSaving(false); }
    };
    const saveKendala = async () => {
        setSaving(true);
        try { await axios.patch(`/api/projects/${project._id}`, { kendala: kendalaList }); toast.success('Kendala tersimpan'); setEditingKendala(false); onSaved(); }
        catch (err) { toast.error(saveErrorMessage(err)); } finally { setSaving(false); }
    };

    // Salin satu kendala menjadi item Change Management (USULAN).
    const toChangeMgmt = async (k: Kendala, idx: number) => {
        setPromoting(idx);
        try {
            const existing = project.changeManagement ?? [];
            const item: ChangeManagement = {
                judul: k.masalah,
                jenis: 'LAINNYA',
                deskripsi: [k.penyebab && `Penyebab: ${k.penyebab}`, k.tindakan && `Tindakan: ${k.tindakan}`].filter(Boolean).join('\n'),
                dampak: k.harapan || undefined,
                target: k.target || undefined,
                pic: k.pic || undefined,
                status: 'USULAN',
                dariKendala: true,
                tanggal: new Date().toISOString(),
            };
            await axios.patch(`/api/projects/${project._id}`, { changeManagement: [...existing, item] });
            toast.success('Kendala dimasukkan ke Change Management');
            onSaved();
            onToChangeMgmt?.();
        } catch { toast.error('Gagal memasukkan ke Change Management'); }
        finally { setPromoting(null); }
    };

    return (
        <div className="space-y-6">
            {/* Isu Strategis */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Isu Strategis</h3>
                    {isAdmin && (editingIsu ? (
                        <div className="flex gap-2">
                            <button onClick={() => { setIsuList(project.isuStrategis ?? []); setEditingIsu(false); }} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveIsu} disabled={saving} className="px-3 py-2 max-sm:min-h-11 max-sm:px-4 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            {editingIsu === false && <button onClick={() => setIsuList(s => [...s, { isu: '', usulan: '' }])} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Plus className="w-3.5 h-3.5" /> Tambah</button>}
                            <button onClick={() => setEditingIsu(true)} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        </div>
                    ))}
                </div>
                {isuList.length === 0
                    ? <EmptyState text="Belum ada isu strategis." />
                    : editingIsu
                    ? isuList.map((isu, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-2">
                            <div className="flex gap-2">
                                <div className="flex-1 space-y-2">
                                    <Textarea label="Isu" value={isu.isu} onChange={v => { const a = [...isuList]; a[i] = { ...a[i], isu: v }; setIsuList(a); }} />
                                    <Textarea label="Usulan dari Abipraya" value={isu.usulan} onChange={v => { const a = [...isuList]; a[i] = { ...a[i], usulan: v }; setIsuList(a); }} />
                                </div>
                                <button onClick={() => setIsuList(s => s.filter((_, j) => j !== i))} aria-label="Hapus baris" className="min-w-11 min-h-11 inline-flex items-center justify-center h-fit rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
                            </div>
                        </div>
                    ))
                    : (
                        <div className="space-y-3">
                            {isuList.map((isu, i) => (
                                <div key={i} className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                    <div className="flex gap-3">
                                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-black text-xs shrink-0">{i + 1}</div>
                                        <div className="space-y-2 flex-1">
                                            <p className="text-sm text-slate-900 dark:text-white leading-relaxed">{isu.isu}</p>
                                            <div className="text-xs text-slate-500 dark:text-slate-400"><span className="font-bold text-yellow-400">Usulan: </span>{isu.usulan}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }
            </div>

            {/* Kendala */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Kendala Operasional & Kontraktual</h3>
                    {isAdmin && (editingKendala ? (
                        <div className="flex gap-2">
                            <button onClick={() => { setKendalaList(project.kendala ?? []); setEditingKendala(false); }} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveKendala} disabled={saving} className="px-3 py-2 max-sm:min-h-11 max-sm:px-4 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => setKendalaList(s => [...s, { masalah: '', penyebab: '', tindakan: '', status: 'OPEN' }])} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Plus className="w-3.5 h-3.5" /> Tambah</button>
                            <button onClick={() => setEditingKendala(true)} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        </div>
                    ))}
                </div>
                {kendalaList.length === 0
                    ? <EmptyState text="Belum ada kendala tercatat." />
                    : editingKendala
                    ? kendalaList.map((k, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-2">
                            <div className="grid sm:grid-cols-2 gap-2">
                                <Input label="Masalah"  value={k.masalah}  onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], masalah: v }; setKendalaList(a); }} />
                                <Input label="Penyebab" value={k.penyebab} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], penyebab: v }; setKendalaList(a); }} />
                                <Input label="Tindakan" value={k.tindakan} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], tindakan: v }; setKendalaList(a); }} />
                                <Input label="Harapan Dukungan" value={k.harapan ?? ''} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], harapan: v }; setKendalaList(a); }} />
                                <Input label="Target"   value={k.target ?? ''} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], target: v }; setKendalaList(a); }} />
                                <Input label="PIC"      value={k.pic ?? ''} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], pic: v }; setKendalaList(a); }} />
                                <Select label="Status" value={k.status} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], status: v as Kendala['status'] }; setKendalaList(a); }} options={[['OPEN','OPEN'],['ON_PROGRESS','ON PROGRESS'],['CLOSED','CLOSED']]} />
                            </div>
                            <button onClick={() => setKendalaList(s => s.filter((_, j) => j !== i))} className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
                        </div>
                    ))
                    : (
                        <div className="space-y-3">
                            {kendalaList.map((k, i) => {
                                const ks = KENDALA_STATUS[k.status] ?? KENDALA_STATUS.OPEN;
                                return (
                                    <div key={i} className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="flex gap-3 items-start">
                                                <div className="w-7 h-7 rounded-lg bg-slate-700/50 flex items-center justify-center text-slate-500 dark:text-slate-400 font-black text-xs shrink-0">{i + 1}</div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{k.masalah}</p>
                                            </div>
                                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${ks.color}`}>{ks.label}</span>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-3 ml-10">
                                            {k.penyebab && <MiniField label="Penyebab" value={k.penyebab} />}
                                            {k.tindakan && <MiniField label="Tindakan" value={k.tindakan} />}
                                            {k.harapan && <MiniField label="Harapan Dukungan" value={k.harapan} />}
                                            {k.target && <MiniField label="Target" value={k.target} />}
                                            {k.pic && <MiniField label="PIC" value={k.pic} />}
                                        </div>
                                        {isAdmin && (
                                            <div className="ml-10 mt-3 pt-3 border-t border-black/5 dark:border-white/5">
                                                <button
                                                    onClick={() => toChangeMgmt(k, i)}
                                                    disabled={promoting === i}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/20 transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                                >
                                                    {promoting === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                                                    Masukkan ke Change Management
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                }
            </div>
        </div>
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
        <div className="space-y-4">
            {ConfirmDialog}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Galeri Foto</h3>
                {isAdmin && <UploadButton projectId={project._id} kind="gallery" accept="image/*" label="Unggah Foto" onDone={onChanged} />}
            </div>
            {(project.gallery || []).length === 0 ? <EmptyState text="Belum ada foto." /> : (
                /* Masonry: tiap foto tampil sesuai rasio aslinya (tidak dipotong). */
                <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
                    {items.map((g, i) => (
                        <div key={g.key} className="relative group mb-4 break-inside-avoid rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900">
                            <button type="button" onClick={() => { setOriginKey(g.key); setLightbox(i); }} className="block w-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                                <motion.img layoutId={`gal-${g.key}`} src={g.url!} alt={g.caption || ''} loading="lazy" className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]" />
                            </button>
                            {g.caption && <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-[11px] text-white truncate pointer-events-none">{g.caption}</div>}
                            {isAdmin && (
                                <button onClick={() => del(g.key)} aria-label="Hapus foto" className="absolute top-2 right-2 min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg bg-black/60 text-rose-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-rose-500/20 transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

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
        </div>
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

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionHeader({ title, isAdmin, editing, onEdit, onCancel, onSave, saving }: {
    title: string; isAdmin: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: () => void; saving: boolean;
}) {
    return (
        <div className={`flex items-center justify-between ${editing && isAdmin ? 'max-sm:sticky max-sm:top-[calc(var(--ph-h,0px)+0.25rem)] max-sm:z-20 max-sm:-mx-4 max-sm:px-4 max-sm:py-2 max-sm:bg-slate-100/90 dark:max-sm:bg-slate-950/90 max-sm:backdrop-blur max-sm:border-b max-sm:border-black/5 dark:max-sm:border-white/5' : ''}`}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
            {isAdmin && (editing ? (
                <div className="flex gap-2">
                    <button onClick={onCancel} aria-label="Batalkan perubahan" className="px-3.5 py-2.5 max-sm:min-h-11 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><X className="w-3.5 h-3.5" /> Batal</button>
                    <button onClick={onSave} disabled={saving} aria-label="Simpan perubahan" className="px-3.5 py-2.5 max-sm:min-h-11 max-sm:px-5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                    </button>
                </div>
            ) : (
                <button onClick={onEdit} aria-label={`Edit ${title}`} className="px-3.5 py-2.5 max-sm:min-h-11 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            ))}
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string }) {
    return (
        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">{label}</div>
            <div className="text-sm text-slate-900 dark:text-white break-words">{value || '-'}</div>
        </div>
    );
}
function MiniField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-0.5">{label}</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">{value}</div>
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
function InfoTip({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);
    const tipId = useId();

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
                onClick={() => setOpen(o => !o)}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="group w-7 h-7 flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                aria-label="Penjelasan istilah"
                aria-expanded={open}
                aria-describedby={open ? tipId : undefined}
            >
                <span className="w-4 h-4 rounded-full bg-black/[0.08] dark:bg-white/10 group-hover:bg-[rgba(var(--div-accent-rgb),0.3)] text-slate-700 dark:text-slate-300 flex items-center justify-center text-[11px] font-black leading-none transition-colors">?</span>
            </button>
            {open && (
                <span id={tipId} role="tooltip" className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-50 w-56 max-w-[70vw] p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 border border-black/10 dark:border-white/15 shadow-2xl text-xs font-normal normal-case tracking-normal text-slate-700 dark:text-slate-200 leading-snug pointer-events-none">
                    {text}
                </span>
            )}
        </span>
    );
}

// ── (A) Input angka uang: format ribuan live + preview "Rp ..." + tombol cepat ─
// Nilai internal tetap angka polos (string digit). Tampilan diformat ribuan.
function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
    const uid = useId();
    const digits = (value ?? '').replace(/\D/g, '');
    const grouped = digits ? Number(digits).toLocaleString('id-ID') : '';
    const n = digits ? Number(digits) : 0;

    const setDigits = (raw: string) => onChange(raw.replace(/\D/g, ''));
    const mult = (factor: number) => {
        const base = digits ? Number(digits) : 0;
        onChange(String((base || 1) * factor));
    };

    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}{hint && <InfoTip text={hint} />}</label>
            <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold pointer-events-none">Rp</span>
                <input
                    id={uid}
                    type="text"
                    inputMode="numeric"
                    value={grouped}
                    onChange={e => setDigits(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-mono focus:border-[rgba(var(--div-accent-rgb),0.5)] outline-none"
                />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
                <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => mult(1_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">×1.000</button>
                    <button type="button" onClick={() => mult(1_000_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">× juta</button>
                    <button type="button" onClick={() => mult(1_000_000_000)} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">× miliar</button>
                    {digits && <button type="button" onClick={() => onChange('')} className="px-2.5 py-1.5 rounded-lg bg-black/[0.06] dark:bg-white/5 hover:bg-rose-500/20 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-rose-500 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">bersihkan</button>}
                </div>
                {digits && <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono truncate">{formatIDRShort(n)}</span>}
            </div>
        </div>
    );
}
function Textarea({ label, value, onChange, maxLength = 10000 }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
    const uid = useId();
    // Penghitung hanya tampil mendekati batas agar form tidak ramai.
    const nearLimit = value.length > maxLength * 0.8;
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{label}</label>
            <textarea id={uid} value={value} onChange={e => onChange(e.target.value)} rows={3} maxLength={maxLength} className={controlCls(false) + " resize-y"} />
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
function EmptyState({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
    return (
        <div className="py-16 px-4 text-center text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-sm">
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

function UploadButton({ projectId, kind, accept, label, onDone }: { projectId: string; kind: string; accept: string; label: string; onDone: () => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('kind', kind);
            await axios.post(`/api/projects/${projectId}/upload`, fd);
            toast.success('Berhasil diunggah');
            onDone();
        } catch (err: unknown) {
            const apiError = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined;
            toast.error(apiError || 'Gagal mengunggah');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <>
            <input ref={inputRef} aria-label={label} type="file" accept={accept} onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {label}
            </button>
        </>
    );
}
