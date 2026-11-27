"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, Loader2, Image as ImageIcon, X,
    MapPin, Search, Save, RotateCcw, List, LayoutGrid,
    User, Users, Phone, Video, ClipboardList, ExternalLink, Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import 'leaflet/dist/leaflet.css';
import { containerVariants, cardVariants, inputCls, selectCls, getApiError } from '@/components/admin/shared';
import { PageHeader, SectionHeader, FormField, EmptyState, SearchBar, CountBadge, useConfirm } from '@/components/admin/AdminUI';
import CoordinateInput, { isValidLat, isValidLng } from '@/components/admin/CoordinateInput';
import PicManager from '@/components/shared/PicManager';

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });

interface Camera {
    _id: string;
    name: string;
    streamUrl: string;
    status: string;
}

interface Location {
    _id: string;
    name: string;
    category: string;
    division?: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3' | '';
    projectType?: 'JO' | 'NON_JO' | '';
    description: string;
    image: string;
    lat: number;
    lng: number;
    pmName: string;
    pmPhone: string;
    cameras: (string | Camera)[];
    createdAt?: string;
}

interface Category {
    _id: string;
    name: string;
    identifier: string;
}

type LeafletModule = typeof import('leaflet');
type LeafletMouseEvent = import('leaflet').LeafletMouseEvent;
type ReactLeafletModule = typeof import('react-leaflet');

interface GeoResult {
    lat: string;
    lon: string;
    display_name: string;
}

const DEFAULT_COORDS = { lat: -4.4943173, lng: 113.2007588 };

function LocationPickerAndSync({
    lat,
    lng,
    onPick,
    RL,
}: {
    lat: number;
    lng: number;
    onPick: (lat: number, lng: number) => void;
    RL: ReactLeafletModule;
}) {
    const map = RL.useMap();
    RL.useMapEvents({
        click(e: LeafletMouseEvent) {
            onPick(e.latlng.lat, e.latlng.lng);
        },
    });

    useEffect(() => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            map.setView([lat, lng], map.getZoom(), { animate: true });
        }
    }, [map, lat, lng]);

    return null;
}

