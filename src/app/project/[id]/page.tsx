"use client";

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Loader2, MapPin, FileText, Image as ImageIcon, ClipboardList,
    TrendingUp, Info, LayoutDashboard, Upload, Trash2, Pencil, Check, X,
    Phone, User, Building2, Calendar, CircleDollarSign, Download, ExternalLink,
    Wrench, AlertTriangle, ChevronDown, ChevronUp, Plus, Minus,
    PieChart, ArrowUpRight, ArrowDownRight, Layers, Target, Wallet,
    Menu, GitBranch, ChevronLeft, ChevronRight
} from 'lucide-react';
import BrandLoader from '@/components/BrandLoader';
import ThemeToggle from '@/components/ThemeToggle';

type Tab =
    | 'summary'
    | 'ikhtiar'
    | 'finansial'
    | 'milestones' | 'resources' | 'changemgmt'
    | 'issues'
    | 'info' | 'location' | 'contract' | 'progress' | 'gallery' | 'documents';

interface GalleryItem { key: string; caption?: string; uploadedAt: string; url: string | null; }
interface DocItem { name: string; key: string; size?: number; contentType?: string; uploadedAt: string; url: string | null; }
interface Milestone { title: string; done: boolean; date?: string; progress?: number; }
interface HasilUsaha { pendapatan: number; biaya: number; laba: number; }
interface ProgressKeuangan { tahun: number; rencana: number; realisasi: number; }
interface SumberDaya { namaAlat: string; jumlah: number; kategori?: string; satuan?: string; }
interface IsuStrategis { isu: string; usulan: string; }
interface Kendala { masalah: string; penyebab: string; tindakan: string; harapan?: string; target?: string; pic?: string; status: 'OPEN' | 'CLOSED' | 'ON_PROGRESS'; }
type ChangeJenis = 'PERUBAHAN_HARGA' | 'PERUBAHAN_LINGKUP' | 'KLAIM' | 'LEGAL_ISSUE' | 'LAINNYA';
interface ChangeManagement { judul: string; jenis?: ChangeJenis; deskripsi?: string; dampak?: string; mitigasi?: string; nilai?: number; tanggal?: string; target?: string; pic?: string; status: 'USULAN' | 'DISETUJUI' | 'DITOLAK'; dariKendala?: boolean; }
interface MonitoringPengadaan { nama: string; persentase: number; }

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
    contractUrl?: string | null;
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
    milestones?: Milestone[];
    gallery?: GalleryItem[];
    documents?: DocItem[];
    cameras?: { _id: string; name: string; status: string }[];
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
        group: 'Ringkasan',
        items: [
            { id: 'summary', label: 'Ringkasan', icon: LayoutDashboard },
        ],
    },
    {
        group: 'Ikhtiar',
        items: [
            { id: 'ikhtiar', label: 'CPI / SPI', icon: Target },
        ],
    },
    {
        group: 'Finansial',
        items: [
            { id: 'finansial', label: 'Cash & Keuangan', icon: Wallet },
        ],
    },
    {
        group: 'Operasional',
        items: [
            { id: 'milestones', label: 'Milestone', icon: ClipboardList },
            { id: 'resources',  label: 'Sumber Daya', icon: Wrench },
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
            { id: 'documents', label: 'Dokumen',   icon: FileText },
        ],
    },
];

