"use client";

import { useState, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import axios from 'axios';
import {
    Trash2, Plus, Monitor, Loader2, Pencil, X, Camera,
    PlayCircle, Wifi, WifiOff,
    Upload, Download, CheckSquare, Square, LayoutGrid, List,
    AlertTriangle, Activity, FolderPlus, MapPin, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import type { ICameraData } from '@/models/Camera';
import { containerVariants, itemVariants, selectCls } from '@/components/admin/shared';
import { PageHeader, EmptyState, LoadingState, SearchBar, useConfirm } from '@/components/admin/AdminUI';
import { swrFetcher } from '@/lib/swrFetcher';
import { maskStreamUrl } from '@/lib/maskStreamUrl';
import { LocationOption } from '@/components/admin/cameras/types';
import { LivePreviewModal } from '@/components/admin/cameras/LivePreviewModal';
import { CameraFormModal } from '@/components/admin/cameras/CameraFormModal';
import { ImportCSVModal } from '@/components/admin/cameras/ImportCSVModal';
import { BulkAssignModal } from '@/components/admin/cameras/BulkAssignModal';

export default function CamerasPage() {
    const { data: accessData } = useSWR<{ isSuperAdmin?: boolean; appDivisi?: string | null }>('/api/me/access', swrFetcher);
    const isSuperAdmin = accessData?.isSuperAdmin === true;
    const callerDivisi = isSuperAdmin ? null : (accessData?.appDivisi ?? null);

    const { data: cameraData, isLoading: camerasLoading } = useSWR('/api/cameras?includeStreamUrl=1&scope=admin', swrFetcher);
    const { data: locationData } = useSWR('/api/locations?scope=admin', swrFetcher);

    const [editingCamera, setEditingCamera] = useState<ICameraData | null>(null);
    const [previewCamera, setPreviewCamera] = useState<ICameraData | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);

    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'url' | 'status'>('name-asc');
    const [filterCategory, setFilterCategory] = useState<'all' | 'online' | 'offline' | 'unassigned' | 'assigned'>('all');
    const [filterDivision, setFilterDivision] = useState<string>('all');
    const [filterLocation, setFilterLocation] = useState<string>('all');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isProbingBulk, setIsProbingBulk] = useState(false);
    const [probingCameraId, setProbingCameraId] = useState<string | null>(null);

    const itemsPerPage = viewMode === 'table' ? 15 : 8;
    const { confirm, ConfirmDialog } = useConfirm();

    const rawCameras = useMemo<ICameraData[]>(() => cameraData?.data || [], [cameraData]);
    const locations = useMemo<LocationOption[]>(() => locationData?.data || [], [locationData]);

    const cameraToLocationMap = useMemo(() => {
        const map = new Map<string, { id: string; name: string; category: string; division?: string | null }[]>();
        locations.forEach(loc => {
            if (Array.isArray(loc.cameras)) {
                loc.cameras.forEach((cam) => {
                    const cid = typeof cam === 'string' ? cam : cam._id;
                    if (cid) {
                        const existing = map.get(cid) || [];
                        existing.push({ id: loc._id, name: loc.name, category: loc.category, division: loc.division ?? null });
                        map.set(cid, existing);
                    }
                });
            }
        });
        return map;
    }, [locations]);

    // Filter & Sort Cameras
    const filteredCameras = useMemo(() => {
        let result = [...rawCameras];

        if (filterCategory === 'online') {
            result = result.filter(c => c.status === 'online');
        } else if (filterCategory === 'offline') {
            result = result.filter(c => c.status === 'offline');
        } else if (filterCategory === 'unassigned') {
            result = result.filter(c => !cameraToLocationMap.has(c._id as string));
        } else if (filterCategory === 'assigned') {
            result = result.filter(c => cameraToLocationMap.has(c._id as string));
        }

        if (isSuperAdmin && filterDivision !== 'all') {
            if (filterDivision === 'none') {
                result = result.filter(c => {
                    const locs = cameraToLocationMap.get(c._id as string) || [];
                    return !c.division && locs.every(l => !l.division);
                });
            } else {
                result = result.filter(c => {
                    const locs = cameraToLocationMap.get(c._id as string) || [];
                    return c.division === filterDivision || locs.some(l => l.division === filterDivision);
                });
            }
        }

        if (filterLocation !== 'all') {
            result = result.filter(c => {
                const locs = cameraToLocationMap.get(c._id as string) || [];
                return locs.some(l => l.id === filterLocation);
            });
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c => {
                const assignedLocs = cameraToLocationMap.get(c._id as string) || [];
                const locNames = assignedLocs.map(l => l.name.toLowerCase()).join(' ');
                return (
                    c.name?.toLowerCase().includes(q) ||
                    c.streamUrl?.toLowerCase().includes(q) ||
                    locNames.includes(q)
                );
            });
        }

        result.sort((a, b) => {
            if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '');
            if (sortBy === 'url') return (a.streamUrl || '').localeCompare(b.streamUrl || '');
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            return 0;
        });

        return result;
    }, [rawCameras, filterCategory, filterDivision, filterLocation, isSuperAdmin, searchQuery, sortBy, cameraToLocationMap]);

    const totalPages = Math.ceil(filteredCameras.length / itemsPerPage) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const paginatedCameras = useMemo(() => {
        const start = (safePage - 1) * itemsPerPage;
        return filteredCameras.slice(start, start + itemsPerPage);
    }, [filteredCameras, safePage, itemsPerPage]);

    const onlineCount = rawCameras.filter(c => c.status === 'online').length;
    const offlineCount = rawCameras.filter(c => c.status === 'offline').length;
    const unassignedCount = rawCameras.filter(c => !cameraToLocationMap.has(c._id as string)).length;
    const assignedCount = rawCameras.length - unassignedCount;

    const isAllSelected = paginatedCameras.length > 0 && paginatedCameras.every(c => selectedIds.includes(c._id as string));

    const handleSelectAll = () => {
        const pageIds = paginatedCameras.map(c => c._id as string);
        if (isAllSelected) {
            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
        );
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const ok = await confirm(
            `Anda akan menghapus ${selectedIds.length} perangkat kamera secara permanen. Aksi ini tidak dapat dibatalkan.`,
            {
                title: `Hapus ${selectedIds.length} Kamera Terpilih?`,
                variant: 'danger',
            },
        );
        if (!ok) return;

        try {
            const res = await axios.delete('/api/cameras/bulk', { data: { cameraIds: selectedIds } });
            if (res.data.success) {
                toast.success(`${res.data.deletedCount} kamera berhasil dihapus`);
                setSelectedIds([]);
                mutate('/api/cameras?includeStreamUrl=1&scope=admin');
                mutate('/api/locations?scope=admin');
            }
        } catch {
            toast.error('Gagal menghapus kamera terpilih');
        }
    };

    const handleProbeSingle = async (cam: ICameraData) => {
        if (!cam._id) return;
        setProbingCameraId(cam._id);
        try {
            await axios.post('/api/cameras/probe-now', { cameraIds: [cam._id] });
            toast.success(`Mengecek status ${cam.name}...`);
            setTimeout(() => {
                mutate('/api/cameras?includeStreamUrl=1&scope=admin');
                setProbingCameraId(null);
            }, 3500);
        } catch {
            toast.error('Gagal memulai pengecekan status');
            setProbingCameraId(null);
        }
    };

    const handleBulkProbe = async () => {
        if (selectedIds.length === 0) return;
        setIsProbingBulk(true);
        try {
            await axios.post('/api/cameras/probe-now', { cameraIds: selectedIds });
            toast.success(`Memulai pengecekan status untuk ${selectedIds.length} kamera...`);
            setTimeout(() => {
                mutate('/api/cameras?includeStreamUrl=1&scope=admin');
                setIsProbingBulk(false);
            }, 3500);
        } catch {
            toast.error('Gagal memulai pengecekan status');
            setIsProbingBulk(false);
        }
    };

    const handleExportCSV = (exportSelectedOnly = false) => {
        const source = exportSelectedOnly
            ? rawCameras.filter(c => selectedIds.includes(c._id as string))
            : filteredCameras;

        if (source.length === 0) {
            toast.error('Tidak ada data kamera untuk diexport');
            return;
        }

        const headers = ['ID', 'Nama Kamera', 'Stream URL', 'Status', 'Divisi', 'Lokasi Terpasang'];
        const rows = source.map(c => {
            const locs = (cameraToLocationMap.get(c._id as string) || []).map(l => l.name).join('; ');
            return [
                `"${c._id}"`,
                `"${(c.name || '').replace(/"/g, '""')}"`,
                `"${(c.streamUrl || '').replace(/"/g, '""')}"`,
                `"${c.status}"`,
                `"${c.division || '-'}"`,
                `"${locs.replace(/"/g, '""') || 'Belum Terpasang'}"`,
            ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kamera-tengok-${exportSelectedOnly ? 'terpilih-' : ''}${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('File CSV berhasil diunduh');
    };

    const handleDeleteSingle = async (id: string, name: string) => {
        const ok = await confirm(
            'Perangkat CCTV ini akan dihapus dari sistem dan dilepas dari seluruh lokasi.',
            {
                title: `Hapus Kamera "${name}"?`,
                variant: 'danger',
            },
        );
        if (!ok) return;

        try {
            await axios.delete(`/api/cameras/${id}`);
            toast.success('Kamera berhasil dihapus');
            setSelectedIds(prev => prev.filter(item => item !== id));
            mutate('/api/cameras?includeStreamUrl=1&scope=admin');
            mutate('/api/locations?scope=admin');
        } catch {
            toast.error('Gagal menghapus kamera');
        }
    };

    const resolveDivisionLabel = (cam: ICameraData): string | null => {
        if (cam.division) return cam.division;
        const locs = cameraToLocationMap.get(cam._id as string) || [];
        const divFromLoc = locs.find(l => l.division)?.division;
        return divFromLoc ?? null;
    };

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-36 font-sans">
            {ConfirmDialog}

            <AnimatePresence>
                {previewCamera && (
                    <LivePreviewModal
                        key="preview-modal"
                        camera={previewCamera}
                        onClose={() => setPreviewCamera(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editingCamera && (
                    <CameraFormModal
                        key={`edit-${editingCamera._id}`}
                        camera={editingCamera}
                        locations={locations}
                        initialLocationIds={(cameraToLocationMap.get(editingCamera._id as string) || []).map(l => l.id)}
                        isSuperAdmin={isSuperAdmin}
                        callerDivisi={callerDivisi}
                        onClose={() => setEditingCamera(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAddModal && (
                    <CameraFormModal
                        key="add-modal"
                        camera={null}
                        locations={locations}
                        initialLocationIds={[]}
                        isSuperAdmin={isSuperAdmin}
                        callerDivisi={callerDivisi}
                        onClose={() => setShowAddModal(false)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showImportModal && (
                    <ImportCSVModal
                        key="import-modal"
                        locations={locations}
                        onClose={() => setShowImportModal(false)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAssignModal && (
                    <BulkAssignModal
                        key="assign-modal"
                        cameraIds={selectedIds}
                        locations={locations}
                        onClose={() => {
                            setShowAssignModal(false);
                            setSelectedIds([]);
                        }}
                    />
                )}
            </AnimatePresence>

            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={Monitor}
                    title="Manajemen Kamera Terpusat"
                    subtitle="Daftarkan, uji streaming RTSP/HLS, dan tautkan kamera ke lokasi proyek dalam satu langkah."
                    actions={
                        <div className="flex flex-wrap items-center gap-2.5">
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleExportCSV(false)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider min-h-11"
                            >
                                <Download aria-hidden="true" className="w-4 h-4" /> Export CSV
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowImportModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider min-h-11"
                            >
                                <Upload aria-hidden="true" className="w-4 h-4" /> Import CSV
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowAddModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] text-xs uppercase tracking-wider min-h-11"
                            >
                                <Plus aria-hidden="true" className="w-4 h-4" /> Tambah Kamera
                            </motion.button>
                        </div>
                    }
                />

                {/* Filter Toolbar (Search, Filters, Sort, & View Mode) */}
                <div className="bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-3.5 space-y-3">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
                        <div className="flex-1 min-w-0">
                            <SearchBar
                                value={searchQuery}
                                onChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                placeholder="Cari nama CCTV, RTSP URL, atau lokasi..."
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {isSuperAdmin && (
                                <select
                                    aria-label="Filter berdasarkan divisi"
                                    value={filterDivision}
                                    onChange={(e) => { setFilterDivision(e.target.value); setCurrentPage(1); }}
                                    className={`${selectCls} !w-auto !py-2.5 !px-3 text-xs font-bold min-h-11`}
                                >
                                    <option value="all">Semua Divisi</option>
                                    <option value="DIVISI 1">DIVISI 1</option>
                                    <option value="DIVISI 2">DIVISI 2</option>
                                    <option value="DIVISI 3">DIVISI 3</option>
                                    <option value="none">Tanpa Divisi</option>
                                </select>
                            )}

                            <select
                                aria-label="Filter berdasarkan lokasi proyek"
                                value={filterLocation}
                                onChange={(e) => { setFilterLocation(e.target.value); setCurrentPage(1); }}
                                className={`${selectCls} !w-auto max-w-[210px] !py-2.5 !px-3 text-xs font-bold min-h-11`}
                            >
                                <option value="all">Semua Lokasi Proyek</option>
                                {locations.map(loc => (
                                    <option key={loc._id} value={loc._id}>{loc.name}</option>
                                ))}
                            </select>

                            <select
                                aria-label="Urutkan kamera"
                                value={sortBy}
                                onChange={(e) => { setSortBy(e.target.value as typeof sortBy); setCurrentPage(1); }}
                                className={`${selectCls} !w-auto !py-2.5 !px-3 text-xs font-bold min-h-11`}
                            >
                                <option value="name-asc">Urut: Nama A–Z</option>
                                <option value="name-desc">Urut: Nama Z–A</option>
                                <option value="status">Urut: Status</option>
                                <option value="url">Urut: Stream URL</option>
                            </select>

                            <div className="inline-flex rounded-xl p-1 bg-black/[0.04] dark:bg-slate-950/60 border border-black/10 dark:border-white/10" role="group" aria-label="Mode tampilan">
                                <button
                                    type="button"
                                    onClick={() => { setViewMode('table'); setCurrentPage(1); }}
                                    aria-pressed={viewMode === 'table'}
                                    title="Tampilan Tabel"
                                    aria-label="Tampilan tabel"
                                    className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-yellow-500 text-slate-950' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    <List aria-hidden="true" className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setViewMode('grid'); setCurrentPage(1); }}
                                    aria-pressed={viewMode === 'grid'}
                                    title="Tampilan Kartu"
                                    aria-label="Tampilan kartu"
                                    className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-yellow-500 text-slate-950' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    <LayoutGrid aria-hidden="true" className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Filter Status Chips */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
                            {([
                                { val: 'all', label: 'Semua', count: rawCameras.length },
                                { val: 'online', label: 'Online', count: onlineCount },
                                { val: 'offline', label: 'Offline', count: offlineCount },
                                { val: 'unassigned', label: 'Belum Terpasang', count: unassignedCount },
                                { val: 'assigned', label: 'Sudah Terpasang', count: assignedCount },
                            ] as const).map(({ val, label, count }) => (
                                <button
                                    key={val}
                                    onClick={() => { setFilterCategory(val); setCurrentPage(1); }}
                                    aria-pressed={filterCategory === val}
                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0 border ${
                                        filterCategory === val
                                            ? val === 'online' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-sm'
                                            : val === 'offline' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 shadow-sm'
                                            : val === 'unassigned' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-sm'
                                            : 'bg-yellow-500 text-slate-950 border-yellow-500 shadow-sm'
                                            : 'bg-black/[0.03] dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                                    } min-h-9`}
                                >
                                    {val === 'online' && <Wifi aria-hidden="true" className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />}
                                    {val === 'offline' && <WifiOff aria-hidden="true" className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />}
                                    {val === 'unassigned' && <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />}
                                    {label}
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                                        filterCategory === val
                                            ? val === 'all' ? 'bg-black/[0.08] text-slate-950 font-bold' : 'bg-black/[0.08] dark:bg-white/10'
                                            : 'bg-black/[0.05] dark:bg-white/5 text-slate-500'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {(filterCategory !== 'all' || filterLocation !== 'all' || filterDivision !== 'all' || searchQuery) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterCategory('all');
                                    setFilterLocation('all');
                                    setFilterDivision('all');
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors min-h-9 shrink-0"
                            >
                                Reset Filter
                            </button>
                        )}
                    </div>
                </div>

                {/* Camera List Content */}
                {camerasLoading ? (
                    <LoadingState />
                ) : filteredCameras.length === 0 ? (
                    <EmptyState
                        icon={Camera}
                        title={searchQuery || filterLocation !== 'all' || filterDivision !== 'all' ? 'Tidak ada kamera yang cocok' : 'Belum ada data kamera'}
                        subtitle={searchQuery || filterLocation !== 'all' || filterDivision !== 'all' ? 'Coba ubah filter atau kata kunci pencarian Anda.' : 'Klik "Tambah Kamera" atau "Import CSV" untuk mendaftarkan kamera CCTV.'}
                    />
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-4 py-2 bg-white/60 dark:bg-slate-900/40 border border-black/5 dark:border-white/5 rounded-2xl text-xs">
                            <button
                                onClick={handleSelectAll}
                                aria-pressed={isAllSelected}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold transition-colors"
                            >
                                {isAllSelected ? <CheckSquare aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" /> : <Square aria-hidden="true" className="w-4 h-4 text-slate-500" />}
                                <span>Pilih Semua di Halaman Ini ({paginatedCameras.length})</span>
                            </button>
                            <span className="text-slate-500 text-[11px] font-medium">
                                Menampilkan {paginatedCameras.length} dari {filteredCameras.length} kamera
                            </span>
                        </div>

                        {viewMode === 'table' ? (
                            <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                                            <th scope="col" className="pl-4 pr-2 py-3 w-10">
                                                <span className="sr-only">Pilih</span>
                                            </th>
                                            <th scope="col" className="px-3 py-3 font-bold">Kamera & Stream URL</th>
                                            <th scope="col" className="px-3 py-3 font-bold">Status</th>
                                            <th scope="col" className="px-3 py-3 font-bold hidden md:table-cell">Divisi</th>
                                            <th scope="col" className="px-3 py-3 font-bold hidden sm:table-cell">Lokasi Proyek</th>
                                            <th scope="col" className="px-4 py-3 font-bold text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedCameras.map((cam) => {
                                            const cid = cam._id as string;
                                            const isSelected = selectedIds.includes(cid);
                                            const assignedLocations = cameraToLocationMap.get(cid) || [];
                                            const divLabel = resolveDivisionLabel(cam);

                                            return (
                                                <tr
                                                    key={cid}
                                                    className={`border-b last:border-b-0 border-black/5 dark:border-white/5 transition-colors ${
                                                        isSelected ? 'bg-yellow-500/[0.06]' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                                                    }`}
                                                >
                                                    <td className="pl-4 pr-2 py-3 align-middle">
                                                        <button
                                                            onClick={() => handleToggleSelect(cid)}
                                                            aria-label={`Pilih kamera ${cam.name}`}
                                                            aria-pressed={isSelected}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-slate-500 hover:text-yellow-700 dark:hover:text-yellow-400"
                                                        >
                                                            {isSelected ? <CheckSquare aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" /> : <Square aria-hidden="true" className="w-4 h-4" />}
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-3 min-w-[200px] max-w-[300px]">
                                                        <div className="font-bold text-slate-900 dark:text-white truncate">{cam.name}</div>
                                                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5" title={maskStreamUrl(cam.streamUrl)}>
                                                            {maskStreamUrl(cam.streamUrl) || 'URL Kosong'}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap">
                                                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                                                            cam.status === 'online'
                                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                                        }`}>
                                                            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                            {cam.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                                                        {divLabel ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                                                <Building2 aria-hidden="true" className="w-3 h-3" />
                                                                {divLabel}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 hidden sm:table-cell max-w-[240px]">
                                                        {assignedLocations.length > 0 ? (
                                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2" title={assignedLocations.map(l => l.name).join(', ')}>
                                                                {assignedLocations.map(l => l.name).join(', ')}
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingCamera(cam)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
                                                            >
                                                                <AlertTriangle aria-hidden="true" className="w-3 h-3" />
                                                                Tautkan Lokasi
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-right">
                                                        <div className="inline-flex items-center gap-1">
                                                            <button
                                                                onClick={() => setPreviewCamera(cam)}
                                                                title="Preview Live"
                                                                aria-label={`Pratinjau live ${cam.name}`}
                                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 transition-colors"
                                                            >
                                                                <PlayCircle aria-hidden="true" className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleProbeSingle(cam)}
                                                                disabled={probingCameraId === cid}
                                                                title="Cek Status Stream"
                                                                aria-label={`Cek status ${cam.name}`}
                                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-emerald-500/15 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors disabled:opacity-50"
                                                            >
                                                                {probingCameraId === cid ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Activity aria-hidden="true" className="w-4 h-4" />}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingCamera(cam)}
                                                                title="Edit & Tautkan Lokasi"
                                                                aria-label={`Edit kamera ${cam.name}`}
                                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                                                            >
                                                                <Pencil aria-hidden="true" className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteSingle(cid, cam.name)}
                                                                title="Hapus Kamera"
                                                                aria-label={`Hapus kamera ${cam.name}`}
                                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 transition-colors"
                                                            >
                                                                <Trash2 aria-hidden="true" className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="show"
                                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                {paginatedCameras.map((cam) => {
                                    const cid = cam._id as string;
                                    const isSelected = selectedIds.includes(cid);
                                    const assignedLocations = cameraToLocationMap.get(cid) || [];
                                    const isAssigned = assignedLocations.length > 0;
                                    const divLabel = resolveDivisionLabel(cam);

                                    return (
                                        <motion.div
                                            key={cid}
                                            variants={itemVariants}
                                            className={`bg-white/75 dark:bg-slate-900/70 backdrop-blur-xl border p-5 rounded-2xl transition-all relative overflow-hidden group ${
                                                isSelected
                                                    ? 'border-yellow-500/50 bg-yellow-500/[0.04] shadow-[0_10px_30px_rgba(234,179,8,0.1)]'
                                                    : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-white dark:hover:bg-slate-900/90'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3.5">
                                                <button
                                                    onClick={() => handleToggleSelect(cid)}
                                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none mt-1 text-slate-500 hover:text-yellow-800 dark:hover:text-yellow-400 transition-colors shrink-0"
                                                    aria-label={`Pilih kamera ${cam.name}`}
                                                    aria-pressed={isSelected}
                                                >
                                                    {isSelected ? <CheckSquare aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" /> : <Square aria-hidden="true" className="w-5 h-5" />}
                                                </button>

                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <h3 className="font-bold text-slate-900 dark:text-white text-base tracking-tight truncate group-hover:text-yellow-700 dark:group-hover:text-yellow-400 transition-colors">
                                                                    {cam.name}
                                                                </h3>
                                                                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                                                    cam.status === 'online'
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                                                }`}>
                                                                    <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                                    {cam.status}
                                                                </span>
                                                                {divLabel && (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 shrink-0">
                                                                        {divLabel}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-1 select-all" title={maskStreamUrl(cam.streamUrl)}>
                                                                {maskStreamUrl(cam.streamUrl) || 'URL Kosong'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                                                        {isAssigned ? (
                                                            <div className="flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 font-semibold truncate">
                                                                <MapPin aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                                                                <span className="truncate">{assignedLocations.map(l => l.name).join(', ')}</span>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingCamera(cam)}
                                                                className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400/90 font-bold hover:underline"
                                                            >
                                                                <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                                                                <span>Belum dipasangkan — Klik untuk tautkan</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 pt-2">
                                                        <button
                                                            onClick={() => setPreviewCamera(cam)}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1 px-3 py-1.5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-bold transition-all min-h-11"
                                                            aria-label={`Pratinjau live ${cam.name}`}
                                                        >
                                                            <PlayCircle aria-hidden="true" className="w-3.5 h-3.5" /> Preview
                                                        </button>
                                                        <button
                                                            onClick={() => handleProbeSingle(cam)}
                                                            disabled={probingCameraId === cid}
                                                            title="Cek Status Stream"
                                                            aria-label={`Cek status ${cam.name}`}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-emerald-500/15 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all text-xs min-w-11 min-h-11 inline-flex items-center justify-center disabled:opacity-50"
                                                        >
                                                            {probingCameraId === cid ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" /> : <Activity aria-hidden="true" className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingCamera(cam)}
                                                            title="Edit Konfigurasi & Lokasi"
                                                            aria-label={`Edit kamera ${cam.name}`}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs min-w-11 min-h-11 inline-flex items-center justify-center"
                                                        >
                                                            <Pencil aria-hidden="true" className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteSingle(cid, cam.name)}
                                                            title="Hapus Kamera"
                                                            aria-label={`Hapus kamera ${cam.name}`}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 transition-all text-xs min-w-11 min-h-11 inline-flex items-center justify-center"
                                                        >
                                                            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        )}

                        {totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-black/5 dark:border-white/5 mt-6">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    Halaman <span className="text-slate-900 dark:text-white font-bold">{safePage}</span> dari <span className="text-slate-900 dark:text-white font-bold">{totalPages}</span> (Total {filteredCameras.length} kamera)
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                                        disabled={safePage <= 1}
                                        aria-label="Halaman sebelumnya"
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all min-h-11"
                                    >
                                        ← Sebelumnya
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                                        disabled={safePage >= totalPages}
                                        aria-label="Halaman berikutnya"
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all min-h-11"
                                    >
                                        Selanjutnya →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating Bulk Actions Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] sm:w-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-yellow-500/40 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] px-5 py-3.5 flex items-center gap-4 flex-wrap max-w-2xl"
                    >
                        <div role="status" className="flex items-center gap-2 pr-2 border-r border-black/10 dark:border-white/10">
                            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-yellow-500 animate-ping motion-reduce:animate-none" />
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{selectedIds.length} Dipilih</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handleBulkProbe}
                                disabled={isProbingBulk}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-bold transition-all disabled:opacity-50 min-h-11"
                            >
                                {isProbingBulk ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-yellow-700 dark:text-yellow-400" /> : <Activity aria-hidden="true" className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-400" />}
                                Cek Status
                            </button>

                            <button
                                onClick={() => setShowAssignModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-500/30 transition-all min-h-11"
                            >
                                <FolderPlus aria-hidden="true" className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                                Tautkan ke Lokasi
                            </button>

                            <button
                                onClick={() => handleExportCSV(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-all min-h-11"
                            >
                                <Download aria-hidden="true" className="w-3.5 h-3.5" /> CSV
                            </button>

                            <button
                                onClick={handleBulkDelete}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-500/30 transition-all min-h-11"
                            >
                                <Trash2 aria-hidden="true" className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" /> Hapus
                            </button>
                        </div>

                        <button
                            onClick={() => setSelectedIds([])}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white ml-auto min-w-11 min-h-11 inline-flex items-center justify-center"
                            title="Batal Pilih"
                            aria-label="Batalkan pilihan kamera"
                        >
                            <X aria-hidden="true" className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
