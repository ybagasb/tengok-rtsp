"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, Loader2, Save, RotateCcw, X, Lock, Unlock,
    LayoutGrid, Tags, Palette, Info, Link as LinkIcon, ArrowRight,
    MapPin, Navigation, Search, Crosshair,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { containerVariants, cardVariants, inputCls, getApiError } from '@/components/admin/shared';
import { PageHeader, SectionHeader, FormField, EmptyState, FullPageLoading, SearchBar, useConfirm } from '@/components/admin/AdminUI';
import CoordinateInput from '@/components/admin/CoordinateInput';

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

interface Category {
    _id: string;
    name: string;
    identifier: string;
    description: string;
    icon: string;
    color: string;
    defaultLat?: number | null;
    defaultLng?: number | null;
    defaultZoom?: number | null;
    createdAt?: string;
}

type LeafletModule = typeof import('leaflet');
type LeafletMouseEvent = import('leaflet').LeafletMouseEvent;
type LeafletMap = import('leaflet').Map;
type ReactLeafletModule = typeof import('react-leaflet');
const ICON_MAP = LucideIcons as unknown as Record<string, React.ElementType>;

interface GeoResult {
    lat: string;
    lon: string;
    display_name: string;
}

const AVAILABLE_ICONS = [
    'School', 'Building2', 'Home', 'Hotel', 'Hospital', 'Briefcase',
    'Camera', 'ShieldCheck', 'Map', 'LayoutGrid', 'HardHat', 'Truck',
    'Factory', 'Landmark', 'Construction', 'Warehouse', 'Building', 'TreePine',
];

const AVAILABLE_COLORS = [
    { label: 'Blue-Cyan', value: 'from-blue-500 to-cyan-400', class: 'bg-gradient-to-br from-blue-500 to-cyan-400' },
    { label: 'Yellow-Orange', value: 'from-yellow-500 to-orange-400', class: 'bg-gradient-to-br from-yellow-500 to-orange-400' },
    { label: 'Purple-Pink', value: 'from-purple-500 to-pink-400', class: 'bg-gradient-to-br from-purple-500 to-pink-400' },
    { label: 'Emerald-Teal', value: 'from-emerald-500 to-teal-400', class: 'bg-gradient-to-br from-emerald-500 to-teal-400' },
    { label: 'Rose-Red', value: 'from-rose-500 to-red-400', class: 'bg-gradient-to-br from-rose-500 to-red-400' },
    { label: 'Indigo-Purple', value: 'from-indigo-500 to-purple-400', class: 'bg-gradient-to-br from-indigo-500 to-purple-400' },
    { label: 'Slate-Gray', value: 'from-slate-500 to-gray-400', class: 'bg-gradient-to-br from-slate-500 to-gray-400' },
];

const DEFAULT_CENTER = { lat: -4.4943173, lng: 113.2007588 };
const DEFAULT_ZOOM = 5;

function MapClickAndSync({
    lat,
    lng,
    zoom,
    onPick,
    onMapReady,
    RL,
}: {
    lat: number;
    lng: number;
    zoom: number;
    onPick: (lat: number, lng: number) => void;
    onMapReady: (map: LeafletMap) => void;
    RL: ReactLeafletModule;
}) {
    const map = RL.useMap();
    RL.useMapEvents({ click(e: LeafletMouseEvent) { onPick(e.latlng.lat, e.latlng.lng); } });

    useEffect(() => {
        onMapReady(map);
    }, [map, onMapReady]);

    useEffect(() => {
        map.setView([lat, lng], zoom, { animate: true });
    }, [map, lat, lng, zoom]);

    return null;
}