const ALL_TABS: TabItem[] = TAB_GROUPS.flatMap(g => g.items);

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
function formatBytes(b?: number) {
    if (!b) return '';
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function pct(n?: number) { return `${(n ?? 0).toFixed(2)}%`; }

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { data: session } = useSession();
    const isAdmin = !!session?.user;

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('summary');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const fetchProject = useCallback(async () => {
        try {
            const res = await axios.get(`/api/projects/${id}`);
            if (res.data.success) setProject(res.data.data);
        } catch {
            toast.error('Gagal memuat detail proyek');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchProject(); }, [fetchProject]);

    if (loading) {
        return <BrandLoader label="Memuat Detail Proyek" />;
    }
    if (!project) {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-500 dark:text-slate-400">
                <p className="text-lg font-bold">Proyek tidak ditemukan</p>
                <button onClick={() => router.back()} className="px-5 py-2.5 bg-black/[0.04] dark:bg-white/5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-sm font-bold">Kembali</button>
            </div>
        );
    }

    const status = STATUS_META[project.status || 'ongoing'] || STATUS_META.ongoing;
    const onlineCams = (project.cameras || []).filter(c => c.status === 'online').length;
    const activeLabel = ALL_TABS.find(t => t.id === tab)?.label ?? '';

    const selectTab = (t: Tab) => { setTab(t); setSidebarOpen(false); };

    const sidebarNav = (
        <nav className="space-y-5">
            {TAB_GROUPS.map(grp => (
                <div key={grp.group}>
                    <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{grp.group}</div>
                    <div className="space-y-0.5">
                        {grp.items.map(t => {
                            const Icon = t.icon;
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => selectTab(t.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                                        active
                                            ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
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

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-3">
                    <button onClick={() => router.back()} className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                        aria-label="Buka menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{project.name}</h1>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${status.color}`}>{status.label}</span>
                            {project.division && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 text-indigo-300">{project.division}</span>}
                            {project.projectType && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{project.projectType === 'JO' ? 'JO' : 'NON-JO'}</span>}
                            <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">{project.category}</span>
                        </div>
                    </div>
                    <ThemeToggle />
                    <button
                        onClick={() => router.push(`/map?category=${project.category}`)}
                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-yellow-500/20 transition-colors shrink-0"
                    >
                        <MapPin className="w-4 h-4" /> Lihat di Peta
                    </button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex gap-6">
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
                            />
                            <motion.aside
                                className="fixed inset-y-0 left-0 z-50 w-72 bg-slate-100 dark:bg-slate-950 border-r border-black/10 dark:border-white/10 p-4 overflow-y-auto lg:hidden"
                                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                                transition={{ type: 'tween', duration: 0.22 }}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">Menu Proyek</span>
                                    <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300"><X className="w-4 h-4" /></button>
                                </div>
                                {sidebarNav}
                            </motion.aside>
                        </>
                    )}
                </AnimatePresence>

                {/* Content */}
                <main className="flex-1 min-w-0">
                    <div className="mb-4 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest lg:hidden">
                        {activeLabel}
                    </div>
                    <AnimatePresence mode="wait">
                        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                            {tab === 'summary'    && <SummaryTab project={project} status={status} onlineCams={onlineCams} onGoTab={selectTab} />}
                            {tab === 'ikhtiar'    && <IkhtiarTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'finansial'  && <FinansialTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'milestones' && <MilestonesTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'resources'  && <ResourcesTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'changemgmt' && <ChangeManagementTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'issues'     && <IssuesTab project={project} isAdmin={isAdmin} onSaved={fetchProject} onToChangeMgmt={() => setTab('changemgmt')} />}
                            {tab === 'info'       && <InfoTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'location'   && <LocationTab project={project} />}
                            {tab === 'contract'   && <ContractTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'progress'   && <ProgressTab project={project} isAdmin={isAdmin} onSaved={fetchProject} />}
                            {tab === 'gallery'    && <GalleryTab project={project} isAdmin={isAdmin} onChanged={fetchProject} />}
                            {tab === 'documents'  && <DocumentsTab project={project} isAdmin={isAdmin} onChanged={fetchProject} />}
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
                <Target className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">{hint}</p>
            <div className="text-5xl font-black text-slate-900 dark:text-white leading-none mb-3">
                {value != null ? value.toFixed(2) : '—'}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${meta.color}`}>{meta.label}</span>
        </div>
    );
}

function IkhtiarTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        cpi: project.cpi?.toString() ?? '',
        spi: project.spi?.toString() ?? '',
    });
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, {
                cpi: form.cpi === '' ? undefined : Number(form.cpi),
                spi: form.spi === '' ? undefined : Number(form.spi),
            });
            toast.success('Ikhtiar tersimpan');
            setEditing(false);
            onSaved();
        } catch { toast.error('Gagal menyimpan'); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Ikhtiar — CPI / SPI" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setForm({ cpi: project.cpi?.toString() ?? '', spi: project.spi?.toString() ?? '' }); setEditing(false); }} onSave={save} saving={saving} />
            {!editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <IndexGauge title="CPI" hint="Cost Performance Index (kinerja biaya)" value={project.cpi} kind="cpi" />
                    <IndexGauge title="SPI" hint="Schedule Performance Index (kinerja jadwal)" value={project.spi} kind="spi" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                        <Input label="CPI (mis. 1.02)" type="number" value={form.cpi} onChange={v => setForm({ ...form, cpi: v })} hint="Cost Performance Index — nilai kinerja biaya dari laporan EVA. 1 ke atas = hemat/efisien, di bawah 1 = boros." />
                        <p className="mt-2 text-[11px] text-slate-500">≥ 1 = biaya efisien, &lt; 1 = over budget.</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                        <Input label="SPI (mis. 0.98)" type="number" value={form.spi} onChange={v => setForm({ ...form, spi: v })} hint="Schedule Performance Index — nilai kinerja jadwal dari laporan EVA. 1 ke atas = sesuai/lebih cepat, di bawah 1 = terlambat." />
                        <p className="mt-2 text-[11px] text-slate-500">≥ 1 = sesuai/lebih cepat jadwal, &lt; 1 = terlambat.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Finansial (ringkas) ───────────────────────────────────────────────────────
function MoneyCard({ label, value, icon: Icon, tone }: { label: string; value?: number; icon: typeof Wallet; tone: string }) {
    return (
        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${tone}`}><Icon className="w-4 h-4" /></div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            </div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono truncate">{formatIDRShort(value)}</div>
            <div className="text-[11px] text-slate-500 font-mono truncate">{value != null ? formatIDR(value) : ''}</div>
        </div>
    );
}

function FinansialTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const initForm = () => ({
        cashIn: project.cashIn?.toString() ?? '',
        cashOut: project.cashOut?.toString() ?? '',
        saldoKas: project.saldoKas?.toString() ?? '',
        saldoHutang: project.saldoHutang?.toString() ?? '',
        bad: project.bad?.toString() ?? '',
        piutang: project.piutang?.toString() ?? '',
        ccc: project.ccc?.toString() ?? '',
        bebanKonstruksi: project.bebanKonstruksi?.toString() ?? '',
        huPendapatan: project.hasilUsaha?.pendapatan?.toString() ?? '',
        huBiaya: project.hasilUsaha?.biaya?.toString() ?? '',
        pu: project.pu?.toString() ?? '',
        bk: project.bk?.toString() ?? '',
        progressKeuangan: (project.progressKeuangan ?? []) as ProgressKeuangan[],
        tagihanBelumDiproses: project.tagihanBelumDiproses?.toString() ?? '',
    });
    const [form, setForm] = useState(initForm);
    const [saving, setSaving] = useState(false);

    const resetForm = () => setForm(initForm());

    // Saldo kas otomatis bila belum diisi manual.
    const autoSaldoKas = (Number(form.cashIn) || 0) - (Number(form.cashOut) || 0);
    const displaySaldoKas = project.saldoKas ?? ((project.cashIn ?? 0) - (project.cashOut ?? 0));

    const save = async () => {
        setSaving(true);
        try {
            const huP = form.huPendapatan === '' ? null : Number(form.huPendapatan);
            const huB = form.huBiaya === '' ? null : Number(form.huBiaya);
            const puV = form.pu === '' ? null : Number(form.pu);
            const bkV = form.bk === '' ? null : Number(form.bk);
            await axios.patch(`/api/projects/${project._id}`, {
                cashIn: form.cashIn === '' ? undefined : Number(form.cashIn),
                cashOut: form.cashOut === '' ? undefined : Number(form.cashOut),
                saldoKas: form.saldoKas === '' ? autoSaldoKas : Number(form.saldoKas),
                saldoHutang: form.saldoHutang === '' ? undefined : Number(form.saldoHutang),
                bad: form.bad === '' ? undefined : Number(form.bad),
                piutang: form.piutang === '' ? undefined : Number(form.piutang),
                ccc: form.ccc === '' ? undefined : Number(form.ccc),
                bebanKonstruksi: form.bebanKonstruksi === '' ? undefined : Number(form.bebanKonstruksi),
                hasilUsaha: (huP != null || huB != null)
                    ? { pendapatan: huP ?? 0, biaya: huB ?? 0, laba: (huP ?? 0) - (huB ?? 0) }
                    : undefined,
                // PU/BK → LK dihitung otomatis di server bila keduanya ada.
                pu: puV ?? undefined,
                bk: bkV ?? undefined,
                lk: (puV != null && bkV != null) ? puV - bkV : undefined,
                progressKeuangan: form.progressKeuangan,
                tagihanBelumDiproses: form.tagihanBelumDiproses === '' ? undefined : Number(form.tagihanBelumDiproses),
            });
            toast.success('Finansial tersimpan');
            setEditing(false);
            onSaved();
        } catch { toast.error('Gagal menyimpan'); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Finansial" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { resetForm(); setEditing(false); }} onSave={save} saving={saving} />

            {!editing ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <MoneyCard label="Cash In (Penerimaan)"  value={project.cashIn}  icon={ArrowDownRight} tone="bg-emerald-500/10 border-emerald-500/20 text-emerald-400" />
                        <MoneyCard label="Cash Out (Pengeluaran)" value={project.cashOut} icon={ArrowUpRight}   tone="bg-rose-500/10 border-rose-500/20 text-rose-400" />
                        <MoneyCard label="Saldo Kas (Cash Balance)" value={displaySaldoKas} icon={Wallet}       tone="bg-sky-500/10 border-sky-500/20 text-sky-400" />
                        <MoneyCard label="Saldo Hutang"           value={project.saldoHutang} icon={CircleDollarSign} tone="bg-amber-500/10 border-amber-500/20 text-amber-400" />
                        <MoneyCard label="BAD (komponen hutang)"  value={project.bad} icon={CircleDollarSign} tone="bg-orange-500/10 border-orange-500/20 text-orange-400" />
                        <MoneyCard label="Piutang"                value={project.piutang} icon={CircleDollarSign} tone="bg-violet-500/10 border-violet-500/20 text-violet-400" />
                    </div>
                    {project.ccc != null && (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 flex items-center justify-between">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">CCC — Cash Conversion Cycle</div>
                                <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">{project.ccc} hari</div>
                            </div>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${project.ccc > 90 ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                {project.ccc > 90 ? '> 90 · Perhatian' : 'Normal'}
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <MoneyInput label="Cash In" value={form.cashIn} onChange={v => setForm({ ...form, cashIn: v })} hint="Total uang yang sudah masuk/diterima proyek." />
                    <MoneyInput label="Cash Out" value={form.cashOut} onChange={v => setForm({ ...form, cashOut: v })} hint="Total uang yang sudah keluar/dibelanjakan." />
                    <div>
                        <MoneyInput label="Saldo Kas (kosongkan = otomatis)" value={form.saldoKas} onChange={v => setForm({ ...form, saldoKas: v })} hint="Sisa kas. Dikosongkan = dihitung otomatis dari Cash In − Cash Out." />
                        <p className="mt-1 text-[11px] text-slate-500">Otomatis: {formatIDR(autoSaldoKas)}</p>
                    </div>
                    <MoneyInput label="Saldo Hutang" value={form.saldoHutang} onChange={v => setForm({ ...form, saldoHutang: v })} hint="Total hutang proyek saat ini." />
                    <MoneyInput label="BAD" value={form.bad} onChange={v => setForm({ ...form, bad: v })} hint="Beban yang Akan Dibayar — bagian dari hutang (lihat laporan cashflow)." />
                    <MoneyInput label="Piutang" value={form.piutang} onChange={v => setForm({ ...form, piutang: v })} hint="Uang yang masih ditunggu/belum dibayar ke proyek." />
                    <div>
                        <Input label="CCC (hari)" type="number" value={form.ccc} onChange={v => setForm({ ...form, ccc: v })} hint="Cash Conversion Cycle — lama perputaran kas dalam hari. Di atas 90 hari ditandai merah." />
                        <p className="mt-1.5 text-[11px] text-slate-500">&gt; 90 hari ditandai perhatian (merah).</p>
                    </div>
                    <MoneyInput label="Beban Konstruksi" value={form.bebanKonstruksi} onChange={v => setForm({ ...form, bebanKonstruksi: v })} hint="Total beban/biaya konstruksi proyek." />
                </div>
            )}

            {/* Kinerja Operasi: PU / BK / LK */}
            {!editing ? (
                (project.pu != null || project.bk != null || project.lk != null) ? (() => {
                    const lk = project.lk ?? ((project.pu ?? 0) - (project.bk ?? 0));
                    const rugi = lk < 0;
                    const margin = (project.pu && project.pu > 0) ? (lk / project.pu) * 100 : null;
                    return (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kinerja Operasi (PU / BK / LK)</h3>
                                {margin != null && (
                                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${rugi ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                        LK {margin.toFixed(1)}%
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">PU</div>
                                    <div className="text-sm font-black text-sky-400 font-mono mt-1">{formatIDRShort(project.pu)}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">BK</div>
                                    <div className="text-sm font-black text-rose-400 font-mono mt-1">{formatIDRShort(project.bk)}</div>
                                </div>
                                <div className={`p-3 rounded-xl text-center border ${rugi ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{rugi ? 'LK (Rugi)' : 'LK'}</div>
                                    <div className={`text-sm font-black font-mono mt-1 ${rugi ? 'text-rose-400' : 'text-emerald-400'}`}>{formatIDRShort(lk)}</div>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">PU · Pendapatan Usaha &nbsp; BK · Beban Konstruksi &nbsp; LK · Laba Kotor</p>
                        </div>
                    );
                })() : null
            ) : (
                <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center">Kinerja Operasi (PU / BK / LK)<InfoTip text="PU = Pendapatan Usaha, BK = Beban Konstruksi. LK (Laba Kotor) dihitung otomatis = PU − BK." /></h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <MoneyInput label="PU — Pendapatan Usaha" value={form.pu} onChange={v => setForm({ ...form, pu: v })} hint="Pendapatan usaha dari sisi operasi proyek." />
                        <MoneyInput label="BK — Beban Konstruksi" value={form.bk} onChange={v => setForm({ ...form, bk: v })} hint="Beban/biaya konstruksi dari sisi operasi proyek." />
                    </div>
                    <p className="text-[11px] text-slate-500">LK (Laba Kotor) dihitung otomatis: {formatIDR((Number(form.pu) || 0) - (Number(form.bk) || 0))}</p>
                </div>
            )}

            {/* Hasil Usaha */}
            {!editing ? (
                (project.hasilUsaha && (project.hasilUsaha.pendapatan || project.hasilUsaha.biaya)) ? (() => {
                    const { pendapatan, biaya, laba } = project.hasilUsaha!;
                    const margin = pendapatan > 0 ? (laba / pendapatan) * 100 : 0;
                    const rugi = laba < 0;
                    return (
                        <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Hasil Usaha (s.d periode)</h3>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${rugi ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
                                    Margin {margin.toFixed(2)}%
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pendapatan</div>
                                    <div className="text-sm font-black text-sky-400 font-mono mt-1">{formatIDRShort(pendapatan)}</div>
                                </div>
                                <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-center">
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Biaya (HPP)</div>
                                    <div className="text-sm font-black text-rose-400 font-mono mt-1">{formatIDRShort(biaya)}</div>
                                </div>
                                <div className={`p-3 rounded-xl text-center border ${rugi ? 'bg-rose-500/5 border-rose-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
                                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{rugi ? 'Rugi' : 'Laba'}</div>
                                    <div className={`text-sm font-black font-mono mt-1 ${rugi ? 'text-rose-400' : 'text-emerald-400'}`}>{formatIDRShort(laba)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })() : null
            ) : (
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
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold">
                            <Plus className="w-3.5 h-3.5" /> Tambah Tahun
                        </button>
                    </div>
                    {form.progressKeuangan.length === 0
                        ? <p className="text-sm text-slate-500 italic">Belum ada data DIPA.</p>
                        : form.progressKeuangan.map((pk, i) => (
                            <div key={i} className="grid grid-cols-4 gap-2 items-end">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Tahun</label>
                                    <input type="number" value={pk.tahun} onChange={e => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], tahun: Number(e.target.value) }; setForm(f => ({ ...f, progressKeuangan: a })); }} className="w-full mt-1 px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Pagu/Rencana (Rp)</label>
                                    <input type="number" value={pk.rencana} onChange={e => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], rencana: Number(e.target.value) }; setForm(f => ({ ...f, progressKeuangan: a })); }} className="w-full mt-1 px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Realisasi (Rp)</label>
                                    <input type="number" value={pk.realisasi} onChange={e => { const a = [...form.progressKeuangan]; a[i] = { ...a[i], realisasi: Number(e.target.value) }; setForm(f => ({ ...f, progressKeuangan: a })); }} className="w-full mt-1 px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <button onClick={() => setForm(f => ({ ...f, progressKeuangan: f.progressKeuangan.filter((_, j) => j !== i) }))} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors">
                                    <Minus className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    }
                    <div>
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Progress Belum Ditagihkan (Rp)</label>
                        <input type="number" value={form.tagihanBelumDiproses} onChange={e => setForm(f => ({ ...f, tagihanBelumDiproses: e.target.value }))} className="w-full mt-1 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Milestone ─────────────────────────────────────────────────────────────────
function MilestonesTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [list, setList] = useState<Milestone[]>(project.milestones ?? []);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try { await axios.patch(`/api/projects/${project._id}`, { milestones: list }); toast.success('Milestone tersimpan'); setEditing(false); onSaved(); }
        catch { toast.error('Gagal menyimpan'); } finally { setSaving(false); }
    };

    // Progress milestone individual (fallback: done => 100, else 0).
    const prog = (m: Milestone) => (m.progress != null ? m.progress : (m.done ? 100 : 0));
    // Progress keseluruhan = rata-rata progress tiap milestone.
    const overall = list.length ? list.reduce((a, m) => a + prog(m), 0) / list.length : 0;

    // Set progress satu milestone + sinkron 'done' (100% = selesai).
    const setProgress = (i: number, v: number) => {
        const p = Math.max(0, Math.min(100, Math.round(v)));
        const a = [...list];
        a[i] = { ...a[i], progress: p, done: p >= 100 };
        setList(a);
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Milestone" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setList(project.milestones ?? []); setEditing(false); }} onSave={save} saving={saving} />

            {list.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                    <div className="flex justify-between items-center mb-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Progress Keseluruhan</span>
                        <span className="text-slate-900 dark:text-white font-bold">{overall.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-emerald-500 transition-all duration-500" style={{ width: `${overall}%` }} />
                    </div>
                </div>
            )}

            {editing && (
                <button onClick={() => setList(s => [...s, { title: '', done: false, progress: 0 }])} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold">
                    <Plus className="w-3.5 h-3.5" /> Tambah Milestone
                </button>
            )}

            {list.length === 0 && !editing
                ? <EmptyState text="Belum ada milestone." />
                : editing
                ? (
                    <div className="space-y-3">
                        {list.map((m, i) => (
                            <div key={i} className="p-3.5 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex gap-2 items-center">
                                    <input placeholder="Judul milestone (mis. Pekerjaan Struktur)" value={m.title} onChange={e => { const a = [...list]; a[i] = { ...a[i], title: e.target.value }; setList(a); }} className="flex-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                    <input type="date" value={typeof m.date === 'string' ? m.date.slice(0, 10) : ''} onChange={e => { const a = [...list]; a[i] = { ...a[i], date: e.target.value }; setList(a); }} className="px-2.5 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-yellow-500/50" />
                                    <button onClick={() => setList(s => s.filter((_, j) => j !== i))} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16 shrink-0">Progress</span>
                                    <input type="range" min={0} max={100} step={1} value={prog(m)} onChange={e => setProgress(i, Number(e.target.value))} className="flex-1 accent-yellow-500" />
                                    <input type="number" min={0} max={100} value={prog(m)} onChange={e => setProgress(i, Number(e.target.value))} className="w-16 px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm text-center outline-none focus:border-yellow-500/50" />
                                    <span className="text-sm font-black text-yellow-400 w-6">%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {list.map((m, i) => {
                            const p = prog(m);
                            const complete = p >= 100;
                            return (
                                <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
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
                                        <div className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-emerald-500' : 'bg-gradient-to-r from-yellow-500 to-amber-400'}`} style={{ width: `${p}%` }} />
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
        catch { toast.error('Gagal menyimpan'); } finally { setSaving(false); }
    };

    return (
        <div className="space-y-4">
            <SectionHeader title="Change Management" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setList(project.changeManagement ?? []); setEditing(false); }} onSave={save} saving={saving} />
            <p className="text-xs text-slate-500 -mt-2">Daftar perubahan lingkup/kontrak. Kendala dapat dimasukkan ke sini dari tab Isu &amp; Kendala.</p>

            {editing && (
                <button onClick={() => setList(s => [...s, { judul: '', status: 'USULAN' }])} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold">
                    <Plus className="w-3.5 h-3.5" /> Tambah Perubahan
                </button>
            )}

            {list.length === 0 && !editing
                ? <EmptyState text="Belum ada change management." />
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
                                        <Select label="Status" value={cm.status} onChange={v => { const a = [...list]; a[i] = { ...a[i], status: v as any }; setList(a); }} options={[['USULAN', 'USULAN'], ['DISETUJUI', 'DISETUJUI'], ['DITOLAK', 'DITOLAK']]} />
                                    </div>
                                </div>
                                <button onClick={() => setList(s => s.filter((_, j) => j !== i))} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
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
                                                {cm.dariKendala && <span className="text-[10px] text-indigo-300/70 inline-flex items-center gap-1"><GitBranch className="w-3 h-3" /> Dari kendala</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${st.color}`}>{st.label}</span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-white/15 bg-white/[0.04] text-slate-600 dark:text-slate-300">
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
        if (typeof v === 'number') return true;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v as object).length > 0;
        return !!v;
    };
    const items: { label: string; done: boolean; tab: Tab }[] = [
        { label: 'Informasi (PIC, pelaksana, tanggal)', done: has(p.pmName) || has(p.penyediaJasa) || has(p.contractor) || has(p.startDate), tab: 'info' },
        { label: 'Kontrak (nomor & nilai)', done: has(p.contractNumber) || has(p.contractValue), tab: 'contract' },
        { label: 'Ikhtiar (CPI / SPI)', done: has(p.cpi) || has(p.spi), tab: 'ikhtiar' },
        { label: 'Finansial (cash / hutang / piutang)', done: has(p.cashIn) || has(p.cashOut) || has(p.saldoHutang) || has(p.piutang), tab: 'finansial' },
        { label: 'Hasil Usaha / Kinerja Operasi', done: has(p.hasilUsaha) || has(p.pu) || has(p.bk), tab: 'finansial' },
        { label: 'Progres fisik', done: has(p.progressPercent) || has(p.progressRencana), tab: 'progress' },
        { label: 'Milestone', done: has(p.milestones), tab: 'milestones' },
        { label: 'Sumber daya & pengadaan', done: has(p.sumberDaya) || has(p.monitoringPengadaan), tab: 'resources' },
        { label: 'Galeri / Dokumen', done: has(p.gallery) || has(p.documents), tab: 'gallery' },
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
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Belum diisi — klik untuk mengisi:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {missing.map((m, i) => (
                            <button
                                key={i}
                                onClick={() => onGoTab(m.tab)}
                                className="px-2.5 py-1 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-yellow-500/15 border border-black/10 dark:border-white/10 hover:border-yellow-500/40 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-yellow-400 transition-colors"
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
                            <span className="text-[10px] font-bold uppercase tracking-wider">{c.label}</span>
                        </div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white truncate">{c.value}</div>
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
                            <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">{lp}</span>
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
                    <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Fisik</h3>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
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
                        <circle cx={C} cy={C} r={R_OUT} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
                        <circle cx={C} cy={C} r={R_IN}  fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={STROKE - 2} />

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
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Realisasi</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-white leading-none my-0.5">
                            {realisasi.toFixed(2)}<span className="text-sm text-amber-400 font-extrabold">%</span>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold ${isAhead ? 'text-emerald-400' : 'text-rose-400'}`}>
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
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rencana</span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white font-mono">{rencana.toFixed(2)}%</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">Realisasi</span>
                    </div>
                    <span className="text-xs font-black text-amber-300 font-mono">{realisasi.toFixed(2)}%</span>
                </div>
                <div className={`p-2.5 rounded-xl border text-center ${
                    isAhead ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                }`}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${isAhead ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deviasi</span>
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
                        <CircleDollarSign className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Progress Keuangan</h3>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
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
                        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />

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
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Serapan</span>
                        <div className="text-3xl font-black text-slate-900 dark:text-white leading-none my-0.5">
                            {totalPct.toFixed(1)}<span className="text-sm text-sky-400 font-extrabold">%</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 font-bold truncate max-w-[130px]">
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
                                    <span className="text-sky-400 font-mono font-bold">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                    <span>Realisasi: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{formatIDRShort(pk.realisasi)}</strong></span>
                                    <span>Pagu: <strong className="text-slate-500 dark:text-slate-400 font-normal">{formatIDRShort(pk.rencana)}</strong></span>
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
                    <p className="text-xs text-slate-500 italic text-center py-2">Belum ada data DIPA keuangan.</p>
                )}

                {/* Belum ditagihkan callout */}
                {tagihanBelumDiproses != null && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">Belum ditagihkan:</span>
                        <span className="text-amber-400 font-bold font-mono">{formatIDR(tagihanBelumDiproses)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProgressBar({ label, percent, color, hidePct }: { label: string; percent: number; color: string; hidePct?: boolean }) {
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div>
            {label && (
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                    {!hidePct && <span className="text-xs font-bold text-slate-900 dark:text-white">{clamped.toFixed(2)}%</span>}
                </div>
            )}
            <div className="h-2.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                <motion.div
                    className={`h-full rounded-full ${color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${clamped}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />
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
        } catch { toast.error('Gagal menyimpan'); }
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
                        <Select label="Status" value={form.status} onChange={v => setForm({ ...form, status: v as any })} options={[['planning', 'Perencanaan'], ['ongoing', 'Berjalan'], ['completed', 'Selesai']]} />
                        <Input label="Tanggal Mulai"  type="date" value={form.startDate} onChange={v => setForm({ ...form, startDate: v })} />
                        <Input label="Tanggal Selesai" type="date" value={form.endDate} onChange={v => setForm({ ...form, endDate: v })} />
                        <Input label="PIC"            value={form.pmName}        onChange={v => setForm({ ...form, pmName: v })} />
                        <Input label="Kontak PIC"     value={form.pmPhone}       onChange={v => setForm({ ...form, pmPhone: v })} />
                        <div className="sm:col-span-2"><Textarea label="Deskripsi" value={form.description} onChange={v => setForm({ ...form, description: v })} /></div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Location ─────────────────────────────────────────────────────────────────
function LocationTab({ project }: { project: Project }) {
    return (
        <div className="space-y-4">
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
        } catch { toast.error('Gagal menyimpan'); }
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

            <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Berkas Kontrak</span>
                    {isAdmin && <UploadButton projectId={project._id} kind="contract" accept=".pdf,.doc,.docx,image/*" label="Unggah" onDone={onSaved} />}
                </div>
                {project.contractUrl ? (
                    <a href={project.contractUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-yellow-500/20 transition-colors">
                        <Download className="w-4 h-4" /> Lihat / Unduh Kontrak
                    </a>
                ) : (
                    <p className="mt-3 text-sm text-slate-500 italic">Belum ada berkas kontrak.</p>
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
            await axios.patch(`/api/projects/${project._id}`, { ...form });
            toast.success('Progres tersimpan');
            setEditing(false);
            onSaved();
        } catch { toast.error('Gagal menyimpan'); }
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
                                <input type="range" min={0} max={100} step={0.01} value={form.progressRencana} onChange={e => setForm({ ...form, progressRencana: Number(e.target.value) })} className="w-full mt-2 accent-slate-400" />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Realisasi: {form.progressPercent.toFixed(2)}%</label>
                                <input type="range" min={0} max={100} step={0.01} value={form.progressPercent} onChange={e => setForm({ ...form, progressPercent: Number(e.target.value) })} className="w-full mt-2 accent-yellow-500" />
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
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold">
                            <Plus className="w-3.5 h-3.5" /> Tambah
                        </button>
                    )}
                </div>
                {(editing ? form.lingkupPekerjaan : (project.lingkupPekerjaan || [])).length === 0
                    ? <p className="text-sm text-slate-500 italic">Belum ada lingkup pekerjaan.</p>
                    : editing
                    ? form.lingkupPekerjaan.map((lp, i) => (
                        <div key={i} className="flex gap-2">
                            <input value={lp} onChange={e => { const a = [...form.lingkupPekerjaan]; a[i] = e.target.value; setForm(f => ({ ...f, lingkupPekerjaan: a })); }} className="flex-1 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                            <button onClick={() => setForm(f => ({ ...f, lingkupPekerjaan: f.lingkupPekerjaan.filter((_, j) => j !== i) }))} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"><Minus className="w-4 h-4" /></button>
                        </div>
                    ))
                    : (
                        <div className="flex flex-wrap gap-2">
                            {(project.lingkupPekerjaan || []).map((lp, i) => (
                                <span key={i} className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">{lp}</span>
                            ))}
                        </div>
                    )
                }
            </div>
        </div>
    );
}

// ── Sumber Daya ──────────────────────────────────────────────────────────────
function ResourcesTab({ project, isAdmin, onSaved }: { project: Project; isAdmin: boolean; onSaved: () => void }) {
    const [editing, setEditing] = useState(false);
    const [sumberDaya, setSumberDaya] = useState<SumberDaya[]>(project.sumberDaya ?? []);
    const [saving, setSaving] = useState(false);

    // Monitoring Pengadaan (major item) — section terpisah dengan save sendiri.
    const [editingMon, setEditingMon] = useState(false);
    const [monitoring, setMonitoring] = useState<MonitoringPengadaan[]>(project.monitoringPengadaan ?? []);
    const [savingMon, setSavingMon] = useState(false);

    const saveMonitoring = async () => {
        setSavingMon(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { monitoringPengadaan: monitoring });
            toast.success('Monitoring pengadaan tersimpan');
            setEditingMon(false);
            onSaved();
        } catch { toast.error('Gagal menyimpan'); }
        finally { setSavingMon(false); }
    };

    const save = async () => {
        setSaving(true);
        try {
            await axios.patch(`/api/projects/${project._id}`, { sumberDaya });
            toast.success('Sumber daya tersimpan');
            setEditing(false);
            onSaved();
        } catch { toast.error('Gagal menyimpan'); }
        finally { setSaving(false); }
    };

    // Kelompokkan berdasarkan kategori (bebas). Item tanpa kategori → "Lainnya".
    const grouped = sumberDaya.reduce<Record<string, { item: SumberDaya; idx: number }[]>>((acc, sd, idx) => {
        const key = (sd.kategori || '').trim() || 'Lainnya';
        (acc[key] ||= []).push({ item: sd, idx });
        return acc;
    }, {});

    return (
        <div className="space-y-4">
            <SectionHeader title="Sumber Daya" isAdmin={isAdmin} editing={editing} onEdit={() => setEditing(true)} onCancel={() => { setSumberDaya(project.sumberDaya ?? []); setEditing(false); }} onSave={save} saving={saving} />

            {editing && (
                <button onClick={() => setSumberDaya(s => [...s, { namaAlat: '', jumlah: 0, kategori: '', satuan: 'Unit' }])}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold">
                    <Plus className="w-3.5 h-3.5" /> Tambah Sumber Daya
                </button>
            )}

            {sumberDaya.length === 0 && !editing
                ? <EmptyState text="Belum ada data sumber daya." />
                : editing
                ? (
                    <div className="space-y-2">
                        {sumberDaya.map((sd, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                <div className="sm:col-span-4">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Nama</label>
                                    <input placeholder="mis. Excavator, Tukang, Besi Beton" value={sd.namaAlat} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], namaAlat: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Kategori</label>
                                    <input list="sd-kategori" placeholder="Alat Berat / Tenaga Kerja / Material" value={sd.kategori ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], kategori: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Jumlah</label>
                                    <input type="number" min={0} value={sd.jumlah} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], jumlah: Math.max(0, Number(e.target.value)) }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-bold">Satuan</label>
                                    <input list="sd-satuan" placeholder="Unit / Orang / m³" value={sd.satuan ?? ''} onChange={e => { const a = [...sumberDaya]; a[i] = { ...a[i], satuan: e.target.value }; setSumberDaya(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                </div>
                                <div className="sm:col-span-1 flex sm:justify-center">
                                    <button onClick={() => setSumberDaya(s => s.filter((_, j) => j !== i))} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                        <datalist id="sd-kategori">
                            <option value="Alat Berat" />
                            <option value="Tenaga Kerja" />
                            <option value="Material" />
                            <option value="Kendaraan" />
                            <option value="Peralatan" />
                        </datalist>
                        <datalist id="sd-satuan">
                            <option value="Unit" />
                            <option value="Orang" />
                            <option value="m³" />
                            <option value="Ton" />
                            <option value="Set" />
                            <option value="Buah" />
                        </datalist>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {Object.entries(grouped).map(([kategori, items]) => (
                            <div key={kategori}>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{kategori}</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {items.map(({ item: sd }, i) => (
                                        <div key={i} className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 text-center">
                                            <div className={`text-3xl font-black mb-1 ${sd.jumlah > 0 ? 'text-yellow-400' : 'text-slate-600'}`}>{sd.jumlah}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{sd.namaAlat || '-'}</div>
                                            <div className="text-[10px] text-slate-600 uppercase tracking-wider">{sd.satuan || 'Unit'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            {/* ── Monitoring Pengadaan (major item) ── */}
            <div className="pt-6 mt-2 border-t border-black/5 dark:border-white/5">
                <SectionHeader title="Monitoring Pengadaan" isAdmin={isAdmin} editing={editingMon} onEdit={() => setEditingMon(true)} onCancel={() => { setMonitoring(project.monitoringPengadaan ?? []); setEditingMon(false); }} onSave={saveMonitoring} saving={savingMon} />
                <p className="text-xs text-slate-500 -mt-2 mb-3">Major item pengadaan beserta persentase progresnya.</p>

                {editingMon && (
                    <button onClick={() => setMonitoring(s => [...s, { nama: '', persentase: 0 }])}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold mb-3">
                        <Plus className="w-3.5 h-3.5" /> Tambah Item
                    </button>
                )}

                {monitoring.length === 0 && !editingMon
                    ? <EmptyState text="Belum ada data monitoring pengadaan." />
                    : editingMon
                    ? (
                        <div className="space-y-2">
                            {monitoring.map((mp, i) => (
                                <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                                    <div className="sm:col-span-8">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold">Nama Item</label>
                                        <input placeholder="mis. Pengadaan Besi Beton" value={mp.nama} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], nama: e.target.value }; setMonitoring(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <label className="text-[10px] text-slate-500 uppercase font-bold">Persentase (%)</label>
                                        <input type="number" min={0} max={100} value={mp.persentase} onChange={e => { const a = [...monitoring]; a[i] = { ...a[i], persentase: Math.max(0, Math.min(100, Number(e.target.value))) }; setMonitoring(a); }} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm outline-none focus:border-yellow-500/50" />
                                    </div>
                                    <div className="sm:col-span-1 flex sm:justify-center">
                                        <button onClick={() => setMonitoring(s => s.filter((_, j) => j !== i))} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"><Trash2 className="w-4 h-4" /></button>
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
        catch { toast.error('Gagal menyimpan'); } finally { setSaving(false); }
    };
    const saveKendala = async () => {
        setSaving(true);
        try { await axios.patch(`/api/projects/${project._id}`, { kendala: kendalaList }); toast.success('Kendala tersimpan'); setEditingKendala(false); onSaved(); }
        catch { toast.error('Gagal menyimpan'); } finally { setSaving(false); }
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
                            <button onClick={() => { setIsuList(project.isuStrategis ?? []); setEditingIsu(false); }} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveIsu} disabled={saving} className="px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            {editingIsu === false && <button onClick={() => setIsuList(s => [...s, { isu: '', usulan: '' }])} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Tambah</button>}
                            <button onClick={() => setEditingIsu(true)} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
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
                                <button onClick={() => setIsuList(s => s.filter((_, j) => j !== i))} className="p-2 h-fit rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"><Trash2 className="w-4 h-4" /></button>
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
                            <button onClick={() => { setKendalaList(project.kendala ?? []); setEditingKendala(false); }} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Batal</button>
                            <button onClick={saveKendala} disabled={saving} className="px-3 py-2 rounded-xl bg-yellow-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan</button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => setKendalaList(s => [...s, { masalah: '', penyebab: '', tindakan: '', status: 'OPEN' }])} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Tambah</button>
                            <button onClick={() => setEditingKendala(true)} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
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
                                <Select label="Status" value={k.status} onChange={v => { const a = [...kendalaList]; a[i] = { ...a[i], status: v as any }; setKendalaList(a); }} options={[['OPEN','OPEN'],['ON_PROGRESS','ON PROGRESS'],['CLOSED','CLOSED']]} />
                            </div>
                            <button onClick={() => setKendalaList(s => s.filter((_, j) => j !== i))} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Hapus</button>
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
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${ks.color}`}>{ks.label}</span>
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
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/20 transition-colors disabled:opacity-60"
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
                            <button type="button" onClick={() => setLightbox(i)} className="block w-full cursor-zoom-in">
                                <img src={g.url!} alt={g.caption || ''} loading="lazy" className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]" />
                            </button>
                            {g.caption && <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-[10px] text-slate-700 dark:text-slate-200 truncate pointer-events-none">{g.caption}</div>}
                            {isAdmin && (
                                <button onClick={() => del(g.key)} className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 text-rose-400 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {lightbox !== null && items[lightbox] && (
                <Lightbox
                    items={items}
                    index={lightbox}
                    onClose={() => setLightbox(null)}
                    onNavigate={setLightbox}
                />
            )}
        </div>
    );
}

// ── Lightbox (preview galeri) ──────────────────────────────────────────────────
function Lightbox({ items, index, onClose, onNavigate }: {
    items: GalleryItem[];
    index: number;
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

    return (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
            {/* Tutup */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white transition-colors z-10" title="Tutup (Esc)">
                <X className="w-5 h-5" />
            </button>

            {/* Counter — selalu di atas backdrop gelap lightbox */}
            <div className="absolute top-5 left-5 text-xs font-bold text-white/80 bg-white/10 rounded-full px-3 py-1 z-10">
                {index + 1} / {total}
            </div>

            {/* Prev */}
            {total > 1 && (
                <button onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-3 sm:left-6 p-3 rounded-full bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white transition-colors z-10" title="Sebelumnya (←)">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}

            {/* Gambar */}
            <div className="max-w-[92vw] max-h-[88vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <img src={cur.url!} alt={cur.caption || ''} className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl" />
                {cur.caption && <p className="mt-3 text-sm text-slate-700 dark:text-slate-200 text-center max-w-2xl px-4">{cur.caption}</p>}
            </div>

            {/* Next */}
            {total > 1 && (
                <button onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-3 sm:right-6 p-3 rounded-full bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white transition-colors z-10" title="Berikutnya (→)">
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}
        </div>
    );
}

// ── Documents ──────────────────────────────────────────────────────────────────
function DocumentsTab({ project, isAdmin, onChanged }: { project: Project; isAdmin: boolean; onChanged: () => void }) {
    const { confirm, ConfirmDialog } = useConfirm();
    const doDelete = async (key: string) => {
        try { await axios.delete(`/api/projects/${project._id}?kind=documents&key=${encodeURIComponent(key)}`); toast.success('Dokumen dihapus'); onChanged(); }
        catch { toast.error('Gagal menghapus'); }
    };
    const del = (key: string, name: string) => confirm('Hapus Dokumen', `Dokumen "${name}" akan dihapus permanen. Lanjutkan?`, () => doDelete(key));
    return (
        <div className="space-y-4">
            {ConfirmDialog}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Dokumen</h3>
                {isAdmin && <UploadButton projectId={project._id} kind="documents" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.7z,.dwg,.dxf,image/*" label="Unggah Dokumen" onDone={onChanged} />}
            </div>
            {(project.documents || []).length === 0 ? <EmptyState text="Belum ada dokumen." /> : (
                <div className="space-y-2">
                    {(project.documents || []).map(d => (
                        <div key={d.key} className="flex items-center gap-3 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                            <div className="p-2 rounded-lg bg-yellow-500/10 shrink-0"><FileText className="w-5 h-5 text-yellow-500" /></div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{d.name}</div>
                                <div className="text-[10px] text-slate-500">{formatBytes(d.size)} · {formatDate(d.uploadedAt)}</div>
                            </div>
                            {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors shrink-0"><Download className="w-4 h-4" /></a>}
                            {isAdmin && <button onClick={() => del(d.key, d.name)} className="p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-rose-400 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                    ))}
                </div>
            )}
        </div>
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

    const ConfirmDialog = (
        <AnimatePresence>
            {state.open && (
                <motion.div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={close}
                >
                    <motion.div
                        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 shadow-2xl p-6"
                        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">{state.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{state.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={close} className="px-4 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-sm font-bold transition-colors">Batal</button>
                            <button
                                onClick={() => { state.onConfirm?.(); close(); }}
                                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-900 dark:text-white text-sm font-bold transition-colors flex items-center gap-1.5"
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
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
            {isAdmin && (editing ? (
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Batal</button>
                    <button onClick={onSave} disabled={saving} className="px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                    </button>
                </div>
            ) : (
                <button onClick={onEdit} className="px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            ))}
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string }) {
    return (
        <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
            <div className="text-sm text-slate-900 dark:text-white break-words">{value || '-'}</div>
        </div>
    );
}
function MiniField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
            <div className="text-xs text-slate-600 dark:text-slate-300">{value}</div>
        </div>
    );
}
function Input({ label, value, onChange, type = 'text', hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; hint?: string }) {
    return (
        <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center">{label}{hint && <InfoTip text={hint} />}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-yellow-500/50 outline-none" />
        </div>
    );
}

// ── (C) Tooltip penjelasan istilah — ikon "?" kecil di samping label ──────────
function InfoTip({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    return (
        <span className="relative inline-flex items-center ml-1 align-middle">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="w-3.5 h-3.5 rounded-full bg-black/[0.06] dark:bg-white/10 hover:bg-yellow-500/30 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[9px] font-black leading-none transition-colors"
                aria-label="Penjelasan"
            >?</button>
            {open && (
                <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-56 p-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 border border-white/15 shadow-2xl text-[11px] font-normal normal-case tracking-normal text-slate-700 dark:text-slate-200 leading-snug pointer-events-none">
                    {text}
                </span>
            )}
        </span>
    );
}

// ── (A) Input angka uang: format ribuan live + preview "Rp ..." + tombol cepat ─
// Nilai internal tetap angka polos (string digit). Tampilan diformat ribuan.
function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center">{label}{hint && <InfoTip text={hint} />}</label>
            <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold pointer-events-none">Rp</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={grouped}
                    onChange={e => setDigits(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-mono focus:border-yellow-500/50 outline-none"
                />
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
                <div className="flex gap-1">
                    <button type="button" onClick={() => mult(1_000)} className="px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-[9px] font-bold text-slate-500 dark:text-slate-400 transition-colors">×1.000</button>
                    <button type="button" onClick={() => mult(1_000_000)} className="px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-[9px] font-bold text-slate-500 dark:text-slate-400 transition-colors">× juta</button>
                    <button type="button" onClick={() => mult(1_000_000_000)} className="px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-[9px] font-bold text-slate-500 dark:text-slate-400 transition-colors">× miliar</button>
                    {digits && <button type="button" onClick={() => onChange('')} className="px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-[9px] font-bold text-slate-500 dark:text-slate-400 hover:text-rose-300 transition-colors">bersihkan</button>}
                </div>
                {digits && <span className="text-[10px] font-bold text-emerald-400/80 font-mono truncate">{formatIDRShort(n)}</span>}
            </div>
        </div>
    );
}
function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</label>
            <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-yellow-500/50 outline-none resize-y" />
        </div>
    );
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
    return (
        <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-yellow-500/50 outline-none">
                {options.map(([v, l]) => <option key={v} value={v} className="bg-white dark:bg-slate-900">{l}</option>)}
            </select>
        </div>
    );
}
function EmptyState({ text }: { text: string }) {
    return <div className="py-16 text-center text-slate-500 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-sm">{text}</div>;
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
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Gagal mengunggah');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <>
            <input ref={inputRef} type="file" accept={accept} onChange={handleFile} className="hidden" />
            <button onClick={() => inputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-60">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {label}
            </button>
        </>
    );
}