export default function AdminLocations() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [callerDivisi, setCallerDivisi] = useState<Location['division'] | null>(null);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [picTarget, setPicTarget] = useState<Location | null>(null);
    const [L, setL] = useState<LeafletModule | null>(null);
    const [RL, setRL] = useState<ReactLeafletModule | null>(null);

    const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterDivision, setFilterDivision] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
    const [cameraSearch, setCameraSearch] = useState('');
    const { confirm, ConfirmDialog } = useConfirm();

    const [geoSearchQuery, setGeoSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    const imageInputRef = useRef<HTMLInputElement>(null);
    const [uploadingImage, setUploadingImage] = useState(false);

    const [formData, setFormData] = useState<Partial<Location>>({
        name: '',
        category: '',
        division: '',
        projectType: '',
        description: '',
        image: '',
        lat: DEFAULT_COORDS.lat,
        lng: DEFAULT_COORDS.lng,
        pmName: '',
        pmPhone: '',
        cameras: [],
    });

    const applyLoadedData = (
        locRes: { data: { data: Location[] } },
        camRes: { data: { data: Camera[] } },
        catRes: { data: Category[] },
        accessRes: { data?: { isSuperAdmin?: boolean; appDivisi?: string | null } },
    ) => {
        setLocations(locRes.data.data);
        setAllCameras(camRes.data.data);
        setCategories(catRes.data);
        setBrokenImages(new Set());
        const superAdm = accessRes.data?.isSuperAdmin === true;
        const div = (accessRes.data?.appDivisi as Location['division']) || null;
        setIsSuperAdmin(superAdm);
        setCallerDivisi(superAdm ? null : div);
        if (!superAdm && div) {
            setFormData(prev => ({ ...prev, division: prev._id ? prev.division : div }));
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [locRes, camRes, catRes, accessRes] = await Promise.all([
                axios.get('/api/locations?scope=admin'),
                axios.get('/api/cameras?scope=admin'),
                axios.get('/api/categories'),
                axios.get('/api/me/access'),
            ]);
            applyLoadedData(locRes, camRes, catRes, accessRes);
        } catch {
            toast.error('Gagal mengambil data');
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
        Promise.all([
            axios.get('/api/locations?scope=admin'),
            axios.get('/api/cameras?scope=admin'),
            axios.get('/api/categories'),
            axios.get('/api/me/access'),
        ])
            .then(([locRes, camRes, catRes, accessRes]) => {
                if (!active) return;
                applyLoadedData(locRes, camRes, catRes, accessRes);
                const catParam = typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search).get('category')
                    : null;
                if (catParam) setFilterCategory(catParam);
            })
            .catch(() => {
                if (active) toast.error('Gagal mengambil data');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        if (!showForm && !picTarget) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (picTarget) setPicTarget(null);
            else setShowForm(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showForm, picTarget]);

    useEffect(() => {
        if (geoSearchQuery.length < 3) return;
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoSearchQuery)}&limit=5&countrycodes=id`);
                setSearchResults(res.data);
                setSelectedIndex(res.data.length > 0 ? 0 : -1);
            } catch (err) {
                console.error("Geocoding failed", err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [geoSearchQuery]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchResults([]);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('prefix', 'location-images');
            const res = await axios.post('/api/uploads/image', fd);
            if (res.data?.success && res.data.url) {
                setFormData(prev => ({ ...prev, image: res.data.url }));
                toast.success('Foto berhasil diunggah');
            } else {
                toast.error(res.data?.error || 'Gagal mengunggah foto');
            }
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal mengunggah foto');
        } finally {
            setUploadingImage(false);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

    const handleSearchLocation = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!geoSearchQuery) return;
        setIsSearching(true);
        try {
            const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoSearchQuery)}&limit=5&countrycodes=id`);
            setSearchResults(res.data);
            if (res.data.length === 0) toast.error('Lokasi tidak ditemukan');
        } catch {
            toast.error('Pencarian gagal');
        } finally {
            setIsSearching(false);
        }
    };

    const selectSearchResult = (res: GeoResult) => {
        const lat = parseFloat(res.lat);
        const lng = parseFloat(res.lon);
        setFormData(prev => ({ ...prev, lat, lng }));
        setSearchResults([]);
        setGeoSearchQuery(res.display_name.split(',')[0]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (searchResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0) {
                selectSearchResult(searchResults[selectedIndex]);
            } else {
                handleSearchLocation();
            }
        } else if (e.key === 'Escape') {
            setSearchResults([]);
        }
    };

    const handleReset = () => {
        setFormData({
            name: '',
            category: categories.length > 0 ? categories[0].identifier : '',
            division: !isSuperAdmin && callerDivisi ? callerDivisi : '',
            projectType: '',
            description: '',
            image: '',
            lat: DEFAULT_COORDS.lat,
            lng: DEFAULT_COORDS.lng,
            pmName: '',
            pmPhone: '',
            cameras: [],
        });
        setShowForm(false);
        setGeoSearchQuery('');
        setSearchResults([]);
        setCameraSearch('');
    };

    const openCreateModal = () => {
        setFormData({
            name: '',
            category: categories.length > 0 ? categories[0].identifier : '',
            division: !isSuperAdmin && callerDivisi ? callerDivisi : '',
            projectType: '',
            description: '',
            image: '',
            lat: DEFAULT_COORDS.lat,
            lng: DEFAULT_COORDS.lng,
            pmName: '',
            pmPhone: '',
            cameras: [],
        });
        setGeoSearchQuery('');
        setSearchResults([]);
        setCameraSearch('');
        setShowForm(true);
    };

    const handleEdit = (loc: Location) => {
        const camIds = loc.cameras.map(c => typeof c === 'string' ? c : c._id);
        setFormData({ ...loc, cameras: camIds });
        setGeoSearchQuery('');
        setSearchResults([]);
        setCameraSearch('');
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValidLat(formData.lat ?? null) || !isValidLng(formData.lng ?? null)) {
            toast.error('Koordinat tidak valid. Latitude -90..90, Longitude -180..180.');
            return;
        }
        setIsSubmitting(true);
        try {
            const payload: Record<string, unknown> = {
                ...formData,
                category: formData.category || (categories.length > 0 ? categories[0].identifier : ''),
            };
            if (!payload.division) payload.division = null;
            if (!payload.projectType) payload.projectType = null;
            if (payload._id) {
                await axios.put('/api/locations', payload);
                toast.success('Lokasi berhasil diperbarui');
            } else {
                await axios.post('/api/locations', payload);
                toast.success('Lokasi berhasil ditambahkan');
            }
            handleReset();
            await fetchData();
        } catch (error: unknown) {
            toast.error(getApiError(error) || 'Gagal menyimpan lokasi');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm(`Yakin ingin menghapus lokasi "${name}"? Semua kamera yang terhubung akan dilepas.`, {
            title: 'Hapus Lokasi',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await axios.delete(`/api/locations?id=${id}`);
            toast.success('Lokasi dihapus');
            await fetchData();
        } catch {
            toast.error('Gagal menghapus');
        }
    };

    const handleCameraToggle = (camId: string) => {
        setFormData(prev => {
            const cameras = (prev.cameras || []) as string[];
            if (cameras.includes(camId)) {
                return { ...prev, cameras: cameras.filter(id => id !== camId) };
            }
            return { ...prev, cameras: [...cameras, camId] };
        });
    };

    const categoryCountMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const l of locations) {
            map.set(l.category, (map.get(l.category) || 0) + 1);
        }
        return map;
    }, [locations]);

    const categoryNameMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of categories) map.set(c.identifier, c.name);
        return map;
    }, [categories]);

    // Hanya tampilkan kategori yang punya proyek (atau yang sedang dipilih) di dropdown filter
    const filterableCategories = useMemo(() => {
        return categories
            .map(c => ({ ...c, count: categoryCountMap.get(c.identifier) || 0 }))
            .filter(c => c.count > 0 || c.identifier === filterCategory)
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [categories, categoryCountMap, filterCategory]);

    const filteredLocations = useMemo(() => {
        let items = locations;
        if (filterCategory !== 'all') {
            items = items.filter(l => l.category === filterCategory);
        }
        if (isSuperAdmin && filterDivision !== 'all') {
            if (filterDivision === 'none') items = items.filter(l => !l.division);
            else items = items.filter(l => l.division === filterDivision);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            items = items.filter(l =>
                l.name.toLowerCase().includes(q) ||
                l.category.toLowerCase().includes(q) ||
                (categoryNameMap.get(l.category) || '').toLowerCase().includes(q) ||
                l.pmName?.toLowerCase().includes(q),
            );
        }
        return items;
    }, [locations, searchQuery, filterCategory, filterDivision, isSuperAdmin, categoryNameMap]);

    const itemsPerPage = viewMode === 'table' ? 15 : 12;
    const totalPages = Math.ceil(filteredLocations.length / itemsPerPage) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const paginatedLocations = useMemo(() => {
        const start = (safePage - 1) * itemsPerPage;
        return filteredLocations.slice(start, start + itemsPerPage);
    }, [filteredLocations, safePage, itemsPerPage]);

    const filteredFormCameras = useMemo(() => {
        const q = cameraSearch.trim().toLowerCase();
        if (!q) return allCameras;
        return allCameras.filter(c => c.name.toLowerCase().includes(q));
    }, [allCameras, cameraSearch]);

    const markBrokenImage = (id: string) => {
        setBrokenImages(prev => {
            if (prev.has(id)) return prev;
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-dvh bg-slate-100 dark:bg-slate-950">
                <Loader2 aria-hidden="true" className="w-8 h-8 animate-spin text-yellow-700 dark:text-yellow-500" />
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-32 font-sans">
            {ConfirmDialog}
            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={MapPin}
                    title="Manajemen Proyek"
                    subtitle="Konfigurasi pusat data titik lokasi dan integrasi perangkat CCTV"
                    actions={
                        <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={openCreateModal}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-5 py-3 sm:px-7 sm:py-3.5 rounded-2xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-wider bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.4)]"
                        >
                            <Plus aria-hidden="true" className="w-5 h-5" />
                            <span className="hidden sm:inline">Daftarkan Proyek</span>
                            <span className="sm:hidden">Tambah</span>
                        </motion.button>
                    }
                />

                {/* Project List Header & Filters */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <MapPin aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" />
                                Daftar Proyek Aktif
                            </h2>
                            <CountBadge count={filteredLocations.length} />
                            {filteredLocations.length !== locations.length && (
                                <span className="text-xs text-slate-500 font-medium">dari {locations.length} total</span>
                            )}
                        </div>
                    </div>

                    {/* Clean 1-Row Filter Toolbar */}
                    <div className="bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
                        <div className="flex-1 min-w-0">
                            <SearchBar
                                value={searchQuery}
                                onChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                placeholder="Cari nama proyek, kategori, atau PM..."
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <select
                                aria-label="Filter kategori proyek"
                                value={filterCategory}
                                onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                                className={`${selectCls} !w-auto max-w-[230px] !py-2.5 !px-3 text-xs font-bold min-h-11`}
                            >
                                <option value="all">Semua Kategori ({locations.length})</option>
                                {filterableCategories.map(cat => (
                                    <option key={cat._id} value={cat.identifier}>
                                        {cat.name} ({cat.count})
                                    </option>
                                ))}
                            </select>

                            {isSuperAdmin && (
                                <select
                                    aria-label="Filter divisi proyek"
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

                            {(filterCategory !== 'all' || filterDivision !== 'all' || searchQuery) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterCategory('all');
                                        setFilterDivision('all');
                                        setSearchQuery('');
                                        setCurrentPage(1);
                                    }}
                                    className="px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors min-h-11"
                                >
                                    Reset
                                </button>
                            )}

                            <div className="inline-flex rounded-xl p-1 bg-black/[0.04] dark:bg-slate-950/60 border border-black/10 dark:border-white/10" role="group" aria-label="Mode tampilan">
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
                            </div>
                        </div>
                    </div>

                    {filteredLocations.length === 0 ? (
                        <EmptyState
                            icon={MapPin}
                            title={searchQuery || filterCategory !== 'all' ? 'Tidak ditemukan' : 'Belum ada lokasi yang terdaftar'}
                            subtitle={searchQuery || filterCategory !== 'all' ? 'Coba ubah filter atau kata pencarian Anda' : 'Gunakan tombol "Daftarkan Proyek" untuk memulai'}
                        />
                    ) : viewMode === 'table' ? (
                        <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-sm">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                                        <th scope="col" className="px-4 py-3 font-bold">Proyek</th>
                                        <th scope="col" className="px-3 py-3 font-bold">Kategori</th>
                                        {isSuperAdmin && <th scope="col" className="px-3 py-3 font-bold hidden md:table-cell">Divisi</th>}
                                        <th scope="col" className="px-3 py-3 font-bold hidden lg:table-cell">Project Manager</th>
                                        <th scope="col" className="px-3 py-3 font-bold text-center">CCTV</th>
                                        <th scope="col" className="px-4 py-3 font-bold text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedLocations.map(loc => (
                                        <tr key={loc._id} className="border-b last:border-b-0 border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 py-3 min-w-[200px]">
                                                <div className="font-bold text-slate-900 dark:text-white">{loc.name}</div>
                                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                                    {loc.lat?.toFixed(3)}, {loc.lng?.toFixed(3)}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <span className="px-2.5 py-1 rounded-lg bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/25 text-[11px] font-bold uppercase">
                                                    {categoryNameMap.get(loc.category) || loc.category}
                                                </span>
                                            </td>
                                            {isSuperAdmin && (
                                                <td className="px-3 py-3 whitespace-nowrap hidden md:table-cell">
                                                    {loc.division ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                                            <Building2 aria-hidden="true" className="w-3 h-3" />
                                                            {loc.division}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">—</span>
                                                    )}
                                                </td>
                                            )}
                                            <td className="px-3 py-3 hidden lg:table-cell text-xs font-medium text-slate-700 dark:text-slate-300">
                                                {loc.pmName || '—'}
                                            </td>
                                            <td className="px-3 py-3 text-center whitespace-nowrap">
                                                <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">
                                                    {loc.cameras?.length || 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1">
                                                    <Link
                                                        href={`/project/${loc._id}`}
                                                        title="Buka Detail Proyek"
                                                        aria-label={`Detail proyek ${loc.name}`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-blue-500/15 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                                                    >
                                                        <ExternalLink aria-hidden="true" className="w-4 h-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => setPicTarget(loc)}
                                                        title="Atur PIC Proyek"
                                                        aria-label={`Atur PIC proyek ${loc.name}`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-emerald-500/15 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                                                    >
                                                        <Users aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(loc)}
                                                        title="Edit Proyek"
                                                        aria-label={`Edit proyek ${loc.name}`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-yellow-500/20 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-colors"
                                                    >
                                                        <Edit2 aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(loc._id, loc.name)}
                                                        title="Hapus Proyek"
                                                        aria-label={`Hapus proyek ${loc.name}`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 transition-colors"
                                                    >
                                                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            {paginatedLocations.map(loc => {
                                const showImg = Boolean(loc.image) && !brokenImages.has(loc._id);
                                return (
                                    <motion.div
                                        variants={cardVariants}
                                        key={loc._id}
                                        className="group bg-white/75 dark:bg-slate-900/65 backdrop-blur-md rounded-3xl border border-black/10 dark:border-white/10 overflow-hidden hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.06)] transition-all flex flex-col"
                                    >
                                        <div className="h-40 bg-slate-200 dark:bg-slate-800/90 relative overflow-hidden">
                                            {showImg ? (
                                                // eslint-disable-next-line @next/next/no-img-element -- URL gambar dinamis hasil upload/eksternal
                                                <img
                                                    src={loc.image}
                                                    alt={`Foto proyek ${loc.name}`}
                                                    onError={() => markBrokenImage(loc._id)}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600">
                                                    <ImageIcon aria-hidden="true" className="w-11 h-11" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                                            <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                                                {isSuperAdmin && loc.division ? (
                                                    <span className="px-2.5 py-1 bg-slate-950/75 backdrop-blur rounded-lg text-[10px] font-bold text-blue-300 border border-blue-400/30 uppercase">
                                                        {loc.division}
                                                    </span>
                                                ) : <span />}
                                                <span className="px-2.5 py-1 bg-yellow-500/95 backdrop-blur rounded-lg text-[10px] font-bold text-slate-950 uppercase tracking-tight shadow-sm truncate max-w-[160px]">
                                                    {categoryNameMap.get(loc.category) || loc.category}
                                                </span>
                                            </div>
                                            <h3 title={loc.name} className="absolute bottom-3.5 left-5 right-5 font-bold text-lg text-white tracking-tight uppercase leading-tight line-clamp-2 drop-shadow">
                                                {loc.name}
                                            </h3>
                                        </div>

                                        <div className="p-5 flex-1 flex flex-col">
                                            <div className="space-y-2.5 flex-1 mb-5">
                                                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                                                        <User aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-[10px] block text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">Project Manager</span>
                                                        <span className="text-sm font-bold truncate block">{loc.pmName || '—'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                                                        <Video aria-hidden="true" className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-[10px] block text-slate-500 font-bold uppercase tracking-wider leading-none mb-1">CCTV Connected</span>
                                                        <span className="text-sm font-bold block">{loc.cameras?.length || 0} Perangkat</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-2 pt-3.5 border-t border-black/5 dark:border-white/5">
                                                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-black/[0.04] dark:bg-white/5 px-2.5 py-1 rounded-lg">
                                                    <MapPin aria-hidden="true" className="w-3 h-3" />
                                                    {loc.lat?.toFixed(3)}, {loc.lng?.toFixed(3)}
                                                </div>
                                                <div className="flex gap-1">
                                                    <Link
                                                        href={`/project/${loc._id}`}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 text-slate-500 hover:text-blue-700 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all min-w-10 min-h-10 inline-flex items-center justify-center"
                                                        title="Buka Detail Proyek"
                                                        aria-label={`Detail proyek ${loc.name}`}
                                                    >
                                                        <ExternalLink aria-hidden="true" className="w-4 h-4" />
                                                    </Link>
                                                    <button
                                                        onClick={() => setPicTarget(loc)}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all min-w-10 min-h-10 inline-flex items-center justify-center"
                                                        title="Atur PIC Proyek"
                                                        aria-label={`Atur PIC proyek ${loc.name}`}
                                                    >
                                                        <Users aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEdit(loc)}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 text-slate-500 hover:text-yellow-800 dark:hover:text-yellow-400 hover:bg-yellow-400/10 rounded-xl transition-all min-w-10 min-h-10 inline-flex items-center justify-center"
                                                        title="Edit Data"
                                                        aria-label={`Edit proyek ${loc.name}`}
                                                    >
                                                        <Edit2 aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(loc._id, loc.name)}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2.5 text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all min-w-10 min-h-10 inline-flex items-center justify-center"
                                                        title="Hapus Data"
                                                        aria-label={`Hapus proyek ${loc.name}`}
                                                    >
                                                        <Trash2 aria-hidden="true" className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-black/5 dark:border-white/5">
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                Halaman <span className="text-slate-900 dark:text-white font-bold">{safePage}</span> dari <span className="text-slate-900 dark:text-white font-bold">{totalPages}</span> (Total {filteredLocations.length} proyek)
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
            </div>

            {/* Modal Form Tambah / Edit Proyek */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={formData._id ? 'Edit proyek' : 'Daftarkan proyek baru'}
                        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
                        onClick={handleReset}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            transition={{ type: "spring", stiffness: 320, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-4xl max-h-[92dvh] flex flex-col shadow-[0_30px_70px_rgba(15,23,42,0.3)] dark:shadow-[0_30px_70px_rgba(0,0,0,0.75)] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                                        {formData._id ? <Edit2 aria-hidden="true" className="w-5 h-5" /> : <Plus aria-hidden="true" className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                            {formData._id ? `Edit Proyek: ${formData.name}` : 'Daftarkan Proyek Baru'}
                                        </h2>
                                        <p className="text-xs text-slate-500">Lengkapi informasi dasar, titik koordinat peta, dan kamera CCTV proyek.</p>
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

                            <form id="location-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                                {/* Section 1: Informasi Dasar */}
                                <div>
                                    <SectionHeader icon={ClipboardList} title="Informasi Dasar" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField label="Nama Lokasi/Proyek" required>
                                            <input required type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls()} placeholder="Contoh: SD Negeri 1 Jakarta" />
                                        </FormField>
                                        <FormField label="Kategori" required>
                                            <select required value={formData.category || (categories.length > 0 ? categories[0].identifier : '')} onChange={e => setFormData({ ...formData, category: e.target.value })} className={selectCls}>
                                                {categories.length === 0 && <option value="" disabled>Pilih Kategori...</option>}
                                                {categories.map((cat) => (
                                                    <option key={cat._id} value={cat.identifier}>{cat.name}</option>
                                                ))}
                                            </select>
                                        </FormField>
                                        <FormField label="Divisi">
                                            <select
                                                value={!isSuperAdmin && callerDivisi ? callerDivisi : (formData.division ?? '')}
                                                disabled={!isSuperAdmin && Boolean(callerDivisi)}
                                                onChange={e => setFormData({ ...formData, division: e.target.value as Location['division'] })}
                                                className={`${selectCls} disabled:opacity-70 disabled:cursor-not-allowed`}
                                            >
                                                <option value="">— Tanpa Divisi —</option>
                                                <option value="DIVISI 1">DIVISI 1</option>
                                                <option value="DIVISI 2">DIVISI 2</option>
                                                <option value="DIVISI 3">DIVISI 3</option>
                                            </select>
                                        </FormField>
                                        <FormField label="Tipe Proyek">
                                            <select value={formData.projectType ?? ''} onChange={e => setFormData({ ...formData, projectType: e.target.value as Location['projectType'] })} className={selectCls}>
                                                <option value="">— Pilih Tipe —</option>
                                                <option value="NON_JO">Proyek Non-JO</option>
                                                <option value="JO">Proyek JO</option>
                                            </select>
                                        </FormField>
                                        <div className="md:col-span-2">
                                            <FormField label="Deskripsi Singkat">
                                                <textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} className={inputCls()} rows={2} placeholder="Ceritakan sedikit tentang proyek ini..." />
                                            </FormField>
                                        </div>
                                        <div className="md:col-span-2">
                                            <FormField label="Foto Proyek">
                                                <div className="flex gap-4 items-center flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => imageInputRef.current?.click()}
                                                        disabled={uploadingImage}
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-black/10 dark:border-white/10 text-xs font-bold text-slate-900 dark:text-white transition-colors disabled:opacity-60 min-h-11"
                                                    >
                                                        {uploadingImage ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <ImageIcon aria-hidden="true" className="w-4 h-4" />}
                                                        {formData.image ? 'Ganti Foto' : 'Unggah Foto'}
                                                    </button>
                                                    <input
                                                        ref={imageInputRef}
                                                        aria-label="Unggah foto proyek"
                                                        tabIndex={-1}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={handleImageUpload}
                                                    />
                                                    {formData.image && (
                                                        <>
                                                            {/* eslint-disable-next-line @next/next/no-img-element -- URL gambar dinamis hasil upload/eksternal */}
                                                            <img src={formData.image} alt="Pratinjau foto proyek" className="w-14 h-14 rounded-xl object-cover border border-black/10 dark:border-white/10 shadow" />
                                                            <button
                                                                type="button"
                                                                onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                                                                aria-label="Hapus foto proyek"
                                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none text-[11px] text-slate-500 hover:text-rose-700 dark:hover:text-rose-400 font-bold uppercase tracking-wider transition-colors"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={formData.image || ''}
                                                    aria-label="URL gambar proyek"
                                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                                    className={`mt-2 w-full ${inputCls()}`}
                                                    placeholder="atau tempel URL gambar: https://..."
                                                />
                                            </FormField>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Project Manager */}
                                <div>
                                    <SectionHeader icon={User} title="Project Manager" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField label="Nama PM">
                                            <input type="text" value={formData.pmName || ''} onChange={e => setFormData({ ...formData, pmName: e.target.value })} className={inputCls()} placeholder="Contoh: Budi Santoso" />
                                        </FormField>
                                        <FormField label="No. WhatsApp PM" icon={<Phone aria-hidden="true" className="w-4 h-4" />}>
                                            <input type="text" value={formData.pmPhone || ''} onChange={e => setFormData({ ...formData, pmPhone: e.target.value })} className={inputCls(true)} placeholder="628123456789" />
                                        </FormField>
                                    </div>
                                </div>

                                {/* Section 3: Lokasi Proyek */}
                                <div>
                                    <SectionHeader icon={MapPin} title="Titik Lokasi Peta" />
                                    <div className="space-y-5">
                                        <div className="relative" ref={searchRef}>
                                            <FormField label="Cari & Tentukan Koordinat">
                                                <div className="flex gap-2">
                                                    <div className="relative flex-1">
                                                        <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                        <input
                                                            type="text"
                                                            value={geoSearchQuery}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setGeoSearchQuery(val);
                                                                if (val.length < 3) setSearchResults([]);
                                                            }}
                                                            onKeyDown={handleKeyDown}
                                                            aria-label="Cari & tentukan koordinat"
                                                            className={inputCls(true)}
                                                            placeholder="Ketik nama kota/lokasi... (contoh: Jakarta)"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSearchLocation()}
                                                        disabled={isSearching}
                                                        aria-label="Cari lokasi"
                                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none bg-slate-200 dark:bg-slate-800 px-4 min-w-12 flex items-center justify-center rounded-xl text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors border border-black/5 dark:border-white/5"
                                                    >
                                                        {isSearching ? <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin" /> : <Search aria-hidden="true" className="w-5 h-5" />}
                                                    </button>
                                                </div>
                                            </FormField>

                                            <AnimatePresence>
                                                {searchResults.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -8 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -8 }}
                                                        className="absolute top-full left-0 right-0 z-[2000] mt-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                                                    >
                                                        <div className="max-h-56 overflow-y-auto custom-scrollbar">
                                                            {searchResults.map((res, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => selectSearchResult(res)}
                                                                    onMouseEnter={() => setSelectedIndex(idx)}
                                                                    className={`w-full text-left p-3.5 border-b last:border-b-0 border-black/5 dark:border-white/5 text-sm transition-all flex items-center gap-3 ${selectedIndex === idx ? 'bg-black/[0.06] dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                                >
                                                                    <MapPin aria-hidden="true" className="w-4 h-4 text-yellow-600 shrink-0" />
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="font-bold text-slate-900 dark:text-white truncate">{res.display_name.split(',')[0]}</div>
                                                                        <div className="text-[11px] text-slate-500 truncate">{res.display_name.split(',').slice(1).join(',')}</div>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                            <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 h-64 bg-slate-100 dark:bg-slate-950 flex items-center justify-center shadow-inner">
                                                {typeof window !== 'undefined' && RL && L ? (
                                                    <MapContainer
                                                        center={[formData.lat || DEFAULT_COORDS.lat, formData.lng || DEFAULT_COORDS.lng]}
                                                        zoom={6.5}
                                                        style={{ height: '100%', width: '100%', zIndex: 0 }}
                                                        attributionControl={false}
                                                    >
                                                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                        <LocationPickerAndSync
                                                            lat={formData.lat || DEFAULT_COORDS.lat}
                                                            lng={formData.lng || DEFAULT_COORDS.lng}
                                                            onPick={(lat, lng) => setFormData(prev => ({ ...prev, lat, lng }))}
                                                            RL={RL}
                                                        />
                                                        {formData.lat && formData.lng && (
                                                            <Marker position={[formData.lat, formData.lng]} />
                                                        )}
                                                    </MapContainer>
                                                ) : (
                                                    <Loader2 aria-hidden="true" className="animate-spin text-slate-500" />
                                                )}
                                            </div>
                                            <CoordinateInput
                                                lat={formData.lat ?? null}
                                                lng={formData.lng ?? null}
                                                onChange={(lat, lng) => setFormData(prev => ({
                                                    ...prev,
                                                    lat: lat ?? undefined,
                                                    lng: lng ?? undefined,
                                                }))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Kamera CCTV */}
                                <div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                                        <SectionHeader icon={Video} title={`Integrasi Kamera (${(formData.cameras || []).length} dipilih)`} />
                                        <div className="relative sm:w-64">
                                            <Search aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={cameraSearch}
                                                onChange={(e) => setCameraSearch(e.target.value)}
                                                placeholder="Cari kamera..."
                                                aria-label="Cari kamera untuk ditautkan"
                                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/[0.03] dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-xs text-slate-900 dark:text-white outline-none focus:border-yellow-500/50"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-3.5 bg-black/[0.04] dark:bg-black/40 rounded-2xl border border-black/5 dark:border-white/5 custom-scrollbar">
                                        {filteredFormCameras.map((cam) => {
                                            const isChecked = (formData.cameras as string[])?.includes(cam._id);
                                            const isOnline = cam.status === 'online';
                                            return (
                                                <label
                                                    key={cam._id}
                                                    className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all border ${
                                                        isChecked
                                                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-800 dark:text-yellow-200'
                                                            : 'bg-black/[0.03] dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => handleCameraToggle(cam._id)}
                                                            aria-label={`Tautkan kamera ${cam.name}`}
                                                            className="w-4 h-4 rounded border-black/15 dark:border-white/20 bg-white dark:bg-black/50 accent-yellow-500 shrink-0"
                                                        />
                                                        <span className="text-xs font-bold truncate">{cam.name}</span>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                        isOnline ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                                    }`}>
                                                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                        {filteredFormCameras.length === 0 && (
                                            <span className="col-span-full text-slate-500 text-xs p-4 text-center">
                                                {cameraSearch ? 'Tidak ada kamera yang cocok.' : 'Belum ada perangkat kamera terdaftar.'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </form>

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
                                    form="location-form"
                                    disabled={isSubmitting}
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-7 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl transition-all shadow-[0_6px_20px_rgba(234,179,8,0.3)] flex items-center gap-2 uppercase tracking-wider text-xs disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Save aria-hidden="true" className="w-4 h-4" />}
                                    {formData._id ? 'Update Proyek' : 'Simpan Proyek'}
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Atur PIC Proyek */}
            <AnimatePresence>
                {picTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Atur PIC proyek ${picTarget.name}`}
                        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
                        onClick={() => setPicTarget(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-xl max-h-[85dvh] flex flex-col shadow-[0_30px_70px_rgba(15,23,42,0.3)] dark:shadow-[0_30px_70px_rgba(0,0,0,0.75)] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
                                        <Users aria-hidden="true" className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                            Atur PIC Proyek
                                        </h2>
                                        <p className="text-xs text-slate-500 truncate">{picTarget.name}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPicTarget(null)}
                                    aria-label="Tutup dialog PIC"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                                >
                                    <X aria-hidden="true" className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-5 overflow-y-auto custom-scrollbar">
                                <PicManager key={picTarget._id} projectId={picTarget._id} />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
