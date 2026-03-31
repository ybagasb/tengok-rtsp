"use client";

import { useState, useEffect, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import axios from 'axios';
import {
    Link2, Plus, Trash2, Copy, CheckCircle2, XCircle, Clock,
    Loader2, Eye, ToggleLeft, ToggleRight, MapPin,
    ChevronDown, ChevronUp, Search, Check, Timer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface LocationOption {
    _id: string;
    name: string;
    category: string;
}

interface ShareLinkData {
    _id: string;
    token: string;
    label: string;
    locations: LocationOption[];
    duration: number;
    expiresAt: string;
    createdAt: string;
    isActive: boolean;
    accessCount: number;
    lastAccessedAt: string | null;
}

const DURATION_OPTIONS = [
    { value: 30, label: '30 Menit' },
    { value: 60, label: '1 Jam' },
    { value: 120, label: '2 Jam' },
    { value: 180, label: '3 Jam' },
];

function formatTimeLeft(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatDate(date: string): string {
    return new Date(date).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() < Date.now();
}

// ── Location Multi-Select ─────────────────────────────────────────────────────
function LocationSelector({
    locations,
    selected,
    onChange,
}: {
    locations: LocationOption[];
    selected: string[];
    onChange: (ids: string[]) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search) return locations;
        return locations.filter(l =>
            l.name.toLowerCase().includes(search.toLowerCase()) ||
            l.category.toLowerCase().includes(search.toLowerCase())
        );
    }, [locations, search]);

    const toggleLocation = (id: string) => {
        onChange(
            selected.includes(id)
                ? selected.filter(s => s !== id)
                : [...selected, id]
        );
    };

    const toggleAll = () => {
        if (selected.length === locations.length) {
            onChange([]);
        } else {
            onChange(locations.map(l => l._id));
        }
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-left flex items-center justify-between hover:border-yellow-500/50 transition-all font-medium text-slate-300"
            >
                <span className={selected.length > 0 ? 'text-white' : 'text-slate-500'}>
                    {selected.length > 0
                        ? `${selected.length} area terhubung`
                        : 'Pilih lokasi target...'}
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-yellow-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-2 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] z-50 overflow-hidden"
                    >
                        {/* Search */}
                        <div className="p-4 border-b border-white/5 bg-black/20">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Cari nama lokasi atau kategori..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-[13px] focus:border-yellow-500/50 outline-none transition-all text-white placeholder:text-slate-600 focus:ring-1 focus:ring-yellow-500/50"
                                />
                            </div>
                        </div>

                        {/* Select All */}
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="w-full px-5 py-3.5 text-left text-[11px] font-bold text-yellow-500 hover:bg-yellow-500/10 transition-colors border-b border-white/5 flex items-center gap-3 uppercase tracking-wider bg-white/[0.02]"
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selected.length === locations.length ? 'bg-yellow-500 border-yellow-500' : 'border-white/20'}`}>
                                {selected.length === locations.length && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                            </div>
                            {selected.length === locations.length ? 'Batalkan Semua Pilihan' : 'Pilih Seluruh Area'}
                        </button>

                        {/* Location List */}
                        <div className="max-h-56 overflow-y-auto custom-scrollbar">
                            {filtered.map(loc => {
                                const isSelected = selected.includes(loc._id);
                                return (
                                    <button
                                        type="button"
                                        key={loc._id}
                                        onClick={() => toggleLocation(loc._id)}
                                        className={`w-full px-5 py-3.5 text-left flex items-center gap-4 transition-colors hover:bg-white/5 ${isSelected ? 'bg-yellow-500/5' : ''}`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-yellow-500 border-yellow-500' : 'border-white/20'}`}>
                                            {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-[13px] font-bold truncate transition-colors ${isSelected ? 'text-yellow-500' : 'text-slate-300'}`}>{loc.name}</div>
                                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{loc.category}</div>
                                        </div>
                                    </button>
                                );
                            })}
                            {filtered.length === 0 && (
                                <div className="px-5 py-8 text-center text-sm font-bold text-slate-500 flex flex-col items-center justify-center gap-2">
                                    <MapPin className="w-8 h-8 opacity-20" />
                                    Area tidak ditemukan
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShareLinksPage() {
    const { data, isLoading } = useSWR('/api/share-links', fetcher, { refreshInterval: 10000 });
    const [locations, setLocations] = useState<LocationOption[]>([]);
    const [isLoadingLocations, setIsLoadingLocations] = useState(true);

    // Form state
    const [label, setLabel] = useState('');
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [duration, setDuration] = useState(60);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Expired section visibility
    const [showExpired, setShowExpired] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const res = await axios.get('/api/locations');
                if (res.data.success) {
                    setLocations(res.data.data.map((l: any) => ({
                        _id: l._id,
                        name: l.name,
                        category: l.category,
                    })));
                }
            } catch (error) {
                console.error('Failed to fetch locations:', error);
            } finally {
                setIsLoadingLocations(false);
            }
        };
        fetchLocations();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!label.trim()) return toast.error('Label diperlukan');
        if (selectedLocationIds.length === 0) return toast.error('Pilih minimal 1 lokasi');

        setIsSubmitting(true);
        try {
            await axios.post('/api/share-links', {
                label: label.trim(),
                locationIds: selectedLocationIds,
                duration,
            });
            toast.success('Share link berhasil dibuat!');
            setLabel('');
            setSelectedLocationIds([]);
            setDuration(60);
            mutate('/api/share-links');
        } catch {
            toast.error('Gagal membuat share link');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopy = async (token: string, id: string) => {
        const url = `${window.location.origin}/shared/${token}`;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            setCopiedId(id);
            toast.success('Tautan disalin ke clipboard!');
            setTimeout(() => setCopiedId(null), 2000);
        } catch (error) {
            toast.error('Gagal menyalin tautan');
        }
    };

    const handleToggle = async (id: string) => {
        try {
            await axios.patch(`/api/share-links/${id}`);
            mutate('/api/share-links');
            toast.success('Status keamanan diperbarui');
        } catch {
            toast.error('Gagal memproses permintaan');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Yakin ingin menghapus secara permanen tautan ini?')) return;
        try {
            await axios.delete(`/api/share-links/${id}`);
            mutate('/api/share-links');
            toast.success('Tautan dihapus permanen');
        } catch {
            toast.error('Gagal menghapus data');
        }
    };

    const allLinks: ShareLinkData[] = data?.data || [];
    const activeLinks = allLinks.filter(l => l.isActive && !isExpired(l.expiresAt));
    const expiredLinks = allLinks.filter(l => !l.isActive || isExpired(l.expiresAt));

    // Animation Variants
    const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
    const itemVariants = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } } };

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans">
            <div className="max-w-6xl mx-auto">
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/5"
                >
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight uppercase flex items-center gap-4 text-white">
                            <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl shadow-[0_8px_30px_rgba(234,179,8,0.3)] relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Link2 className="w-8 h-8 text-slate-950 relative z-10" />
                            </div>
                            Share Links
                        </h1>
                        <p className="text-slate-500 text-sm mt-3 font-medium tracking-wide">
                            Pusat distribusi tautan publik berbatas waktu untuk area CCTV
                        </p>
                    </div>
                </motion.header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* ── Create Form (Sticky Container) ────────────────────── */}
                    <div className="lg:col-span-1">
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 24 }}
                            className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl sticky top-6 shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/10 rounded-full blur-[50px] pointer-events-none" />

                            <h2 className="text-lg font-bold mb-8 flex items-center gap-3 text-white uppercase tracking-wide">
                                <div className="p-2 rounded-xl bg-yellow-500/10">
                                    <Plus className="w-5 h-5 text-yellow-500" />
                                </div>
                                Form Link Baru
                            </h2>

                            <form onSubmit={handleCreate} className="space-y-6 relative z-10">
                                {/* Label */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Judul Hak Akses *</label>
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={e => setLabel(e.target.value)}
                                        placeholder="Contoh: Inspeksi K3 Lapangan"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-yellow-500/50 outline-none transition-all text-white placeholder:text-slate-600 focus:ring-1 focus:ring-yellow-500/50"
                                    />
                                </div>

                                {/* Location Selector */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Teritori / Proyek *</label>
                                    {isLoadingLocations ? (
                                        <div className="flex items-center justify-center bg-black/40 border border-white/5 rounded-xl p-4 text-slate-500 font-bold text-xs uppercase">
                                            <Loader2 className="w-4 h-4 animate-spin mr-2 text-yellow-500" /> Memuat Peta Data...
                                        </div>
                                    ) : (
                                        <LocationSelector
                                            locations={locations}
                                            selected={selectedLocationIds}
                                            onChange={setSelectedLocationIds}
                                        />
                                    )}
                                </div>

                                {/* Duration */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">Timer Kedaluwarsa *</label>
                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                        {DURATION_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setDuration(opt.value)}
                                                className={`py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                                                    duration === opt.value
                                                        ? 'bg-gradient-to-br from-yellow-500 to-orange-500 border-orange-400 text-slate-950 shadow-[0_10px_20px_rgba(234,179,8,0.3)]'
                                                        : 'bg-black/40 border-white/10 text-slate-500 hover:bg-white/5 hover:text-white'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-900 font-bold py-5 rounded-2xl transition-all shadow-[0_10px_30px_rgba(234,179,8,0.3)] disabled:opacity-50 flex items-center justify-center gap-3 mt-4 uppercase text-sm tracking-wider group/btn"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Link2 className="w-5 h-5 group-hover/btn:scale-110 transition-transform" /> Distribusikan Tautan</>}
                                </motion.button>
                            </form>
                        </motion.div>
                    </div>

                    {/* ── Links List ────────────────────── */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Active Links */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 ml-1">
                                <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                    Tautan Tersedia
                                </h2>
                                <span className="bg-emerald-500 text-slate-950 font-bold px-2.5 py-0.5 rounded-full text-sm">{activeLinks.length}</span>
                            </div>

                            {isLoading ? (
                                <div className="text-center py-24 text-slate-500 flex flex-col items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
                                    <p className="uppercase tracking-wider font-bold text-sm">Sinkronisasi Jaringan...</p>
                                </div>
                            ) : activeLinks.length === 0 ? (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center py-20 text-slate-600 border-2 border-dashed border-white/10 rounded-[2rem] bg-slate-900/20"
                                >
                                    <Link2 className="w-20 h-20 mb-4 opacity-10" />
                                    <p className="font-bold text-lg uppercase tracking-wider opacity-30">Distribusi Kosong</p>
                                </motion.div>
                            ) : (
                                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid gap-5">
                                    {activeLinks.map(link => (
                                        <motion.div
                                            variants={itemVariants}
                                            key={link._id}
                                            className="relative bg-slate-900/60 backdrop-blur-md border border-white/10 p-6 rounded-[2rem] hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.05)] transition-all group overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-[100px] pointer-events-none group-hover:bg-yellow-500/10 transition-colors" />

                                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <h3 className="font-bold text-white text-xl tracking-tight truncate group-hover:text-yellow-500 transition-colors">{link.label}</h3>
                                                        <span className="text-[10px] font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 px-3 py-1 rounded-full uppercase tracking-widest shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                                                            Live
                                                        </span>
                                                    </div>

                                                    {/* Locations */}
                                                    <div className="flex flex-wrap gap-2 mb-6">
                                                        {link.locations.map((loc: any) => (
                                                            <span key={loc._id} className="text-[10px] font-bold bg-black/40 text-slate-300 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-1.5 hover:border-white/20 transition-colors">
                                                                <MapPin className="w-3 h-3 text-orange-400" />
                                                                {loc.name}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    {/* Meta Stats Box */}
                                                    <div className="flex flex-wrap items-center gap-4 bg-black/30 p-3 rounded-xl border border-white/5">
                                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 border-r border-white/10 pr-4">
                                                            <Timer className="w-4 h-4 text-emerald-400" />
                                                            {formatTimeLeft(link.expiresAt)}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 border-r border-white/10 pr-4 hidden sm:flex">
                                                            <Clock className="w-4 h-4" />
                                                            {formatDate(link.createdAt).split(',')[0]}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] font-bold text-yellow-500 uppercase tracking-wider">
                                                            <Eye className="w-4 h-4" />
                                                            {link.accessCount} Viewer
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions Vertical */}
                                                <div className="flex md:flex-col items-center gap-3 shrink-0 bg-black/20 p-2 rounded-2xl border border-white/5">
                                                    <button
                                                        onClick={() => handleCopy(link.token, link._id)}
                                                        className={`p-3.5 rounded-xl transition-all flex items-center justify-center relative ${copiedId === link._id ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-950 hover:bg-yellow-500'}`}
                                                        title="Salin Tautan"
                                                    >
                                                        {copiedId === link._id ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                                    </button>
                                                    <div className="w-px h-6 md:w-6 md:h-px bg-white/10" />
                                                    <button
                                                        onClick={() => handleToggle(link._id)}
                                                        className="p-3.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-xl transition-all"
                                                        title="Bekukan Akses"
                                                    >
                                                        <ToggleRight className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(link._id)}
                                                        className="p-3.5 text-slate-500 hover:text-white hover:bg-red-500 rounded-xl transition-all"
                                                        title="Hapus Data"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </div>

                        {/* Expired / Revoked Links */}
                        {expiredLinks.length > 0 && (
                            <div className="pt-6 border-t border-white/5">
                                <button
                                    onClick={() => setShowExpired(!showExpired)}
                                    className="flex items-center justify-between w-full bg-slate-900/40 border border-white/5 hover:border-white/10 p-4 rounded-2xl transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <XCircle className="w-6 h-6 text-red-500/50 group-hover:text-red-500 transition-colors" />
                                        <span className="text-sm font-bold uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
                                            Log Kedaluwarsa ({expiredLinks.length})
                                        </span>
                                    </div>
                                    <div className="p-2 bg-black/40 rounded-lg group-hover:bg-black/60 transition-colors text-slate-500 group-hover:text-white">
                                        {showExpired ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {showExpired && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-3 mt-4 overflow-hidden"
                                        >
                                            {expiredLinks.map(link => (
                                                <div
                                                    key={link._id}
                                                    className="bg-black/40 border border-red-500/10 p-5 rounded-2xl opacity-70 hover:opacity-100 hover:border-red-500/30 transition-all flex items-center justify-between"
                                                >
                                                    <div className="min-w-0 pr-4">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <h3 className="font-bold text-slate-300 truncate text-base">{link.label}</h3>
                                                            <span className="text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                                                                {!link.isActive ? 'Dicabut' : 'Habis'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                            <span>{formatDate(link.createdAt).split(',')[0]}</span>
                                                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                                                            <span>{link.accessCount} VIEWER</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDelete(link._id)}
                                                        className="p-3 bg-white/5 text-slate-500 hover:text-white hover:bg-red-500 rounded-xl transition-all shrink-0"
                                                        title="Hapus Permanen"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