export default function AdminCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [unlockIdentifier, setUnlockIdentifier] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [L, setL] = useState<LeafletModule | null>(null);
    const [RL, setRL] = useState<ReactLeafletModule | null>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const handleMapReady = useCallback((m: LeafletMap) => { mapRef.current = m; }, []);
    const { confirm, ConfirmDialog } = useConfirm();

    // Geocode search untuk default peta kategori
    const [geoQuery, setGeoQuery] = useState('');
    const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
    const [isGeoSearching, setIsGeoSearching] = useState(false);
    const geoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [formData, setFormData] = useState<Partial<Category>>({
        name: '',
        identifier: '',
        description: '',
        icon: 'LayoutGrid',
        color: 'from-blue-500 to-cyan-400',
        defaultLat: undefined,
        defaultLng: undefined,
        defaultZoom: undefined,
    });

    const applyLoaded = (cats: Category[], locs: Array<{ category: string }>) => {
        setCategories(cats);
        const counts: Record<string, number> = {};
        locs.forEach((loc) => {
            counts[loc.category] = (counts[loc.category] || 0) + 1;
        });
        setLocationCounts(counts);
    };

    const refreshData = async () => {
        try {
            const [catRes, locRes] = await Promise.all([
                axios.get('/api/categories'),
                axios.get('/api/locations'),
            ]);
            applyLoaded(catRes.data, locRes.data.data || []);
        } catch {
            toast.error('Gagal mengambil data kategori');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let active = true;
        if (typeof window !== 'undefined') {
            Promise.all([import('leaflet'), import('react-leaflet')]).then(([leaf, rLeaf]) => {
                if (!active) return;
                const LMod = leaf.default;
                setL(LMod);
                setRL(rLeaf);
                delete (LMod.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
                LMod.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                });
            });
        }
        Promise.all([axios.get('/api/categories'), axios.get('/api/locations')])
            .then(([catRes, locRes]) => {
                if (active) applyLoaded(catRes.data, locRes.data.data || []);
            })
            .catch(() => {
                if (active) toast.error('Gagal mengambil data kategori');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    // Escape menutup modal form
    useEffect(() => {
        if (!showForm) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowForm(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showForm]);

    useEffect(() => {
        return () => { if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current); };
    }, []);

    const handleGeoChange = (val: string) => {
        setGeoQuery(val);
        if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current);
        if (val.trim().length < 3) {
            setGeoResults([]);
            setIsGeoSearching(false);
            return;
        }
        setIsGeoSearching(true);
        geoDebounceRef.current = setTimeout(async () => {
            try {
                const res = await axios.get(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val.trim())}&limit=5&countrycodes=id`,
                );
                setGeoResults(Array.isArray(res.data) ? res.data : []);
            } catch {
                setGeoResults([]);
            } finally {
                setIsGeoSearching(false);
            }
        }, 450);
    };

    const selectGeoResult = (r: GeoResult) => {
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        setFormData(prev => ({
            ...prev,
            defaultLat: Number(lat.toFixed(6)),
            defaultLng: Number(lng.toFixed(6)),
            defaultZoom: prev.defaultZoom ?? 10,
        }));
        setGeoQuery(r.display_name.split(',')[0]);
        setGeoResults([]);
    };

    const handleCaptureMapView = () => {
        if (!mapRef.current) return;
        const c = mapRef.current.getCenter();
        const z = mapRef.current.getZoom();
        setFormData(prev => ({
            ...prev,
            defaultLat: Number(c.lat.toFixed(6)),
            defaultLng: Number(c.lng.toFixed(6)),
            defaultZoom: Number(z.toFixed(1)),
        }));
        toast.success(`Posisi peta diambil (${c.lat.toFixed(3)}, ${c.lng.toFixed(3)} · zoom ${z})`);
    };

    const generateIdentifier = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        setFormData(prev => ({
            ...prev,
            name,
            ...(!prev._id ? { identifier: generateIdentifier(name) } : {}),
        }));
    };

    const openCreateModal = () => {
        setFormData({
            name: '',
            identifier: '',
            description: '',
            icon: 'LayoutGrid',
            color: 'from-blue-500 to-cyan-400',
            defaultLat: undefined,
            defaultLng: undefined,
            defaultZoom: undefined,
        });
        setUnlockIdentifier(false);
        setGeoQuery('');
        setGeoResults([]);
        setShowForm(true);
    };

    const handleEdit = (cat: Category) => {
        setFormData({ ...cat });
        setUnlockIdentifier(false);
        setGeoQuery('');
        setGeoResults([]);
        setShowForm(true);
    };

    const handleReset = () => {
        setFormData({
            name: '',
            identifier: '',
            description: '',
            icon: 'LayoutGrid',
            color: 'from-blue-500 to-cyan-400',
            defaultLat: undefined,
            defaultLng: undefined,
            defaultZoom: undefined,
        });
        setUnlockIdentifier(false);
        setGeoQuery('');
        setGeoResults([]);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = {
                ...formData,
                // Kirim null eksplisit bila kosong agar server melakukan $unset di MongoDB
                defaultLat: formData.defaultLat ?? null,
                defaultLng: formData.defaultLng ?? null,
                defaultZoom: formData.defaultZoom ?? null,
            };
            if (formData._id) {
                await axios.put(`/api/categories/${formData._id}`, payload);
                toast.success('Kategori berhasil diperbarui');
            } else {
                await axios.post('/api/categories', payload);
                toast.success('Kategori berhasil ditambahkan');
            }
            handleReset();
            await refreshData();
        } catch (error: unknown) {
            toast.error(getApiError(error) || 'Gagal menyimpan kategori');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (cat: Category, locCount: number) => {
        if (locCount > 0) {
            toast.error(`Kategori "${cat.name}" masih digunakan oleh ${locCount} proyek. Pindahkan proyek terlebih dahulu.`);
            return;
        }
        const ok = await confirm(`Yakin ingin menghapus kategori "${cat.name}"?`, {
            title: 'Hapus Kategori',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await axios.delete(`/api/categories/${cat._id}`);
            toast.success('Kategori dihapus');
            await refreshData();
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal menghapus kategori');
        }
    };

    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        const q = searchQuery.toLowerCase();
        return categories.filter(c =>
            c.name?.toLowerCase().includes(q) ||
            c.identifier?.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        );
    }, [categories, searchQuery]);

    if (loading) return <FullPageLoading />;

    const mapCenterLat = formData.defaultLat ?? DEFAULT_CENTER.lat;
    const mapCenterLng = formData.defaultLng ?? DEFAULT_CENTER.lng;
    const mapZoom = formData.defaultZoom ?? DEFAULT_ZOOM;

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 font-sans">
            {ConfirmDialog}
            <div className="max-w-6xl mx-auto">
                <PageHeader
                    icon={LayoutGrid}
                    title="Kategori Proyek"
                    subtitle="Kelola jenis kategori tayangan, tampilan ikon, dan posisi peta default."
                    actions={
                        <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={openCreateModal}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-5 py-3 sm:px-7 sm:py-3.5 rounded-2xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-wider bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.4)]"
                        >
                            <Plus aria-hidden="true" className="w-5 h-5" />
                            <span className="hidden sm:inline">Buat Kategori</span>
                            <span className="sm:hidden">Tambah</span>
                        </motion.button>
                    }
                />

                {/* Search */}
                {categories.length > 0 && (
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="sm:w-96">
                            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Cari nama, identifier, atau deskripsi..." />
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            {filteredCategories.length} dari {categories.length} Kategori
                        </span>
                    </div>
                )}

                {/* Categories Grid */}
                {filteredCategories.length === 0 ? (
                    <EmptyState
                        icon={Tags}
                        title={searchQuery ? 'Tidak ditemukan' : 'Belum Ada Kategori'}
                        subtitle={searchQuery ? 'Coba ubah kata pencarian Anda.' : 'Klik "Buat Kategori" untuk membuat klasifikasi proyek pertama.'}
                    />
                ) : (
                    <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                        {filteredCategories.map((cat) => {
                            const IconComp = ICON_MAP[cat.icon] || LayoutGrid;
                            const locCount = locationCounts[cat.identifier] || 0;

                            return (
                                <motion.div
                                    variants={cardVariants}
                                    key={cat._id}
                                    className="group relative bg-white/75 dark:bg-slate-900/65 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl p-6 hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.06)] transition-all overflow-hidden flex flex-col min-h-[280px]"
                                >
                                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${cat.color} opacity-20 blur-3xl pointer-events-none group-hover:opacity-40 transition-opacity duration-500`} />

                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${cat.color} text-white shadow-lg`}>
                                            <IconComp aria-hidden="true" className="w-6 h-6" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleEdit(cat)}
                                                aria-label={`Edit kategori ${cat.name}`}
                                                title="Edit Kategori"
                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 bg-black/[0.04] dark:bg-black/40 hover:bg-yellow-500/20 text-slate-500 dark:text-slate-400 hover:text-yellow-800 dark:hover:text-yellow-400 rounded-xl transition-all border border-black/5 dark:border-white/5 hover:border-yellow-500/30 min-w-11 min-h-11 inline-flex items-center justify-center"
                                            >
                                                <Edit2 aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(cat, locCount)}
                                                aria-label={`Hapus kategori ${cat.name}`}
                                                title={locCount > 0 ? `Masih dipakai ${locCount} proyek` : 'Hapus Kategori'}
                                                className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 bg-black/[0.04] dark:bg-black/40 rounded-xl transition-all border border-black/5 dark:border-white/5 min-w-11 min-h-11 inline-flex items-center justify-center ${
                                                    locCount > 0
                                                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                                        : 'text-slate-500 dark:text-slate-400 hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-400 hover:border-red-500/30'
                                                }`}
                                            >
                                                <Trash2 aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-auto relative z-10">
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1 uppercase tracking-wider group-hover:text-yellow-700 dark:group-hover:text-yellow-400 transition-colors">{cat.name}</h3>
                                        <p className="text-xs font-mono text-slate-500 mb-3 bg-black/[0.03] dark:bg-black/30 w-fit px-2 py-1 rounded-md border border-black/5 dark:border-white/5">/{cat.identifier}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">{cat.description}</p>

                                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-black/5 dark:border-white/5">
                                            <Link
                                                href={`/admin/locations?category=${encodeURIComponent(cat.identifier)}`}
                                                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 hover:underline"
                                                title="Lihat proyek dalam kategori ini"
                                            >
                                                <MapPin aria-hidden="true" className="w-3.5 h-3.5" />
                                                {locCount} Proyek
                                            </Link>
                                            {cat.defaultLat && cat.defaultLng ? (
                                                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400/90">
                                                    <Navigation aria-hidden="true" className="w-3 h-3" />
                                                    Peta Kustom
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-400 font-medium">Default ID</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* Modal Form 2-Kolom dengan Sticky Preview */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={formData._id ? 'Edit kategori' : 'Buat kategori baru'}
                        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
                        onClick={handleReset}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            transition={{ type: "spring", stiffness: 320, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-5xl max-h-[92dvh] flex flex-col shadow-[0_30px_70px_rgba(15,23,42,0.3)] dark:shadow-[0_30px_70px_rgba(0,0,0,0.75)] overflow-hidden"
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                                        {formData._id ? <Edit2 aria-hidden="true" className="w-5 h-5" /> : <Plus aria-hidden="true" className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                            {formData._id ? `Edit Kategori: ${formData.name}` : 'Buat Kategori Baru'}
                                        </h2>
                                        <p className="text-xs text-slate-500">Atur identitas, ikon, warna kartu, dan tampilan peta default.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    aria-label="Tutup dialog"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    <X aria-hidden="true" className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body: 2-Column Layout */}
                            <form id="category-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                                    {/* Left Column: Inputs */}
                                    <div className="lg:col-span-7 space-y-8">
                                        {/* Section 1: Informasi Dasar */}
                                        <div>
                                            <SectionHeader icon={Info} title="Informasi Dasar" />
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                                <FormField label="Nama Kategori" required>
                                                    <input
                                                        required
                                                        type="text"
                                                        value={formData.name || ''}
                                                        onChange={handleNameChange}
                                                        className={inputCls()}
                                                        placeholder="Contoh: Sekolah Dasar"
                                                    />
                                                </FormField>
                                                <div>
                                                    <FormField label="URL Identifier" required icon={<LinkIcon aria-hidden="true" className="w-4 h-4" />}>
                                                        <input
                                                            required
                                                            type="text"
                                                            readOnly={Boolean(formData._id) && !unlockIdentifier}
                                                            value={formData.identifier || ''}
                                                            onChange={e => setFormData({ ...formData, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                                            className={`${inputCls(true)} ${formData._id && !unlockIdentifier ? 'opacity-70 cursor-not-allowed' : ''}`}
                                                            placeholder="sekolah-dasar"
                                                        />
                                                    </FormField>
                                                    {formData._id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setUnlockIdentifier(v => !v)}
                                                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-amber-700 dark:hover:text-amber-400"
                                                        >
                                                            {unlockIdentifier ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                                            {unlockIdentifier ? 'Kunci kembali (proyek otomatis ikut termigrasi)' : 'Ubah identifier (proyek ikut termigrasi)'}
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <FormField label="Deskripsi" required>
                                                        <textarea
                                                            required
                                                            value={formData.description || ''}
                                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                            className={inputCls()}
                                                            rows={2}
                                                            placeholder="Penjelasan singkat mengenai kategori ini..."
                                                        />
                                                    </FormField>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Section 2: Tampilan Visual */}
                                        <div>
                                            <SectionHeader icon={Palette} title="Ikon & Warna" />
                                            <div className="space-y-5">
                                                <FormField label="Pilih Icon" required>
                                                    <div className="grid grid-cols-6 sm:grid-cols-9 gap-2">
                                                        {AVAILABLE_ICONS.map(iconName => {
                                                            const IconComp = ICON_MAP[iconName];
                                                            const isSelected = formData.icon === iconName;
                                                            return (
                                                                <button
                                                                    key={iconName}
                                                                    type="button"
                                                                    onClick={() => setFormData({ ...formData, icon: iconName })}
                                                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 rounded-xl flex items-center justify-center transition-all ${
                                                                        isSelected
                                                                            ? 'bg-yellow-500 text-slate-950 shadow-md ring-2 ring-yellow-500'
                                                                            : 'bg-black/[0.04] dark:bg-black/40 text-slate-500 dark:text-slate-400 hover:bg-black/10 dark:hover:bg-slate-800 border border-black/10 dark:border-white/10'
                                                                    }`}
                                                                    title={iconName}
                                                                    aria-label={`Ikon ${iconName}`}
                                                                    aria-pressed={isSelected}
                                                                >
                                                                    {IconComp && <IconComp aria-hidden="true" className="w-5 h-5" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </FormField>

                                                <FormField label="Mode Warna Kategori" required>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                                        {AVAILABLE_COLORS.map(color => {
                                                            const isSelected = formData.color === color.value;
                                                            return (
                                                                <button
                                                                    key={color.value}
                                                                    type="button"
                                                                    onClick={() => setFormData({ ...formData, color: color.value })}
                                                                    aria-pressed={isSelected}
                                                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 rounded-xl flex items-center gap-2.5 transition-all text-left ${
                                                                        isSelected
                                                                            ? 'ring-2 ring-yellow-500 bg-slate-200/80 dark:bg-slate-800'
                                                                            : 'bg-black/[0.04] dark:bg-black/40 hover:bg-black/10 dark:hover:bg-slate-800 border border-black/10 dark:border-white/10'
                                                                    }`}
                                                                >
                                                                    <div aria-hidden="true" className={`w-6 h-6 rounded-lg shrink-0 ${color.class}`} />
                                                                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{color.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </FormField>
                                            </div>
                                        </div>

                                        {/* Section 3: Pengaturan Default Peta */}
                                        <div>
                                            <SectionHeader icon={Navigation} title="Default Tampilan Peta" />
                                            <div className="space-y-4">
                                                {/* Search lokasi */}
                                                <div className="relative">
                                                    <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        value={geoQuery}
                                                        onChange={(e) => handleGeoChange(e.target.value)}
                                                        placeholder="Cari kota/wilayah di Indonesia untuk fokus peta..."
                                                        aria-label="Cari wilayah peta"
                                                        className={inputCls(true)}
                                                    />
                                                    {isGeoSearching && (
                                                        <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-yellow-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
                                                    )}
                                                    {geoResults.length > 0 && (
                                                        <div className="absolute left-0 right-0 top-full mt-2 z-[2000] rounded-2xl bg-white dark:bg-slate-900 border border-black/10 dark:border-white/15 shadow-xl max-h-48 overflow-y-auto">
                                                            {geoResults.map((r, i) => (
                                                                <button
                                                                    key={i}
                                                                    type="button"
                                                                    onClick={() => selectGeoResult(r)}
                                                                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 border-b last:border-b-0 border-black/5 dark:border-white/5"
                                                                >
                                                                    <div className="font-bold text-slate-900 dark:text-white truncate">{r.display_name.split(',')[0]}</div>
                                                                    <div className="text-[11px] text-slate-500 truncate">{r.display_name}</div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Peta interaktif + tombol capture zoom & center */}
                                                <div className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 h-60 bg-slate-100 dark:bg-slate-950">
                                                    {typeof window !== 'undefined' && RL && L ? (
                                                        <MapContainer
                                                            center={[mapCenterLat, mapCenterLng]}
                                                            zoom={mapZoom}
                                                            style={{ height: '100%', width: '100%', zIndex: 0 }}
                                                            attributionControl={false}
                                                        >
                                                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                            <MapClickAndSync
                                                                lat={mapCenterLat}
                                                                lng={mapCenterLng}
                                                                zoom={mapZoom}
                                                                onPick={(lat, lng) => setFormData(prev => ({ ...prev, defaultLat: Number(lat.toFixed(6)), defaultLng: Number(lng.toFixed(6)) }))}
                                                                onMapReady={handleMapReady}
                                                                RL={RL}
                                                            />
                                                            {formData.defaultLat && formData.defaultLng && (
                                                                <Marker position={[formData.defaultLat, formData.defaultLng]} />
                                                            )}
                                                        </MapContainer>
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center">
                                                            <Loader2 aria-hidden="true" className="animate-spin text-slate-500" />
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handleCaptureMapView}
                                                        className="absolute bottom-3 right-3 z-[500] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white border border-black/15 dark:border-white/15 shadow-lg text-[11px] font-bold hover:border-yellow-500 transition-colors"
                                                    >
                                                        <Crosshair aria-hidden="true" className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                                                        Gunakan Posisi & Zoom Ini
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                                                    <div className="sm:col-span-2">
                                                        <CoordinateInput
                                                            lat={formData.defaultLat ?? null}
                                                            lng={formData.defaultLng ?? null}
                                                            onChange={(lat, lng) => setFormData(prev => ({
                                                                ...prev,
                                                                defaultLat: lat ?? undefined,
                                                                defaultLng: lng ?? undefined,
                                                            }))}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <FormField label="Zoom (1-18)">
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={18}
                                                                step={0.5}
                                                                value={formData.defaultZoom ?? ''}
                                                                onChange={e => setFormData({ ...formData, defaultZoom: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                                className={inputCls()}
                                                                placeholder="5"
                                                            />
                                                        </FormField>
                                                        {(formData.defaultLat || formData.defaultZoom) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(prev => ({ ...prev, defaultLat: undefined, defaultLng: undefined, defaultZoom: undefined }))}
                                                                className="text-[11px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider hover:underline"
                                                            >
                                                                Reset ke Default ID
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Sticky Live Preview */}
                                    <div className="lg:col-span-5 lg:sticky lg:top-0 space-y-4">
                                        <div className="p-6 rounded-3xl bg-black/[0.03] dark:bg-black/30 border border-black/10 dark:border-white/10 flex flex-col items-center">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase mb-4 tracking-wider">— Live Preview Kartu —</span>
                                            <div className="group/preview relative w-full max-w-[340px] h-52 rounded-[2.25rem] overflow-hidden bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl border border-black/10 dark:border-white/10 text-left p-6 shadow-2xl flex flex-col justify-between">
                                                <div className={`absolute -top-10 -right-10 w-36 h-36 bg-gradient-to-br ${formData.color} opacity-20 blur-3xl`} />
                                                <div className="relative z-10 flex justify-between items-start">
                                                    <div className={`p-3.5 rounded-2xl bg-gradient-to-br ${formData.color} shadow-lg`}>
                                                        {formData.icon && ICON_MAP[formData.icon] &&
                                                            (() => { const PreviewIcon = ICON_MAP[formData.icon]; return <PreviewIcon aria-hidden="true" className="w-6 h-6 text-white stroke-[2.25]" />; })()
                                                        }
                                                    </div>
                                                    <ArrowRight aria-hidden="true" className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <div className="relative z-10 mt-auto">
                                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-1 truncate">
                                                        {formData.name || 'Nama Kategori'}
                                                    </h3>
                                                    <p className="text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider opacity-75 leading-relaxed line-clamp-2">
                                                        {formData.description || 'Deskripsi kategori akan tampil di sini'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="w-full mt-5 pt-4 border-t border-black/5 dark:border-white/5 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                                                <div className="flex justify-between">
                                                    <span className="font-medium">Identifier URL:</span>
                                                    <span className="font-mono font-bold text-slate-900 dark:text-white">/{formData.identifier || '—'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="font-medium">Posisi Peta:</span>
                                                    <span className="font-mono">
                                                        {formData.defaultLat && formData.defaultLng
                                                            ? `${formData.defaultLat.toFixed(2)}, ${formData.defaultLng.toFixed(2)} (z${formData.defaultZoom ?? DEFAULT_ZOOM})`
                                                            : 'Default Indonesia'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-950/50 shrink-0">
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-5 py-3 rounded-xl border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold hover:bg-black/5 dark:hover:bg-white/5 text-xs uppercase tracking-wider flex items-center gap-2"
                                >
                                    <RotateCcw aria-hidden="true" className="w-4 h-4" /> Batal
                                </button>
                                <motion.button
                                    whileHover={{ y: -1 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit"
                                    form="category-form"
                                    disabled={isSubmitting}
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-7 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl transition-all shadow-[0_6px_20px_rgba(234,179,8,0.3)] flex items-center gap-2 uppercase tracking-wider text-xs disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Save aria-hidden="true" className="w-4 h-4" />}
                                    {formData._id ? 'Simpan Perubahan' : 'Simpan Kategori'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
