"use client";

import { useEffect, useState, useMemo } from 'react';
import { Loader2, Activity, MapPin, ChevronDown, ChevronUp, MonitorPlay } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { containerVariants, cardVariants } from '@/components/admin/shared';
import { PageHeader, EmptyState, SearchBar } from '@/components/admin/AdminUI';

interface UptimeData {
    cameraId: string;
    cameraName: string;
    locationName: string;
    category: string;
    currentStatus: 'online' | 'offline';
    lastCheckedAt: string | null;
    lastOnlineAt?: string | null;
    uptimePercent: number;
    totalChecks: number;
    onlineChecks: number;
}

interface LocationGroup {
    locationName: string;
    category: string;
    cameras: UptimeData[];
    avgUptime: number;
    withDataCount: number;
}

const ITEMS_PER_PAGE = 10;

export default function UptimePage() {
    const [data, setData] = useState<UptimeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedLocs, setExpandedLocs] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/cameras/uptime?days=${days}`)
            .then(res => res.json())
            .then(res => {
                if (res.success) setData(res.data);
            })
            .catch(err => console.error("Failed to fetch uptime", err))
            .finally(() => setLoading(false));
    }, [days]);

    // Categories for filter
    const categories = useMemo(() => {
        const cats = new Set(data.map(d => d.category));
        return ['all', ...Array.from(cats)];
    }, [data]);

    // Global summary
    const summary = useMemo(() => {
        const withData = data.filter(d => d.uptimePercent !== -1);
        const avgUptime = withData.length > 0 ? Math.round(withData.reduce((sum, d) => sum + d.uptimePercent, 0) / withData.length) : 0;
        const critical = data.filter(d => d.uptimePercent !== -1 && d.uptimePercent < 70).length;
        const stable = data.filter(d => d.uptimePercent >= 90).length;
        return { avgUptime, critical, stable, total: data.length };
    }, [data]);

    // Group by location
    const groupedLocations = useMemo(() => {
        const groups: Record<string, LocationGroup> = {};
        
        data.forEach(cam => {
            if (!groups[cam.locationName]) {
                groups[cam.locationName] = {
                    locationName: cam.locationName,
                    category: cam.category,
                    cameras: [],
                    avgUptime: 0,
                    withDataCount: 0
                };
            }
            groups[cam.locationName].cameras.push(cam);
        });

        // Calculate location averages
        return Object.values(groups).map(group => {
            const withData = group.cameras.filter(c => c.uptimePercent !== -1);
            group.withDataCount = withData.length;
            if (withData.length > 0) {
                group.avgUptime = Math.round(withData.reduce((sum, c) => sum + c.uptimePercent, 0) / withData.length);
            } else {
                group.avgUptime = -1; // No data
            }
            return group;
        });
    }, [data]);

    // Apply Filter & Search
    const filteredGroups = useMemo(() => {
        let items = groupedLocations;

        if (filterCategory !== 'all') {
            items = items.filter(g => g.category === filterCategory);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(g => 
                g.locationName?.toLowerCase().includes(q) ||
                g.category?.toLowerCase().includes(q) ||
                g.cameras?.some(c => c.cameraName?.toLowerCase().includes(q))
            );
        }

        // Sort by lowest uptime first
        return items.sort((a, b) => {
            if (a.avgUptime === -1) return 1;
            if (b.avgUptime === -1) return -1;
            return a.avgUptime - b.avgUptime;
        });
    }, [groupedLocations, filterCategory, searchQuery]);

    // Pagination
    const totalPages = Math.ceil(filteredGroups.length / ITEMS_PER_PAGE);
    const paginatedGroups = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredGroups.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredGroups, currentPage]);

    // Reset pagination on filter search change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterCategory, searchQuery, days]);

    const toggleExpand = (locName: string) => {
        setExpandedLocs(prev => {
            const next = new Set(prev);
            if (next.has(locName)) next.delete(locName);
            else next.add(locName);
            return next;
        });
    };

    const getUptimeColorClasses = (pct: number) => {
        if (pct === -1) return { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400 dark:bg-slate-600', border: 'border-slate-300 dark:border-slate-700/50' };
        if (pct >= 90) return { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', border: 'border-emerald-500/20' };
        if (pct >= 70) return { bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-500', bar: 'bg-yellow-500', border: 'border-yellow-500/20' };
        return { bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400', bar: 'bg-rose-500', border: 'border-rose-500/20' };
    };

    const formatRelativeTime = (iso: string | null) => {
        if (!iso) return '-';
        // eslint-disable-next-line react-hooks/purity -- label waktu relatif memang bergantung pada jam saat render
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60) return 'Baru saja';
        if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
        return `${Math.floor(diff / 86400)}h lalu`;
    };

    if (loading) {
        return (
            <div role="status" aria-label="Memuat data uptime" className="flex h-[80dvh] items-center justify-center">
                <Loader2 aria-hidden="true" className="w-8 h-8 text-yellow-700 dark:text-yellow-500 animate-spin motion-reduce:animate-none" />
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 font-sans pb-32">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <PageHeader
                    icon={Activity}
                    title="Kendali Uptime"
                    subtitle="Pantau stabilitas sistem dan konektivitas CCTV di setiap lokasi proyek secara keseluruhan."
                    actions={
                        <div role="group" aria-label="Periode uptime" className="flex items-center bg-white/70 dark:bg-slate-900/60 rounded-2xl border border-black/10 dark:border-white/10 p-1 gap-1">
                            {[7, 14, 30].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDays(d)}
                                    aria-pressed={days === d}
                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${days === d
                                        ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                                    } min-h-10`}
                                >
                                    {d} Hari
                                </button>
                            ))}
                        </div>
                    }
                />

                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <motion.div variants={cardVariants} initial="hidden" animate="show"
                        className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 relative overflow-hidden">
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Semua Kamera</p>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white">{summary.total}</h2>
                    </motion.div>
                    <motion.div variants={cardVariants} initial="hidden" animate="show"
                        className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 relative overflow-hidden">
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Rata-rata Sistem</p>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white">{summary.avgUptime}<span className="text-lg text-slate-500">%</span></h2>
                    </motion.div>
                    <motion.div variants={cardVariants} initial="hidden" animate="show"
                        className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full blur-2xl" />
                        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2 relative z-10">Kamera Stabil</p>
                        <h2 className="text-3xl font-black text-emerald-700 dark:text-emerald-400 relative z-10">{summary.stable}</h2>
                    </motion.div>
                    <motion.div variants={cardVariants} initial="hidden" animate="show"
                        className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-rose-500/20 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-bl-full blur-2xl" />
                        <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-2 relative z-10">Kritis (&lt;70%)</p>
                        <h2 className="text-3xl font-black text-rose-700 dark:text-rose-400 relative z-10">{summary.critical}</h2>
                    </motion.div>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilterCategory(cat)}
                                aria-pressed={filterCategory === cat}
                                className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${filterCategory === cat
                                    ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/30'
                                    : 'bg-black/[0.04] dark:bg-white/5 text-slate-500 dark:text-slate-400 border-transparent hover:border-black/10 dark:hover:border-white/10'
                                } min-h-10`}
                            >
                                {cat === 'all' ? 'Semua Kategori' : cat}
                            </button>
                        ))}
                    </div>
                    <div className="w-full md:w-64 shrink-0">
                        <SearchBar 
                            value={searchQuery} 
                            onChange={setSearchQuery} 
                            placeholder="Cari lokasi atau nama kamera..." 
                        />
                    </div>
                </div>

                {/* Locations Grouped List */}
                {paginatedGroups.length === 0 ? (
                    <EmptyState 
                        icon={Activity} 
                        title={searchQuery ? 'Tidak ditemukan' : 'Tidak ada data'}
                        subtitle={searchQuery ? `Pencarian "${searchQuery}" tidak membuahkan hasil.` : 'Sistem belum merekam data uptime apapun.'}
                    />
                ) : (
                    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-4">
                        {paginatedGroups.map((group) => {
                            const isExpanded = expandedLocs.has(group.locationName);
                            const style = getUptimeColorClasses(group.avgUptime);
                            
                            return (
                                <motion.div 
                                    variants={cardVariants}
                                    key={group.locationName}
                                    className={`bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border rounded-3xl overflow-hidden transition-colors ${isExpanded ? style.border : 'border-black/5 dark:border-white/5 hover:border-black/10 dark:hover:border-white/10'}`}
                                >
                                    {/* Location Header - Click to expand */}
                                    <button 
                                        onClick={() => toggleExpand(group.locationName)}
                                        aria-expanded={isExpanded}
                                        aria-label={`${group.locationName}, uptime ${group.avgUptime === -1 ? 'tidak tersedia' : group.avgUptime + ' persen'}, ${group.cameras.length} kamera`}
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-left group/btn"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${style.bg} ${style.text} transition-colors`}>
                                                <MapPin aria-hidden="true" className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover/btn:text-yellow-700 dark:group-hover/btn:text-yellow-400 transition-colors tracking-wide">
                                                    {group.locationName}
                                                </h3>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                        {group.category}
                                                    </span>
                                                    <span aria-hidden="true" className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-700" />
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                        {group.cameras.length} Kamera
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-6 pl-14 md:pl-0">
                                            <div className="flex flex-col items-start md:items-end w-28 sm:w-32 shrink-0">
                                                <div className="flex items-center justify-between w-full mb-1">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Uptime</span>
                                                    <span className={`text-sm font-bold ${style.text}`}>
                                                        {group.avgUptime === -1 ? 'N/A' : `${group.avgUptime}%`}
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    {group.avgUptime !== -1 && (
                                                        <div 
                                                            className={`h-full rounded-full ${style.bar}`} 
                                                            style={{ width: `${group.avgUptime}%` }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="text-slate-500 group-hover/btn:text-slate-900 dark:group-hover/btn:text-white transition-colors p-2 bg-black/[0.04] dark:bg-white/5 rounded-full">
                                                {isExpanded ? <ChevronUp aria-hidden="true" className="w-5 h-5" /> : <ChevronDown aria-hidden="true" className="w-5 h-5" />}
                                            </div>
                                        </div>
                                    </button>

                                    {/* Cameras Detail List */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-black/5 dark:border-white/5 bg-white/70 dark:bg-slate-950/50"
                                            >
                                                <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {group.cameras.map(cam => {
                                                        const camStyle = getUptimeColorClasses(cam.uptimePercent);
                                                        const isOnline = cam.currentStatus === 'online';
                                                        
                                                        return (
                                                            <div key={cam.cameraId} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-black/[0.04] dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="relative shrink-0">
                                                                        <MonitorPlay aria-hidden="true" className={`w-5 h-5 ${isOnline ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`} />
                                                                        <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
                                                                        <div aria-hidden="true" className={`absolute -right-1 -bottom-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-bold text-slate-900 dark:text-white tracking-wide truncate max-w-[120px] min-[400px]:max-w-[150px] sm:max-w-[200px]">{cam.cameraName}</div>
                                                                        <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex flex-col gap-0.5">
                                                                            <span>Cek: {formatRelativeTime(cam.lastCheckedAt)}</span>
                                                                            {!isOnline && (
                                                                                <span className="text-yellow-700 dark:text-yellow-500/80 font-semibold">
                                                                                    Terakhir Online: {cam.lastOnlineAt ? formatRelativeTime(cam.lastOnlineAt) : 'Belum terekam'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-col items-end w-24 shrink-0">
                                                                    <div className={`text-sm font-bold ${camStyle.text} tabular-nums`}>
                                                                        {cam.uptimePercent === -1 ? 'N/A' : `${cam.uptimePercent}%`}
                                                                    </div>
                                                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                                                                        {cam.totalChecks > 0 ? `${cam.onlineChecks}/${cam.totalChecks} UP` : 'No Data'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-6">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            aria-label="Halaman sebelumnya"
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-900 dark:text-white text-sm font-bold disabled:opacity-30 disabled:hover:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-11"
                        >
                            Prev
                        </button>
                        <div className="flex items-center gap-1 px-4">
                            <span className="text-sm font-bold text-yellow-700 dark:text-yellow-500">{currentPage}</span>
                            <span className="text-sm text-slate-500 font-medium">/ {totalPages}</span>
                        </div>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            aria-label="Halaman berikutnya"
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-900 dark:text-white text-sm font-bold disabled:opacity-30 disabled:hover:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors min-h-11"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
