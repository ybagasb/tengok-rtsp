"use client";

import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Loader2, Trash2, Pencil, Plus, RefreshCw, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { containerVariants, cardVariants } from '@/components/admin/shared';
import { PageHeader } from '@/components/admin/AdminUI';

interface AuditEntry {
    _id: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity: string;
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
    CREATE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    UPDATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const ACTION_ICON: Record<string, React.ElementType> = {
    CREATE: Plus,
    UPDATE: Pencil,
    DELETE: Trash2,
};

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filterEntity, setFilterEntity] = useState('');
    const [filterAction, setFilterAction] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: '25' });
            if (filterEntity) params.set('entity', filterEntity);
            if (filterAction) params.set('action', filterAction);

            const res = await fetch(`/api/admin/audit-log?${params}`);
            const data = await res.json();
            if (data.success) {
                setLogs(data.data);
                setPagination(data.pagination);
            }
        } catch (e) {
            console.error('Failed to fetch audit logs', e);
        } finally {
            setLoading(false);
        }
    }, [page, filterEntity, filterAction]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 pb-32">
            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={ClipboardList}
                    title="Audit Log"
                    subtitle="Rekam jejak semua aktivitas admin pada sistem TENGOK. Log otomatis terhapus setelah 90 hari."
                />

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2 text-slate-500">
                        <Filter className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">Filter:</span>
                    </div>

                    <select
                        value={filterEntity}
                        onChange={e => { setFilterEntity(e.target.value); setPage(1); }}
                        className="bg-slate-900/60 border border-white/10 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-yellow-500/50"
                        aria-label="Filter berdasarkan entitas"
                    >
                        <option value="">Semua Entitas</option>
                        <option value="Camera">Camera</option>
                        <option value="Location">Location</option>
                        <option value="Category">Category</option>
                        <option value="ShareLink">ShareLink</option>
                    </select>

                    <select
                        value={filterAction}
                        onChange={e => { setFilterAction(e.target.value); setPage(1); }}
                        className="bg-slate-900/60 border border-white/10 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-yellow-500/50"
                        aria-label="Filter berdasarkan aksi"
                    >
                        <option value="">Semua Aksi</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                    </select>

                    <button
                        onClick={() => fetchLogs()}
                        className="ml-auto p-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        aria-label="Refresh audit log"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {/* Table */}
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[auto_100px_100px_1fr_auto] gap-4 px-6 py-4 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span className="col-span-1">Waktu</span>
                        <span>Entitas</span>
                        <span>Aksi</span>
                        <span>Detail</span>
                        <span>Oleh</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-600">
                            <ClipboardList className="w-16 h-16 mb-4 opacity-10" />
                            <p className="text-sm font-bold uppercase tracking-wider opacity-30">Belum ada log audit</p>
                        </div>
                    ) : (
                        <motion.div variants={containerVariants} initial="hidden" animate="show">
                            <AnimatePresence>
                                {logs.map((log) => {
                                    const ActionIcon = ACTION_ICON[log.action] || Plus;
                                    return (
                                        <motion.div
                                            key={log._id}
                                            variants={cardVariants}
                                            className="grid grid-cols-[auto_100px_100px_1fr_auto] gap-4 px-6 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors items-center"
                                        >
                                            <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
                                                {formatDate(log.timestamp)}
                                            </span>
                                            <span className="text-xs font-bold text-slate-300">
                                                {log.entity}
                                            </span>
                                            <span>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${ACTION_STYLE[log.action]}`}>
                                                    <ActionIcon className="w-3 h-3" />
                                                    {log.action}
                                                </span>
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-xs text-white font-semibold truncate">{log.entityName}</p>
                                                {log.detail && (
                                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{log.detail}</p>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {log.by}
                                            </span>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-bold">
                            {pagination.total} total log • Halaman {pagination.page} dari {pagination.totalPages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900/60 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                ← Sebelumnya
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page >= pagination.totalPages}
                                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900/60 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
