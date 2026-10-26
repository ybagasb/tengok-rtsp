"use client";

import { useEffect, useState, useCallback } from 'react';
import { 
    ClipboardList, Loader2, Trash2, Pencil, Plus, RefreshCw, Filter, 
    Camera, MapPin, Tags, Link2, Download,
    Bell, FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { containerVariants, cardVariants, getErrorMessage } from '@/components/admin/shared';
import { PageHeader, SearchBar } from '@/components/admin/AdminUI';
import toast from 'react-hot-toast';

interface AuditEntry {
    _id: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity: 'Camera' | 'Location' | 'Category' | 'ShareLink' | 'Settings' | 'Project' | string;
    entityId: string;
    entityName: string;
    by: string;
    detail?: string;
    timestamp: string;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const ACTION_STYLE: Record<string, string> = {
    CREATE: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    UPDATE: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
    DELETE: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

const ACTION_ICON: Record<string, React.ElementType> = {
    CREATE: Plus,
    UPDATE: Pencil,
    DELETE: Trash2,
};

const ENTITY_ICON: Record<string, React.ElementType> = {
    Camera: Camera,
    Location: MapPin,
    Category: Tags,
    ShareLink: Link2,
    Settings: Bell,
    Project: FolderOpen,
};

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterEntity, setFilterEntity] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const fetchLogs = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const params = new URLSearchParams({ 
                page: String(page), 
                limit: '25' 
            });
            if (filterEntity) params.set('entity', filterEntity);
            if (filterAction) params.set('action', filterAction);
            if (searchQuery.trim()) params.set('search', searchQuery.trim());

            const res = await fetch(`/api/admin/audit-log?${params}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            if (data.success) {
                setLogs(data.data || []);
                setPagination(data.pagination || null);
            }
        } catch (e: unknown) {
            console.error('Failed to fetch audit logs', e);
            if (!isSilent) {
                toast.error(`Gagal memuat audit log: ${getErrorMessage(e)}`);
            }
        } finally {
            if (!isSilent) setLoading(false);
        }
    }, [page, filterEntity, filterAction, searchQuery]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleExportCSV = () => {
        if (logs.length === 0) {
            toast.error('Tidak ada data untuk diexport');
            return;
        }

        setIsExporting(true);
        try {
            const headers = ['Waktu', 'Aksi', 'Entitas', 'Nama Objek', 'Detail Perubahan', 'Dilakukan Oleh'];
            const rows = logs.map(l => [
                `"${formatDate(l.timestamp)}"`,
                `"${l.action}"`,
                `"${l.entity}"`,
                `"${(l.entityName || '').replace(/"/g, '""')}"`,
                `"${(l.detail || '').replace(/"/g, '""')}"`,
                `"${(l.by || '').replace(/"/g, '""')}"`
            ]);

            const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-log-tengok-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Audit log berhasil diekspor ke CSV');
        } catch {
            toast.error('Gagal mengekspor data');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-32 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={ClipboardList}
                    title="Audit Log"
                    subtitle="Rekam jejak seluruh aktivitas perubahan data pada sistem TENGOK. Data otomatis diarsipkan hingga 90 hari."
                    actions={
                        <div className="flex items-center gap-3">
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handleExportCSV}
                                disabled={isExporting || logs.length === 0}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50 min-h-11"
                            >
                                <Download aria-hidden="true" className="w-4 h-4" />
                                Export CSV
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => fetchLogs()}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none min-w-11 min-h-11 inline-flex items-center justify-center p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                                title="Segarkan Data"
                                aria-label="Segarkan data audit log"
                            >
                                <RefreshCw aria-hidden="true" className={`w-4 h-4 ${loading ? 'animate-spin text-yellow-700 dark:text-yellow-500' : ''}`} />
                            </motion.button>
                        </div>
                    }
                />

                {/* Filters and Search Bar */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-6">
                        <SearchBar
                            value={searchQuery}
                            onChange={(val) => { setSearchQuery(val); setPage(1); }}
                            placeholder="Cari nama entitas, detail perubahan, atau admin..."
                        />
                    </div>

                    <div className="md:col-span-6 flex flex-wrap gap-2 items-center justify-start md:justify-end">
                        <div className="flex items-center gap-1.5 bg-white/70 dark:bg-slate-900/60 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2">
                            <Filter aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
                            <select
                                value={filterEntity}
                                onChange={e => { setFilterEntity(e.target.value); setPage(1); }}
                                className="bg-transparent text-slate-600 dark:text-slate-300 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded cursor-pointer min-h-8"
                                aria-label="Filter Entitas"
                            >
                                <option value="" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Semua Entitas</option>
                                <option value="Camera" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Kamera</option>
                                <option value="Location" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Lokasi</option>
                                <option value="Category" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Kategori</option>
                                <option value="ShareLink" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Share Link</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5 bg-white/70 dark:bg-slate-900/60 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2">
                            <select
                                value={filterAction}
                                onChange={e => { setFilterAction(e.target.value); setPage(1); }}
                                className="bg-transparent text-slate-600 dark:text-slate-300 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded cursor-pointer min-h-8"
                                aria-label="Filter Aksi"
                            >
                                <option value="" className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">Semua Aksi</option>
                                <option value="CREATE" className="bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400">CREATE (Tambah)</option>
                                <option value="UPDATE" className="bg-white dark:bg-slate-900 text-yellow-700 dark:text-yellow-400">UPDATE (Ubah)</option>
                                <option value="DELETE" className="bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400">DELETE (Hapus)</option>
                            </select>
                        </div>

                        {(filterEntity || filterAction || searchQuery) && (
                            <button
                                onClick={() => {
                                    setFilterEntity('');
                                    setFilterAction('');
                                    setSearchQuery('');
                                    setPage(1);
                                }}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-xs text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400 underline font-bold px-3 min-h-11"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* Table Container */}
                <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(15,23,42,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                  <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel audit log (dapat digulir horizontal)">
                  <div role="table" aria-label="Riwayat audit" className="min-w-[760px]">
                    {/* Header */}
                    <div role="row" className="grid grid-cols-[140px_110px_100px_1fr_120px] gap-4 px-6 py-4 border-b border-black/5 dark:border-white/5 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-black/[0.03] dark:bg-black/20">
                        <span role="columnheader">Waktu</span>
<span role="columnheader">Entitas</span>
<span role="columnheader">Aksi</span>
<span role="columnheader">Detail Aktivitas</span>
<span role="columnheader" className="text-right">Admin / User</span>
                    </div>

                    {loading ? (
                        <div role="status" className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 aria-hidden="true" className="w-8 h-8 animate-spin text-yellow-700 dark:text-yellow-500" />
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Memuat riwayat audit...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <ClipboardList aria-hidden="true" className="w-16 h-16 mb-4 opacity-20 text-yellow-700 dark:text-yellow-500" />
                            <p className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Belum ada catatan aktivitas</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
                                {searchQuery || filterEntity || filterAction 
                                    ? 'Tidak ada log yang cocok dengan kriteria pencarian Anda.' 
                                    : 'Aktivitas pembuatan, pengubahan, dan penghapusan data akan terekam secara otomatis di sini.'}
                            </p>
                        </div>
                    ) : (
                        <motion.div variants={containerVariants} initial="hidden" animate="show">
                            <AnimatePresence>
                                {logs.map((log) => {
                                    const ActionIcon = ACTION_ICON[log.action] || Plus;
                                    const EntityIcon = ENTITY_ICON[log.entity] || ClipboardList;
                                    return (
                                        <motion.div
                                            key={log._id}
                                            role="row"
 variants={cardVariants}
                                            className="grid grid-cols-[140px_110px_100px_1fr_120px] gap-4 px-6 py-4 border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/[0.03] dark:hover:bg-white/[0.02] transition-colors items-center text-xs"
                                        >
                                            <span role="cell" className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
{formatDate(log.timestamp)}
                                            </span>

                                            <div role="cell" className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-semibold">
                                                <EntityIcon aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
                                                <span>{log.entity}</span>
                                            </div>

                                            <div role="cell">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${ACTION_STYLE[log.action] || 'bg-black/[0.04] dark:bg-white/5 text-slate-600 dark:text-slate-300 border-black/10 dark:border-white/10'}`}>
                                                    <ActionIcon aria-hidden="true" className="w-3 h-3" />
                                                    {log.action}
                                                </span>
                                            </div>

                                            <div role="cell" className="min-w-0 pr-4">
                                                <p className="font-bold text-slate-900 dark:text-white truncate text-xs">{log.entityName}</p>
                                                {log.detail && (
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{log.detail}</p>
                                                )}
                                            </div>

                                            <div role="cell" className="text-right">
                                                <span className="inline-block text-[11px] font-medium text-yellow-700 dark:text-yellow-500/90 bg-yellow-500/10 px-2 py-0.5 rounded-lg border border-yellow-500/20 truncate max-w-[110px]" title={log.by}>
                                                    {log.by}
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}
                  </div>
                  </div>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Menampilkan <span className="text-slate-900 dark:text-white font-bold">{logs.length}</span> dari total <span className="text-slate-900 dark:text-white font-bold">{pagination.total}</span> aktivitas (Halaman {pagination.page} dari {pagination.totalPages})
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                aria-label="Halaman sebelumnya"
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none min-h-11 px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                ← Sebelumnya
                            </button>
                            <div aria-current="page" className="text-xs font-bold px-3 py-2 bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 rounded-xl border border-yellow-500/20">
                                {page}
                            </div>
                            <button
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page >= pagination.totalPages}
                                aria-label="Halaman berikutnya"
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none min-h-11 px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Selanjutnya →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
