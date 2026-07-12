"use client";

import { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { Loader2, Users, Eye, BarChart3, Smartphone, TrendingUp, Activity, Globe, MapPin, Share2, Layout, Monitor, Sparkles, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { containerVariants, cardVariants } from '@/components/admin/shared';
import { PageHeader } from '@/components/admin/AdminUI';

interface StatsData {
    summary: {
        totalVisits: number;
        uniqueVisitors: number;
        liveVisitors: number;
    };
    visitsBySource: { page: string; label: string; count: number }[];
    deviceStats: { name: string; value: number }[];
    dailyVisits: { date: string; views: number; unique: number }[];
    popularLinks: { name: string; token: string; views: number }[];
}

const DEVICE_ICONS: Record<string, React.ElementType> = {
    'Mobile': Smartphone,
    'Desktop': Monitor,
    'Tablet': Layout,
};
const DEVICE_COLORS: Record<string, string> = {
    'Mobile': '#eab308',
    'Desktop': '#3b82f6',
    'Tablet': '#a855f7',
};

const SOURCE_COLORS: Record<string, string> = {
    categories: '#eab308',
    map: '#3b82f6',
    shared: '#f97316',
    app: '#10b981',
};
const SOURCE_ICONS: Record<string, React.ElementType> = {
    categories: Layout,
    map: MapPin,
    shared: Share2,
    app: Globe,
};

// ── CSV Export Helper ──────────────────────────────────────────────────────
function exportStatsToCSV(data: StatsData, days: number) {
    const sections: string[] = [];

    // Summary
    sections.push('=== RINGKASAN ===' );
    sections.push(`Periode,${days} hari terakhir`);
    sections.push(`Total Kunjungan,${data.summary.totalVisits}`);
    sections.push(`Pengunjung Unik,${data.summary.uniqueVisitors}`);
    sections.push(`Sedang Aktif,${data.summary.liveVisitors}`);
    sections.push('');

    // Daily Visits
    sections.push('=== KUNJUNGAN HARIAN ===');
    sections.push('Tanggal,Total Views,Pengunjung Unik');
    data.dailyVisits.forEach(d => {
        sections.push(`${d.date},${d.views},${d.unique}`);
    });
    sections.push('');

    // Device Stats
    sections.push('=== PERANGKAT ===');
    sections.push('Perangkat,Jumlah Kunjungan');
    data.deviceStats.forEach(d => {
        sections.push(`${d.name},${d.value}`);
    });
    sections.push('');

    // Visit Sources
    sections.push('=== SUMBER KUNJUNGAN ===');
    sections.push('Halaman,Jumlah');
    data.visitsBySource.forEach(s => {
        sections.push(`${s.label},${s.count}`);
    });
    sections.push('');

    // Popular Links
    sections.push('=== TOP SHARE LINKS ===');
    sections.push('Nama,Token,Views');
    data.popularLinks.forEach(l => {
        sections.push(`"${l.name}",${l.token},${l.views}`);
    });

    const blob = new Blob([sections.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tengok-statistik-${days}hari-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
// ──────────────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
    const [data, setData] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    // Real-time Active Pulse
    const [liveCount, setLiveCount] = useState(0);

    const fetchStats = () => {
        fetch(`/api/stats/summary?days=${days}`)
            .then(res => res.json())
            .then(res => { 
                if (res.success) {
                    setData(res.data);
                    if (res.data.summary?.liveVisitors !== undefined) {
                        setLiveCount(res.data.summary.liveVisitors);
                    }
                } 
            })
            .catch(err => console.error('Failed to fetch stats', err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        setLoading(true);
        fetchStats();
        
        // Refresh live data automatically every 30 seconds
        const int = setInterval(fetchStats, 30000);
        return () => clearInterval(int);
    }, [days]);

    // Generate Smart Insight text dynamically
    const generateInsight = () => {
        if (!data) return "Sedang menganalisis tren data...";

        let targetPage = data.visitsBySource?.[0]?.label || 'Aplikasi Utama';
        let deviceList = [...data.deviceStats].sort((a, b) => b.value - a.value);
        let topDevice = deviceList[0]?.name || 'Mobile';
        let uniqueRatio = data.summary.totalVisits > 0
            ? Math.round((data.summary.uniqueVisitors / data.summary.totalVisits) * 100)
            : 0;

        let insight = `Berdasarkan data ${days} hari terakhir, `;
        insight += `mayoritas pengguna Anda (${topDevice}) dominan mengakses aplikasi. `;

        if (uniqueRatio > 70) {
            insight += `Rasio pengunjung unik yang tinggi (${uniqueRatio}%) menandakan basis pengguna baru terus bertambah pesat terutama pada ${targetPage}.`;
        } else {
            insight += `Sebagian besar merupakan pengunjung setia yang rutin kembali membuka aplikasi, terutama mengakses ${targetPage}.`;
        }

        return insight;
    };

    if (loading && !data) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-slate-600">
                    <BarChart3 className="w-16 h-16 opacity-10" />
                    <p className="font-bold uppercase tracking-wider opacity-30">Gagal memuat data statistik</p>
                </div>
            </div>
        );
    }

    const topSource = data.visitsBySource?.[0];

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans pb-32">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* ── Header ── */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
                                Statistik Pengunjung
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 uppercase tracking-wider animate-pulse">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                    {liveCount} Aktif Saat Ini
                                </span>
                            </h1>
                        </div>
                        <p className="text-sm font-medium text-slate-400 tracking-wide">
                            Pantau aktivitas real-time dan analitik performa link CCTV publik.
                        </p>
                    </div>

                    {/* Period Selector + Export */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center bg-slate-900/60 rounded-2xl border border-white/10 p-1">
                            {[7, 14, 30].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${days === d
                                        ? 'bg-yellow-500 text-slate-950 shadow-lg shadow-yellow-500/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    {d} Hari
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => data && exportStatsToCSV(data, days)}
                            disabled={!data}
                            className="flex items-center gap-2 px-4 py-3 bg-slate-900/60 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-2xl text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Export statistik ke CSV"
                            aria-label="Download statistik sebagai file CSV"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>
                </div>

                {/* ── Smart Insights Panel ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-blue-900/40 to-slate-900/60 backdrop-blur-xl border border-blue-500/30 rounded-3xl p-6 flex items-start gap-5">
                    <div className="p-3 bg-blue-500/20 rounded-2xl shrink-0 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="flex-1 w-full">
                        <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">AI Insights</h3>
                        <p className="text-slate-300 text-[15px] font-medium leading-relaxed w-full tracking-wide text-justify">{generateInsight()}</p>
                    </div>
                </motion.div>

                {/* ── Summary Cards ── */}
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Total Visits */}
                    <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-yellow-500/10 rounded-full blur-[30px]" />
                        <div className="absolute top-5 right-5 opacity-10"><Eye className="w-14 h-14 text-yellow-500" /></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-yellow-500/10"><Eye className="w-4 h-4 text-yellow-500" /></div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Kunjungan</p>
                            </div>
                            <h2 className="text-4xl font-black text-white tracking-tight">{data.summary.totalVisits.toLocaleString()}</h2>
                        </div>
                    </motion.div>

                    {/* Unique Visitors */}
                    <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group hover:border-orange-500/30 transition-all">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-orange-500/10 rounded-full blur-[30px]" />
                        <div className="absolute top-5 right-5 opacity-10"><Users className="w-14 h-14 text-orange-500" /></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-orange-500/10"><Users className="w-4 h-4 text-orange-500" /></div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pengunjung Unik</p>
                            </div>
                            <h2 className="text-4xl font-black text-white tracking-tight">{data.summary.uniqueVisitors.toLocaleString()}</h2>
                        </div>
                    </motion.div>

                    {/* Halaman Terpopuler */}
                    <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group hover:border-blue-500/30 transition-all">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/10 rounded-full blur-[30px]" />
                        <div className="absolute top-5 right-5 opacity-10"><TrendingUp className="w-14 h-14 text-blue-400" /></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-blue-500/10"><TrendingUp className="w-4 h-4 text-blue-400" /></div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Halaman Favorit</p>
                            </div>
                            <h2 className="text-xl font-bold text-white truncate max-w-[180px]">{topSource?.label || '-'}</h2>
                            <p className="text-xs text-blue-400 mt-2 font-bold uppercase tracking-wider">{topSource?.count || 0} Histori</p>
                        </div>
                    </motion.div>

                    {/* Link Berbagi Terpopuler */}
                    <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-[30px]" />
                        <div className="absolute top-5 right-5 opacity-10"><Share2 className="w-14 h-14 text-emerald-500" /></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-emerald-500/10"><Share2 className="w-4 h-4 text-emerald-500" /></div>
                                <p className="text-[11px] font-bold text-emerald-500/80 uppercase tracking-wider">Top Share Link</p>
                            </div>
                            <h2 className="text-[16px] font-bold text-emerald-400 truncate max-w-[180px]">
                                {data.popularLinks[0]?.name && !data.popularLinks[0].name.includes('bdf') && !data.popularLinks[0].name.includes('adb')
                                    ? data.popularLinks[0].name : (data.popularLinks[0] ? 'Link Eksternal' : '-')}
                            </h2>
                            <p className="text-xs text-emerald-500 mt-2 font-bold uppercase tracking-wider">{data.popularLinks[0]?.views || 0} tayangan</p>
                        </div>
                    </motion.div>
                </motion.div>

                {/* ── Charts Row ── */}
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Tren Kunjungan (Dual Axis) */}
                    <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 lg:col-span-2">
                        <div className="flex items-center justify-between gap-3 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-blue-500/10"><Activity className="w-5 h-5 text-blue-400" /></div>
                                <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tren Analitik Kunjungan</h3>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
                                <span className="flex items-center gap-1.5 text-blue-400">
                                    <span className="inline-block w-4 h-4 bg-blue-500/20 border border-blue-500/50 rounded"></span>Total Views
                                </span>
                                <span className="flex items-center gap-1.5 text-yellow-500">
                                    <span className="inline-block w-6 border-t-[3px] border-yellow-500/80"></span>Unik Visitor
                                </span>
                            </div>
                        </div>

                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart
                                    data={data.dailyVisits}
                                    margin={{ top: 20, right: 16, left: 0, bottom: 8 }}
                                >
                                    <defs>
                                        <linearGradient id="blueBarGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                                            <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.1} />
                                        </linearGradient>
                                    </defs>

                                    <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.06)" vertical={false} />
                                    <XAxis dataKey="date" stroke="transparent" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} dy={10} />
                                    <YAxis yAxisId="left" stroke="transparent" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} width={36} />
                                    <YAxis yAxisId="right" orientation="right" stroke="transparent" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} width={36} />

                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(59,130,246,0.3)', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                                        labelStyle={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}
                                        formatter={(val: any, name: any) => {
                                            return [
                                                <span key="value" className="font-black tabular-nums">{val}</span>,
                                                <span key="name" className="font-bold text-slate-400 ml-2">{name === 'views' ? 'Total Views' : 'Visitor Unik'}</span>
                                            ] as any;
                                        }}
                                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                    />

                                    <Bar yAxisId="left" dataKey="views" name="views" fill="url(#blueBarGrad)" radius={[6, 6, 0, 0]} barSize={40} />
                                    <Line yAxisId="right" type="monotone" dataKey="unique" name="unique" stroke="#eab308" strokeWidth={3} dot={{ r: 4, fill: '#eab308' }} activeDot={{ r: 6, fill: '#fff', stroke: '#eab308', strokeWidth: 2 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Perangkat & Sumber Gabungan */}
                    <div className="space-y-6">
                        {/* Perangkat (Progress Bar Redesign) */}
                        <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 relative">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 rounded-xl bg-orange-500/10"><Smartphone className="w-5 h-5 text-orange-400" /></div>
                                <h3 className="text-lg font-bold text-white uppercase tracking-wider">Perangkat Utama</h3>
                            </div>

                            {data.deviceStats.length > 0 ? (
                                <div className="space-y-5 mt-4">
                                    {data.deviceStats.map((entry) => {
                                        const Icon = DEVICE_ICONS[entry.name] || Globe;
                                        const color = DEVICE_COLORS[entry.name] || '#60a5fa';
                                        const pct = data.summary.totalVisits > 0 ? Math.round((entry.value / data.summary.totalVisits) * 100) : 0;

                                        return (
                                            <div key={entry.name}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 text-slate-300">
                                                        <Icon className="w-4 h-4" style={{ color }} />
                                                        <span className="text-xs font-bold uppercase tracking-wider">{entry.name}</span>
                                                    </div>
                                                    <span className="text-sm font-black tabular-nums" style={{ color }}>{pct}%</span>
                                                </div>
                                                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${pct}%` }}
                                                        transition={{ duration: 1, ease: 'easeOut' }}
                                                        className="h-full rounded-full"
                                                        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
                                                    />
                                                </div>
                                                <div className="text-[10px] text-slate-500 text-right mt-1 font-bold">{entry.value} Kunjungan</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="h-[150px] flex flex-col items-center justify-center text-slate-600">
                                    <Smartphone className="w-12 h-12 mb-3 opacity-10" />
                                    <span className="text-sm font-bold uppercase tracking-wider opacity-30">Belum ada data</span>
                                </div>
                            )}
                        </motion.div>

                        {/* Top Shared Links (Mini List) */}
                        <motion.div variants={cardVariants} className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-purple-500/10"><Share2 className="w-5 h-5 text-purple-400" /></div>
                                    <h3 className="text-[15px] font-bold text-white uppercase tracking-wider">Top Share Link</h3>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {data.popularLinks.length > 0 ? (
                                    data.popularLinks.slice(0, 3).map((link, i) => (
                                        <div key={link.token} className="p-3 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-6 h-6 shrink-0 rounded-full bg-purple-500/10 flex items-center justify-center text-[10px] font-black text-purple-400">{i + 1}</div>
                                                <div className="min-w-0 truncate">
                                                    <p className="text-xs font-bold text-white truncate w-[130px]">{link.name.length > 30 ? 'Link Berbagi' : link.name}</p>
                                                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">{link.token.slice(0, 10)}...</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-purple-400 tabular-nums shrink-0">{link.views}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-slate-500 text-xs py-4 font-bold uppercase tracking-wider">Belum ada link yang dibagikan</div>
                                )}
                            </div>
                        </motion.div>
                    </div>

                </motion.div>

                {/* ── Kunjungan per Sumber Halaman (Grid Bottom) ── */}
                {data.visitsBySource && data.visitsBySource.length > 0 && (
                    <motion.div variants={cardVariants} initial="hidden" animate="show" className="mt-6">
                        <div className="flex flex-wrap gap-6">
                            {data.visitsBySource.map((src) => {
                                const color = SOURCE_COLORS[src.page] || '#60a5fa';
                                const Icon = SOURCE_ICONS[src.page] || Globe;
                                const label = src.label === 'Tidak Diketahui' ? 'Aplikasi Utama' : src.label;
                                const pct = data.summary.totalVisits > 0 ? Math.round((src.count / data.summary.totalVisits) * 100) : 0;
                                return (
                                    <div key={src.page} className="flex-1 min-w-[240px] rounded-3xl p-5 border border-white/10 relative overflow-hidden group bg-slate-900/60 backdrop-blur-xl">
                                        <div className="absolute -bottom-10 -right-10 w-32 h-32 opacity-10 blur-2xl group-hover:opacity-30 transition-opacity" style={{ backgroundColor: color }} />
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 rounded-xl" style={{ backgroundColor: `${color}15` }}>
                                                <Icon className="w-5 h-5" style={{ color }} />
                                            </div>
                                            <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</span>
                                        </div>
                                        <div className="text-3xl font-black text-white">{src.count.toLocaleString()}</div>
                                        <div className="flex items-center justify-between mt-4">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{pct}% Rasio</span>
                                        </div>
                                        <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-slate-800">
                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}80` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
