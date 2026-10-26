"use client";

import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { 
    Monitor, MapPin, Tags, Link2, BarChart3, Activity, 
    ClipboardList, Wifi, WifiOff, ArrowUpRight, 
    ShieldCheck, AlertTriangle, PlayCircle, RefreshCw,
    CheckCircle2, ArrowRight, FileDown, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { containerVariants, cardVariants } from '@/components/admin/shared';
import toast from 'react-hot-toast';
import { swrFetcher } from '@/lib/swrFetcher';
import { useTheme } from '@/components/ThemeProvider';

// Bentuk minimal data yang dipakai dashboard (hasil API)
interface DashCamera {
    _id: string;
    name: string;
    status: string;
    streamUrl?: string;
}
interface DashLocation {
    _id: string;
    name: string;
    cameras?: (string | { _id?: string })[];
}
interface DashShareLink {
    isActive: boolean;
}
interface DashAuditLog {
    _id: string;
    action: string;
    entity: string;
    entityName?: string;
    detail?: string;
    by?: string;
    timestamp: string;
}
function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ', ' +
        d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

// Aktor audit tersimpan lengkap ("Nama <email> (sub:..., ip:...)"). Kartu ringkas
// cukup menampilkan nama; detail lengkap tetap ada di halaman Audit Log.
function displayActor(by?: string): string {
    if (!by) return "-";
    return by.split(/\s*[<(]/)[0].trim() || by;
}

export default function AdminOverviewDashboard() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const axisColor = isDark ? '#94a3b8' : '#475569';

    // Data Fetching
    // includeStreamUrl=1: dashboard PDF export includes the stream URL column.
    const { data: cameraData, isLoading: loadingCameras, mutate: refreshCameras } = useSWR('/api/cameras?includeStreamUrl=1', swrFetcher);
    const { data: locationData, mutate: refreshLocations } = useSWR('/api/locations', swrFetcher);
    const { data: categoryData } = useSWR('/api/categories', swrFetcher);
    const { data: shareLinkData } = useSWR('/api/share-links', swrFetcher);
    const { data: statsData } = useSWR('/api/stats/summary?days=7', swrFetcher);
    const { data: auditData, mutate: refreshAudit } = useSWR('/api/admin/audit-log?limit=5', swrFetcher);

    const [currentTime, setCurrentTime] = useState<string>('');
    const [isExportingPDF, setIsExportingPDF] = useState(false);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleDateString('id-ID', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            }) + ' • ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB');
        };
        updateTime();
        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);

    const cameras = useMemo<DashCamera[]>(() => cameraData?.data || [], [cameraData]);
    const locations = useMemo<DashLocation[]>(() => locationData?.data || [], [locationData]);
    const categories = Array.isArray(categoryData) ? categoryData : (categoryData?.data || []);
    const shareLinks: DashShareLink[] = shareLinkData?.data || [];
    const auditLogs: DashAuditLog[] = auditData?.data || [];

    // Computed Stats
    const onlineCameras = cameras.filter((c) => c.status === 'online');
    const offlineCameras = cameras.filter((c) => c.status === 'offline');
    const totalCameras = cameras.length;
    // Tanpa data kamera (masih memuat / belum ada) jangan tampilkan 100% yang menyesatkan.
    const hasCameraData = totalCameras > 0;
    const availabilityRate = hasCameraData
        ? Math.round((onlineCameras.length / totalCameras) * 100)
        : 0;

    // Assigned vs Unassigned Cameras
    const cameraToLocationMap = useMemo(() => {
        const map = new Map<string, { id: string; name: string }[]>();
        locations.forEach((loc) => {
            if (Array.isArray(loc.cameras)) {
                loc.cameras.forEach((cam) => {
                    const cid = typeof cam === 'string' ? cam : cam._id;
                    if (cid) {
                        const existing = map.get(cid) || [];
                        existing.push({ id: loc._id, name: loc.name });
                        map.set(cid, existing);
                    }
                });
            }
        });
        return map;
    }, [locations]);

    const unassignedCameras = cameras.filter((c) => !cameraToLocationMap.has(c._id));

    // Visitor Stats
    const totalVisits = statsData?.data?.summary?.totalVisits || 0;
    const uniqueVisitors = statsData?.data?.summary?.uniqueVisitors || 0;
    const dailyVisits = statsData?.data?.dailyVisits || [];

    const handleRefreshAll = () => {
        refreshCameras();
        refreshLocations();
        refreshAudit();
        toast.success('Data dashboard diperbarui');
    };

    const handleExportPDF = async () => {
        setIsExportingPDF(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text('LAPORAN RINGKASAN SISTEM TENGOK CCTV', 14, 20);
            doc.setFontSize(10);
            doc.text(`Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 28);
            doc.text(`Total Kamera: ${totalCameras} | Online: ${onlineCameras.length} | Offline: ${offlineCameras.length} | SLA: ${availabilityRate}%`, 14, 34);

            const tableRows = cameras.map((c, i: number) => {
                const locs = (cameraToLocationMap.get(c._id) || []).map(l => l.name).join(', ') || 'Belum Terpasang';
                return [i + 1, c.name, locs, c.status.toUpperCase(), c.streamUrl || '-'];
            });

            autoTable(doc, {
                startY: 40,
                head: [['No', 'Nama Kamera', 'Lokasi', 'Status', 'Stream URL']],
                body: tableRows,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [234, 179, 8], textColor: [0, 0, 0] },
            });

            doc.save(`rekap-tengok-cctv-${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success('Laporan PDF berhasil diunduh');
        } catch (err) {
            console.error('Failed to export PDF', err);
            toast.error('Gagal membuat laporan PDF');
        } finally {
            setIsExportingPDF(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-36 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div aria-hidden="true" className="w-2 h-2 rounded-full bg-emerald-400 animate-ping motion-reduce:animate-none" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Sistem Berjalan Aktif</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                            Executive Dashboard
                        </h1>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
                            {currentTime || 'Pusat Komando & Analitik Pengawasan Terpadu TENGOK'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                            onClick={handleExportPDF}
                            disabled={isExportingPDF}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 min-h-11"
                        >
                            {isExportingPDF ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-yellow-700 dark:text-yellow-500" /> : <FileDown aria-hidden="true" className="w-4 h-4" />}
                            Export PDF
                        </button>
                        <Link
                            href="/multiview"
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider min-h-11"
                        >
                            <PlayCircle aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" />
                            Multi-View
                        </Link>
                        <button
                            onClick={handleRefreshAll}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none min-w-11 min-h-11 inline-flex items-center justify-center p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                            title="Segarkan Data"
                            aria-label="Segarkan data dashboard"
                        >
                            <RefreshCw aria-hidden="true" className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Primary KPI Metrics Grid */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    {/* KPI 1: CCTV Status & Health */}
                    <motion.div 
                        variants={cardVariants}
                        className="bg-gradient-to-br from-white/90 dark:from-slate-900/90 to-slate-200/50 dark:to-slate-900/40 border border-black/10 dark:border-white/10 p-5 rounded-3xl relative overflow-hidden shadow-lg"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kamera CCTV</span>
                            <div className="p-2.5 rounded-2xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                                <Monitor aria-hidden="true" className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{totalCameras}</span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Unit</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-black/5 dark:border-white/5">
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                                <Wifi aria-hidden="true" className="w-3.5 h-3.5" />
                                <span>{onlineCameras.length} Online</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-bold">
                                <WifiOff aria-hidden="true" className="w-3.5 h-3.5" />
                                <span>{offlineCameras.length} Offline</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* KPI 2: Overall SLA Availability Gauge */}
                    <motion.div 
                        variants={cardVariants}
                        className="bg-gradient-to-br from-white/90 dark:from-slate-900/90 to-slate-200/50 dark:to-slate-900/40 border border-black/10 dark:border-white/10 p-5 rounded-3xl relative overflow-hidden shadow-lg"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kesiapan Sistem (SLA)</span>
                            <div className={`p-2.5 rounded-2xl ${!hasCameraData ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400' : availabilityRate >= 85 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'}`}>
                                <Activity aria-hidden="true" className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className={`text-3xl font-extrabold tracking-tight ${!hasCameraData ? 'text-slate-500 dark:text-slate-400' : availabilityRate >= 85 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                {hasCameraData ? `${availabilityRate}%` : '—'}
                            </span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Availability</span>
                        </div>
                        <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5">
                            <div className="w-full bg-black/[0.04] dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${availabilityRate >= 85 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-rose-500 to-amber-500'}`}
                                    style={{ width: `${availabilityRate}%` }}
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* KPI 3: Total Projects & Locations */}
                    <motion.div 
                        variants={cardVariants}
                        className="bg-gradient-to-br from-white/90 dark:from-slate-900/90 to-slate-200/50 dark:to-slate-900/40 border border-black/10 dark:border-white/10 p-5 rounded-3xl relative overflow-hidden shadow-lg"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lokasi Proyek</span>
                            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-700 dark:text-blue-400">
                                <MapPin aria-hidden="true" className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{locations.length}</span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Titik Pantau</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-black/5 dark:border-white/5 text-slate-500 dark:text-slate-400">
                            <span>{categories.length} Kategori</span>
                            <Link href="/admin/locations" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-blue-700 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold flex items-center gap-0.5">
                                Kelola <ArrowUpRight aria-hidden="true" className="w-3 h-3" />
                            </Link>
                        </div>
                    </motion.div>

                    {/* KPI 4: Public Share Links & Traffic */}
                    <motion.div 
                        variants={cardVariants}
                        className="bg-gradient-to-br from-white/90 dark:from-slate-900/90 to-slate-200/50 dark:to-slate-900/40 border border-black/10 dark:border-white/10 p-5 rounded-3xl relative overflow-hidden shadow-lg"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Share Link Aktif</span>
                            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-700 dark:text-purple-400">
                                <Link2 aria-hidden="true" className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{shareLinks.filter((s) => s.isActive).length}</span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Akses Dibagikan</span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-black/5 dark:border-white/5 text-slate-500 dark:text-slate-400">
                            <span>{uniqueVisitors} Pengunjung (7h)</span>
                            <Link href="/admin/share-links" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-purple-700 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-bold flex items-center gap-0.5">
                                Buat Link <ArrowUpRight aria-hidden="true" className="w-3 h-3" />
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Section: Alert Widgets & Traffic Chart Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left 2 Cols: Critical Alerts & Unassigned Cameras */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Critical Offline Alert Widget */}
                        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl">
                            <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-2xl ${offlineCameras.length > 0 ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                                        {offlineCameras.length > 0 ? <AlertTriangle aria-hidden="true" className="w-5 h-5" /> : <CheckCircle2 aria-hidden="true" className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white text-base">Status Pengawasan Kritis</h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            {loadingCameras && !hasCameraData
                                                ? 'Memuat status kamera...'
                                                : offlineCameras.length > 0 
                                                ? `${offlineCameras.length} unit CCTV membutuhkan perhatian teknis segera` 
                                                : 'Seluruh perangkat CCTV terhubung dan streaming stabil'}
                                        </p>
                                    </div>
                                </div>
                                <Link 
                                    href="/admin/cameras?filter=offline"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-xs font-bold text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400 flex items-center gap-1"
                                >
                                    Lihat Semua <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            <div className="mt-4">
                                {offlineCameras.length === 0 && loadingCameras && !hasCameraData ? (
                                    <div className="p-6 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 text-center text-xs text-slate-500 dark:text-slate-400" role="status">
                                        Memuat status kamera...
                                    </div>
                                ) : offlineCameras.length === 0 ? (
                                    <div className="p-6 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 text-center space-y-2">
                                        <ShieldCheck aria-hidden="true" className="w-10 h-10 text-emerald-700 dark:text-emerald-400 mx-auto" />
                                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">100% Kamera Beroperasi Normal</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                                            Tidak ada gangguan koneksi stream pada seluruh lokasi yang terdaftar saat ini.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {offlineCameras.slice(0, 4).map((cam) => {
                                            const locs = cameraToLocationMap.get(cam._id) || [];
                                            return (
                                                <div 
                                                    key={cam._id} 
                                                    className="flex items-center justify-between p-3.5 rounded-2xl bg-rose-500/[0.03] border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-slate-900 dark:text-white text-xs truncate">{cam.name}</span>
                                                                <span className="text-[11px] text-rose-700 dark:text-rose-400 font-bold uppercase bg-rose-500/10 px-2 py-0.5 rounded-full">Offline</span>
                                                            </div>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                                📍 {locs.map(l => l.name).join(', ') || 'Belum Terpasang ke Lokasi'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <Link
                                                        href={`/admin/cameras`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-all shrink-0 ml-3 min-h-11"
                                                    >
                                                        Diagnosa
                                                    </Link>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 7-Day Traffic Trends */}
                        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl">
                            <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/5">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                                        <BarChart3 aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" />
                                        Tren Kunjungan Pengawasan (7 Hari Terakhir)
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Total {totalVisits} impresi tayangan streaming</p>
                                </div>
                                <Link 
                                    href="/admin/statistics"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-xs font-bold text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400 flex items-center gap-1"
                                >
                                    Laporan Lengkap <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            <div className="h-56 mt-4 w-full" role="img" aria-label={`Grafik area tren kunjungan 7 hari terakhir, total ${totalVisits} tayangan`}>
                                {dailyVisits.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-slate-500 text-xs font-bold">
                                        Belum ada data kunjungan yang tercatat
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={dailyVisits}>
                                            <defs>
                                                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.4}/>
                                                    <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="date" stroke={axisColor} tick={{ fill: axisColor }} fontSize={11} tickLine={false} />
                                            <YAxis stroke={axisColor} tick={{ fill: axisColor }} fontSize={11} tickLine={false} axisLine={false} />
                                            <Tooltip 
                                                contentStyle={{ 
                                                    backgroundColor: isDark ? '#0f172a' : '#ffffff', 
                                                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(15,23,42,0.12)', 
                                                    borderRadius: '12px',
                                                    fontSize: '11px',
                                                    color: isDark ? '#fff' : '#0f172a'
                                                }} 
                                            />
                                            <Area 
                                                type="monotone" 
                                                dataKey="views" 
                                                name="Total Kunjungan"
                                                stroke={isDark ? '#eab308' : '#ca8a04'} 
                                                strokeWidth={2}
                                                fillOpacity={1} 
                                                fill="url(#colorViews)" 
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right 1 Col: Unassigned Cameras & Recent Audit Activity */}
                    <div className="space-y-6">
                        {/* Unassigned Cameras Card */}
                        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl">
                            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                        <AlertTriangle aria-hidden="true" className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Kamera Belum Terpasang</h3>
                                </div>
                                <span className="text-xs font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                    {unassignedCameras.length}
                                </span>
                            </div>

                            <div className="mt-3">
                                {unassignedCameras.length === 0 ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                                        Semua kamera sudah dipasangkan ke lokasi proyek.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            Kamera berikut sudah terdaftar di sistem namun belum dimasukkan ke titik lokasi manapun:
                                        </p>
                                        <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                                            {unassignedCameras.slice(0, 5).map((cam) => (
                                                <div key={cam._id} className="flex items-center justify-between p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-xs">
                                                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">{cam.name}</span>
                                                    <Link 
                                                        href="/admin/cameras" 
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-[11px] font-bold text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400"
                                                    >
                                                        Pasangkan →
                                                    </Link>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Activity / Audit Feed */}
                        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                                        <ClipboardList aria-hidden="true" className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Aktivitas Terkini</h3>
                                </div>
                                <Link 
                                    href="/admin/audit-log"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-xs font-bold text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400"
                                >
                                    Semua Log →
                                </Link>
                            </div>

                            <div className="space-y-3">
                                {auditLogs.length === 0 ? (
                                    <p className="text-xs text-slate-500 py-4 text-center">Belum ada rekaman audit</p>
                                ) : (
                                    auditLogs.slice(0, 5).map((log) => (
                                        <div key={log._id} className="p-3 rounded-2xl bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-1">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className={`font-bold px-1.5 py-0.5 rounded ${
                                                    log.action === 'CREATE' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                                                    log.action === 'UPDATE' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' :
                                                    'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                                }`}>
                                                    {log.action} • {log.entity}
                                                </span>
                                                <span className="text-slate-500 font-mono">{formatDate(log.timestamp)}</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{log.entityName}</p>
                                            <div className="flex flex-col gap-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                <span className="line-clamp-2 break-words">{log.detail}</span>
                                                <span className="text-yellow-700 dark:text-yellow-500/90 font-medium truncate" title={log.by}>Oleh: {displayActor(log.by)}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Quick Navigation Hub */}
                <div className="pt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 ml-1">
                        Pusat Akses Cepat Modul
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {[
                            { name: 'Kamera', href: '/admin/cameras', icon: Monitor, color: 'text-yellow-700 dark:text-yellow-400', desc: 'RTSP & Streams' },
                            { name: 'Lokasi Proyek', href: '/admin/locations', icon: MapPin, color: 'text-blue-700 dark:text-blue-400', desc: 'Peta & Titik CCTV' },
                            { name: 'Kategori', href: '/admin/categories', icon: Tags, color: 'text-emerald-700 dark:text-emerald-400', desc: 'Sektor & Wilayah' },
                            { name: 'Share Links', href: '/admin/share-links', icon: Link2, color: 'text-purple-700 dark:text-purple-400', desc: 'Token Berbagi' },
                            { name: 'Statistik', href: '/admin/statistics', icon: BarChart3, color: 'text-orange-700 dark:text-orange-400', desc: 'Analitik Trafik' },
                            { name: 'Audit Log', href: '/admin/audit-log', icon: ClipboardList, color: 'text-teal-700 dark:text-teal-400', desc: 'Log Keamanan' },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 hover:border-yellow-500/30 hover:bg-white dark:hover:bg-slate-900/90 transition-all group space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <Icon aria-hidden="true" className={`w-5 h-5 ${item.color} group-hover:scale-110 transition-transform`} />
                                        <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white text-xs tracking-tight">{item.name}</h4>
                                        <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
