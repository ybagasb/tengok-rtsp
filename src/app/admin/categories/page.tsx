"use client";

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, Loader2, Save, RotateCcw,
    LayoutGrid, Tags, Palette, Info, Link as LinkIcon, ArrowRight, MapPin, Navigation
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { containerVariants, cardVariants, inputCls } from '@/components/admin/shared';
import { PageHeader, SectionHeader, FormField, EmptyState, FullPageLoading, SearchBar, useConfirm, CountBadge } from '@/components/admin/AdminUI';

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
    defaultLat?: number;
    defaultLng?: number;
    defaultZoom?: number;
    createdAt?: string;
}

interface LocationCount {
    [identifier: string]: number;
}

const AVAILABLE_ICONS = [
    'School', 'Building2', 'Home', 'Hotel', 'Hospital', 'Briefcase',
    'Camera', 'ShieldCheck', 'Map', 'LayoutGrid', 'HardHat', 'Truck',
    'Factory', 'Landmark', 'Construction', 'Warehouse', 'Building', 'TreePine'
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

// Map click handler component
function MapClickHandler({ onPick, RL }: { onPick: (lat: number, lng: number) => void; RL: any }) {
    if (!RL?.useMapEvents) return null;
    RL.useMapEvents({ click(e: any) { onPick(e.latlng.lat, e.latlng.lng); } });
    return null;
}

export default function AdminCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [locationCounts, setLocationCounts] = useState<LocationCount>({});
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [L, setL] = useState<any>(null);
    const [RL, setRL] = useState<any>(null);
    const { confirm, ConfirmDialog } = useConfirm();

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

    useEffect(() => {
        const init = async () => {
            if (typeof window !== 'undefined') {
                const [leaf, rLeaf] = await Promise.all([import('leaflet'), import('react-leaflet')]);
                const LMod = leaf.default;
                setL(LMod);
                setRL(rLeaf);
                delete (LMod.Icon.Default.prototype as any)._getIconUrl;
                LMod.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                });
            }
        };
        init();
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [catRes, locRes] = await Promise.all([
                axios.get('/api/categories'),
                axios.get('/api/locations'),
            ]);
            setCategories(catRes.data);

            // Count locations per category
            const counts: LocationCount = {};
            const locations = locRes.data.data || [];
            locations.forEach((loc: any) => {
                counts[loc.category] = (counts[loc.category] || 0) + 1;
            });
            setLocationCounts(counts);
        } catch (error) {
            toast.error('Gagal mengambil data kategori');
        } finally {
            setLoading(false);
        }
    };

    const generateIdentifier = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        setFormData(prev => ({
            ...prev,
            name,
            ...(!prev._id ? { identifier: generateIdentifier(name) } : {})
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (formData._id) {
                await axios.put(`/api/categories/${formData._id}`, formData);
                toast.success('Kategori berhasil diperbarui');
            } else {
                await axios.post('/api/categories', formData);
                toast.success('Kategori berhasil ditambahkan');
            }
            handleReset();
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan kategori');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (cat: Category) => {
        setFormData(cat);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string, name: string) => {
        const ok = await confirm(`Yakin ingin menghapus kategori "${name}"? Lokasi yang menggunakan kategori ini mungkin tidak akan tampil dengan benar.`, {
            title: 'Hapus Kategori',
        });
        if (!ok) return;
        try {
            await axios.delete(`/api/categories/${id}`);
            toast.success('Kategori dihapus');
            fetchData();
        } catch (error) {
            toast.error('Gagal menghapus kategori');
        }
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
        setShowForm(false);
    };

    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        const q = searchQuery.toLowerCase();
        return categories.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.identifier.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
        );
    }, [categories, searchQuery]);

    if (loading) return <FullPageLoading />;

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans">
            {ConfirmDialog}
            <div className="max-w-5xl mx-auto">
                <PageHeader
                    icon={LayoutGrid}
                    title="Kategori Proyek"
                    subtitle="Kelola jenis kategori tayangan dan pangkalan visual ikon aplikasi"
                    actions={
                        <motion.button
                            whileHover={{ y: showForm ? 0 : -2 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => { if (showForm) handleReset(); else setShowForm(true); }}
                            className={`px-5 py-3 sm:px-8 sm:py-3.5 rounded-2xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-wider ${showForm ? 'bg-slate-800 text-slate-400 border border-white/5 hover:bg-slate-700 hover:text-white' : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.4)]'}`}
                        >
                            {showForm ? 'Batal' : <><Plus className="w-5 h-5" /><span className="hidden sm:inline">Buat Kategori</span><span className="sm:hidden">Tambah</span></>}
                        </motion.button>
                    }
                />

                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="bg-slate-900/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 mb-12 shadow-[0_30px_60px_rgba(0,0,0,0.4)] overflow-hidden relative group"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[100px] pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/5 blur-[80px] pointer-events-none" />

                            <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                                {/* Section 1: Informasi Dasar */}
                                <div>
                                    <SectionHeader icon={Info} title="Informasi Dasar" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <FormField label="Nama Kategori" required>
                                            <input required type="text" value={formData.name} onChange={handleNameChange} className={inputCls()} placeholder="Contoh: Sekolah Dasar" />
                                        </FormField>
                                        <FormField label="URL Identifier" required icon={<LinkIcon className="w-4 h-4" />}>
                                            <input required type="text" value={formData.identifier} onChange={e => setFormData({ ...formData, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className={inputCls(true)} placeholder="sekolah-dasar" />
                                        </FormField>
                                        <div className="md:col-span-2">
                                            <FormField label="Deskripsi" required>
                                                <textarea required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className={inputCls()} rows={3} placeholder="Penjelasan mengenai kategori ini..." />
                                            </FormField>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Tampilan Visual */}
                                <div>
                                    <SectionHeader icon={Palette} title="Tampilan Visual" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Icon Picker */}
                                        <FormField label="Pilih Icon" required>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                                {AVAILABLE_ICONS.map(iconName => {
                                                    const IconComp = (LucideIcons as any)[iconName];
                                                    const isSelected = formData.icon === iconName;
                                                    return (
                                                        <motion.button
                                                            key={iconName}
                                                            type="button"
                                                            whileHover={{ scale: 1.08 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => setFormData({ ...formData, icon: iconName })}
                                                            className={`p-4 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-yellow-500 text-slate-900 shadow-[0_0_20px_rgba(234,179,8,0.4)] ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-950 z-10' : 'bg-black/50 text-slate-400 hover:bg-slate-800 hover:text-white border border-white/10'}`}
                                                            title={iconName}
                                                        >
                                                            {IconComp && <IconComp className="w-6 h-6" />}
                                                        </motion.button>
                                                    )
                                                })}
                                            </div>
                                        </FormField>

                                        {/* Color Picker */}
                                        <FormField label="Mode Warna Kategori" required>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {AVAILABLE_COLORS.map(color => {
                                                    const isSelected = formData.color === color.value;
                                                    return (
                                                        <motion.button
                                                            key={color.value}
                                                            type="button"
                                                            whileHover={{ scale: 1.03 }}
                                                            whileTap={{ scale: 0.97 }}
                                                            onClick={() => setFormData({ ...formData, color: color.value })}
                                                            className={`p-4 rounded-xl flex items-center gap-3 transition-all text-left ${isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-950 bg-slate-800 shadow-[0_0_15px_rgba(234,179,8,0.15)]' : 'bg-black/50 hover:bg-slate-800 border border-white/10'}`}
                                                        >
                                                            <div className={`w-8 h-8 rounded-lg shadow-inner ${color.class}`} />
                                                            <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>{color.label}</span>
                                                        </motion.button>
                                                    )
                                                })}
                                            </div>
                                        </FormField>

                                        {/* Live Preview */}
                                        <div className="md:col-span-2 mt-4 p-8 bg-black/30 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                                            <label className="text-[10px] font-bold text-slate-600 uppercase mb-6 tracking-wider">— Live Preview Card —</label>
                                            <motion.button
                                                layout
                                                type="button"
                                                className="group/preview relative w-full max-w-[360px] h-52 rounded-[2.5rem] overflow-hidden bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-yellow-500/30 transition-all duration-500 text-left p-6 sm:p-8 shadow-2xl flex flex-col justify-between"
                                            >
                                                <div className={`absolute -top-10 -right-10 w-32 h-32 sm:w-40 sm:h-40 bg-gradient-to-br ${formData.color} opacity-10 blur-3xl group-hover/preview:opacity-20 transition-opacity duration-500`} />
                                                <div className="relative z-10 flex justify-between items-start">
                                                    <div className={`p-4 rounded-3xl bg-gradient-to-br ${formData.color} shadow-lg`}>
                                                        {formData.icon && (LucideIcons as any)[formData.icon] &&
                                                            (() => { const PreviewIcon = (LucideIcons as any)[formData.icon]; return <PreviewIcon className="w-6 h-6 text-white stroke-[2.5]" />; })()
                                                        }
                                                    </div>
                                                    <ArrowRight className="w-6 h-6 text-slate-700" />
                                                </div>
                                                <div className="relative z-10 mt-auto">
                                                    <h2 className="text-2xl font-bold text-white tracking-tight uppercase mb-2">
                                                        {formData.name || 'Nama Kategori'}
                                                    </h2>
                                                    <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-60 leading-relaxed line-clamp-2">
                                                        {formData.description || 'Deskripsi kategori akan tampil di sini'}
                                                    </p>
                                                </div>
                                                <div className="absolute inset-0 border-2 border-transparent group-hover/preview:border-yellow-500/20 rounded-[2.5rem] transition-all duration-500 pointer-events-none" />
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Pengaturan Default Peta */}
                                <div>
                                    <SectionHeader icon={Navigation} title="Pengaturan Default Tampilan Peta" />
                                    <p className="text-xs text-slate-500 mb-6 -mt-3">
                                        Atur titik koordinat dan zoom default saat user membuka peta kategori ini. Klik pada peta atau isi manual. Jika dikosongkan, akan menggunakan default Indonesia.
                                    </p>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        {/* Map picker */}
                                        <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-white/10 h-72 bg-slate-950 flex items-center justify-center shadow-inner">
                                            {typeof window !== 'undefined' && RL && L ? (
                                                <MapContainer
                                                    center={[formData.defaultLat || DEFAULT_CENTER.lat, formData.defaultLng || DEFAULT_CENTER.lng]}
                                                    zoom={formData.defaultZoom || DEFAULT_ZOOM}
                                                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                                                    attributionControl={false}
                                                >
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <MapClickHandler
                                                        onPick={(lat, lng) => setFormData(prev => ({ ...prev, defaultLat: lat, defaultLng: lng }))}
                                                        RL={RL}
                                                    />
                                                    {formData.defaultLat && formData.defaultLng && (
                                                        <Marker position={[formData.defaultLat, formData.defaultLng]} />
                                                    )}
                                                </MapContainer>
                                            ) : (
                                                <Loader2 className="animate-spin text-slate-700" />
                                            )}
                                        </div>
                                        {/* Manual inputs */}
                                        <div className="bg-black/40 rounded-2xl p-6 border border-white/10 flex flex-col justify-center space-y-5">
                                            <FormField label="Latitude">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={formData.defaultLat ?? ''}
                                                    onChange={e => setFormData({ ...formData, defaultLat: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                    className={inputCls()}
                                                    placeholder="-6.2088 (opsional)"
                                                />
                                            </FormField>
                                            <FormField label="Longitude">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={formData.defaultLng ?? ''}
                                                    onChange={e => setFormData({ ...formData, defaultLng: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                    className={inputCls()}
                                                    placeholder="106.8456 (opsional)"
                                                />
                                            </FormField>
                                            <FormField label="Zoom Level (1-18)">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={18}
                                                    step={0.5}
                                                    value={formData.defaultZoom ?? ''}
                                                    onChange={e => setFormData({ ...formData, defaultZoom: e.target.value ? parseFloat(e.target.value) : undefined })}
                                                    className={inputCls()}
                                                    placeholder="12 (opsional)"
                                                />
                                            </FormField>
                                            {formData.defaultLat && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, defaultLat: undefined, defaultLng: undefined, defaultZoom: undefined }))}
                                                    className="text-[11px] text-slate-500 hover:text-red-400 transition-colors uppercase tracking-wider font-bold mt-2"
                                                >
                                                    Reset ke Default Indonesia
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-4 pt-6 border-t border-white/5">
                                    <motion.button
                                        whileHover={{ y: -2 }}
                                        whileTap={{ scale: 0.97 }}
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-900 font-bold py-4 rounded-xl transition-all shadow-[0_10px_30px_rgba(234,179,8,0.3)] flex items-center justify-center gap-2 uppercase tracking-wider text-sm disabled:opacity-50"
                                    >
                                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        Simpan Kategori
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ rotate: -180 }}
                                        whileTap={{ scale: 0.95 }}
                                        type="button"
                                        onClick={handleReset}
                                        className="px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all flex items-center justify-center border border-white/10"
                                    >
                                        <RotateCcw className="w-5 h-5 transition-transform duration-500" />
                                    </motion.button>
                                </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Search */}
                {categories.length > 0 && (
                    <div className="mb-6">
                        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Cari kategori..." />
                    </div>
                )}

                {/* Categories List */}
                {filteredCategories.length === 0 && !loading ? (
                    <EmptyState
                        icon={Tags}
                        title={searchQuery ? 'Tidak ditemukan' : 'Belum Ada Kategori'}
                        subtitle={searchQuery ? 'Coba ubah kata pencarian Anda' : 'Buat klasifikasi proyek pertama Anda menggunakan panel di atas.'}
                    />
                ) : (
                    <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                        {filteredCategories.map((cat) => {
                            const IconComp = (LucideIcons as any)[cat.icon] || LayoutGrid;
                            const locCount = locationCounts[cat.identifier] || 0;

                            return (
                                <motion.div
                                    variants={cardVariants}
                                    key={cat._id}
                                    className="group relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.06)] transition-all overflow-hidden flex flex-col h-[300px]"
                                >
                                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${cat.color} opacity-20 blur-3xl pointer-events-none group-hover:opacity-40 transition-opacity duration-500`} />

                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className={`p-4 rounded-2xl bg-gradient-to-br ${cat.color} text-white shadow-lg`}>
                                            <IconComp className="w-6 h-6" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEdit(cat)} className="p-2.5 bg-black/40 hover:bg-yellow-500/20 text-slate-400 hover:text-yellow-400 rounded-xl transition-all border border-white/5 hover:border-yellow-500/30">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(cat._id, cat.name)} className="p-2.5 bg-black/40 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all border border-white/5 hover:border-red-500/30">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-auto relative z-10">
                                        <h3 className="text-xl font-bold text-white mb-1 uppercase tracking-wider group-hover:text-yellow-400 transition-colors">{cat.name}</h3>
                                        <p className="text-xs font-mono text-slate-500 mb-3 bg-black/30 w-fit px-2 py-1 rounded-md border border-white/5">/{cat.identifier}</p>
                                        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed mb-4">{cat.description}</p>

                                        {/* Location count + Map defaults badge */}
                                        <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                                            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                <MapPin className="w-3 h-3" />
                                                {locCount} Proyek
                                            </span>
                                            {cat.defaultLat && (
                                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500/60">
                                                    <Navigation className="w-3 h-3" />
                                                    Custom Map
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
