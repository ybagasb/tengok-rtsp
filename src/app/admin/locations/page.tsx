"use client";

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, Loader2, Image as ImageIcon,
    MapPin, ArrowLeft, Search, Save, RotateCcw,
    User, Phone, Video, ClipboardList, Tags
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';

// --- Dynamic Imports for Leaflet ---
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
// useMapEvents is a hook and cannot be used with dynamic()

// --- Interface Definitions ---
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

// --- Helper: Map Events for Picking ---
function LocationPicker({ onPick, RL }: { onPick: (lat: number, lng: number) => void, RL: any }) {
    if (!RL?.useMapEvents) return null;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    RL.useMapEvents({
        click(e: any) {
            onPick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

// --- Main Component ---
export default function AdminLocations() {
    const [locations, setLocations] = useState<Location[]>([]);
    const [allCameras, setAllCameras] = useState<Camera[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [L, setL] = useState<any>(null);
    const [RL, setRL] = useState<any>(null);

    // Search Geocoding State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<Location>>({
        name: '',
        category: '', // Will be set to the first available category defensively
        description: '',
        image: '',
        lat: -4.4943173, // Default position
        lng: 113.2007588,
        pmName: '',
        pmPhone: '',
        cameras: []
    });

    useEffect(() => {
        const init = async () => {
            if (typeof window !== 'undefined') {
                const [leaf, rLeaf] = await Promise.all([
                    import('leaflet'),
                    import('react-leaflet')
                ]);
                const LMod = leaf.default;
                setL(LMod);
                setRL(rLeaf);

                // Fix for default marker icons
                delete (LMod.Icon.Default.prototype as any)._getIconUrl;
                LMod.Icon.Default.mergeOptions({
                    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
                    iconUrl: '/leaflet/marker-icon.png',
                    shadowUrl: '/leaflet/marker-shadow.png',
                });
            }
        };
        init();
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [locRes, camRes, catRes] = await Promise.all([
                axios.get('/api/locations'),
                axios.get('/api/cameras'),
                axios.get('/api/categories')
            ]);
            setLocations(locRes.data.data);
            setAllCameras(camRes.data.data);
            setCategories(catRes.data);
        } catch (error) {
            toast.error('Gagal mengambil data');
        } finally {
            setLoading(false);
        }
    };

    // Live Search Debouncing
    useEffect(() => {
        if (searchQuery.length < 3) {
            setSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=id`);
                setSearchResults(res.data);
                setSelectedIndex(res.data.length > 0 ? 0 : -1);
            } catch (err) {
                console.error("Geocoding failed", err);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // Handle Click Outside for Suggestions
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchResults([]);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearchLocation = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery) return;
        setIsSearching(true);
        try {
            const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=id`);
            setSearchResults(res.data);
            if (res.data.length === 0) toast.error('Lokasi tidak ditemukan');
        } catch (err) {
            toast.error('Pencarian gagal');
        } finally {
            setIsSearching(false);
        }
    };

    const selectSearchResult = (res: any) => {
        const lat = parseFloat(res.lat);
        const lng = parseFloat(res.lon);
        setFormData(prev => ({ ...prev, lat, lng }));
        setSearchResults([]);
        setSearchQuery(res.display_name.split(',')[0]);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = {
                ...formData,
                category: formData.category || (categories.length > 0 ? categories[0].identifier : '')
            };
            
            if (payload._id) {
                // Update
                await axios.put('/api/locations', payload);
                toast.success('Lokasi berhasil diperbarui');
            } else {
                // Create
                await axios.post('/api/locations', payload);
                toast.success('Lokasi berhasil ditambahkan');
            }
            handleReset();
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan lokasi');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (loc: Location) => {
        const camIds = loc.cameras.map(c => typeof c === 'string' ? c : c._id);
        setFormData({ ...loc, cameras: camIds });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Yakin ingin menghapus lokasi ini?')) return;
        try {
            await axios.delete(`/api/locations?id=${id}`);
            toast.success('Lokasi dihapus');
            fetchData();
        } catch (error) {
            toast.error('Gagal menghapus');
        }
    };

    const handleReset = () => {
        setFormData({
            name: '',
            category: categories.length > 0 ? categories[0].identifier : '',
            description: '',
            image: '',
            lat: -6.2088,
            lng: 106.8456,
            pmName: '',
            pmPhone: '',
            cameras: []
        });
        setShowForm(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleCameraToggle = (camId: string) => {
        setFormData(prev => {
            const cameras = prev.cameras as string[];
            if (cameras.includes(camId)) {
                return { ...prev, cameras: cameras.filter(id => id !== camId) };
            }
            return { ...prev, cameras: [...cameras, camId] };
        });
    };

    if (loading) return <div className="flex justify-center items-center h-screen bg-slate-950"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>;

    const SectionHeader = ({ icon: Icon, title, color }: any) => (
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
            <Icon className={`w-4 h-4 ${color}`} />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h3>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-10 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-end mb-10 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-6">
                        <Link href="/categories" className="p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-white/20 transition-all">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </Link>
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Project Management</h1>
                            <p className="text-slate-500 text-sm mt-1 font-medium tracking-wide">Konfigurasi pusat data titik lokasi dan integrasi CCTV</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <Link
                            href="/admin/categories"
                            className="px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-widest bg-slate-900 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white"
                        >
                            <Tags className="w-5 h-5" /> Manajemen Kategori
                        </Link>
                        <button
                            onClick={() => { if (showForm) handleReset(); else setShowForm(true); }}
                            className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-widest ${showForm ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-yellow-500 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.3)] hover:-translate-y-1'}`}
                        >
                            {showForm ? 'Batal' : <><Plus className="w-5 h-5" /> Tambah Lokasi</>}
                        </button>
                    </div>
                </header>

                {showForm && (
                    <div className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 mb-12 shadow-2xl overflow-hidden relative group">
                        {/* Decorative Background */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[100px] pointer-events-none" />

                        <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                            {/* Section 1: Informasi Dasar */}
                            <div>
                                <SectionHeader icon={ClipboardList} title="Informasi Dasar" color="text-blue-500" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Lokasi/Proyek *</label>
                                        <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="Contoh: SD Negeri 1 Jakarta" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Kategori *</label>
                                        <select required value={formData.category || (categories.length > 0 ? categories[0].identifier : '')} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all appearance-none cursor-pointer">
                                            {categories.length === 0 && <option value="" disabled>Pilih Kategori...</option>}
                                            {categories.map((cat) => (
                                                <option key={cat._id} value={cat.identifier}>{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Deskripsi Singkat</label>
                                        <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" rows={3} placeholder="Ceritakan sedikit tentang proyek ini..." />
                                    </div>
                                    <div className="md:col-span-2 space-y-4">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Upload Photo (URL)</label>
                                        <div className="flex gap-4 items-center">
                                            <input type="text" value={formData.image} onChange={e => setFormData({ ...formData, image: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="https://..." />
                                            {formData.image && <img src={formData.image} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-white/10" />}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Project Manager */}
                            <div>
                                <SectionHeader icon={User} title="Project Manager" color="text-yellow-500" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama PM *</label>
                                        <input required type="text" value={formData.pmName} onChange={e => setFormData({ ...formData, pmName: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="Contoh: Budi Santoso" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">No. WhatsApp PM *</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input required type="text" value={formData.pmPhone} onChange={e => setFormData({ ...formData, pmPhone: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="628123456789" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Lokasi Proyek */}
                            <div>
                                <SectionHeader icon={MapPin} title="Lokasi Proyek" color="text-red-500" />
                                <div className="space-y-6">
                                    <div className="relative" ref={searchRef}>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1 mb-2 block">Cari & Tentukan Koordinat</label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={e => setSearchQuery(e.target.value)}
                                                    onKeyDown={handleKeyDown}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-yellow-500/50 outline-none transition-all"
                                                    placeholder="Ketik lokasi... (contoh: Jakarta)"
                                                />
                                                {searchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded-full transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-red-400" />
                                                    </button>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleSearchLocation()}
                                                disabled={isSearching}
                                                className="bg-slate-800 p-4 rounded-xl text-white hover:bg-slate-700 transition-colors"
                                            >
                                                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                                            </button>
                                        </div>

                                        {searchResults.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 z-[2000] mt-3 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                    {searchResults.map((res: any, idx: number) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => selectSearchResult(res)}
                                                            onMouseEnter={() => setSelectedIndex(idx)}
                                                            className={`w-full text-left p-4 border-b border-white/5 text-slate-300 text-sm transition-all flex items-center gap-4 group ${selectedIndex === idx ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                                        >
                                                            <div className={`p-2 rounded-lg bg-slate-800 transition-colors ${selectedIndex === idx ? 'bg-yellow-500/20 text-yellow-500' : 'text-slate-500'}`}>
                                                                <MapPin className="w-4 h-4" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className={`font-bold transition-colors truncate ${selectedIndex === idx ? 'text-white' : 'text-slate-300'}`}>
                                                                    {res.display_name.split(',')[0]}
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                                                    {res.display_name.split(',').slice(1).join(',')}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-white/10 h-80 bg-slate-950 flex items-center justify-center">
                                            {typeof window !== 'undefined' && RL && L ? (
                                                <MapContainer
                                                    center={[formData.lat || -4.4943173, formData.lng || 113.2007588]}
                                                    zoom={6.5}
                                                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                                                >
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <LocationPicker onPick={(lat, lng) => setFormData(prev => ({ ...prev, lat, lng }))} RL={RL} />
                                                    {formData.lat && formData.lng && (
                                                        <Marker position={[formData.lat, formData.lng]} />
                                                    )}
                                                </MapContainer>
                                            ) : (
                                                <Loader2 className="animate-spin text-slate-700" />
                                            )}
                                        </div>
                                        <div className="bg-black/40 rounded-2xl p-6 border border-white/10 flex flex-col justify-center space-y-6">
                                            <div className="space-y-1">
                                                <span className="text-[10px] uppercase text-slate-500 font-black">Latitude</span>
                                                <div className="text-xl font-mono text-white tracking-widest leading-none">{formData.lat?.toFixed(6)}</div>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[10px] uppercase text-slate-500 font-black">Longitude</span>
                                                <div className="text-xl font-mono text-white tracking-widest leading-none">{formData.lng?.toFixed(6)}</div>
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed italic">
                                                * Klik pada peta untuk menyesuaikan titik koordinat secara presisi
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Kamera CCTV */}
                            <div>
                                <SectionHeader icon={Video} title="Integrasi Kamera" color="text-purple-500" />
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-4 bg-black/40 rounded-2xl border border-white/5 custom-scrollbar">
                                    {allCameras.map(cam => (
                                        <label key={cam._id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${formData.cameras?.includes(cam._id) ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'}`}>
                                            <input
                                                type="checkbox"
                                                checked={formData.cameras?.includes(cam._id)}
                                                onChange={() => handleCameraToggle(cam._id)}
                                                className="w-4 h-4 rounded border-white/20 bg-black/50 accent-blue-500"
                                            />
                                            <span className="text-xs font-bold truncate tracking-tight">{cam.name}</span>
                                        </label>
                                    ))}
                                    {allCameras.length === 0 && <span className="col-span-full text-slate-600 text-sm italic p-4 text-center">Belum ada perangkat terdaftar.</span>}
                                </div>
                            </div>

                            {/* Form Actions */}
                            <div className="flex gap-4 pt-6">
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="px-8 py-4 rounded-2xl border border-white/10 text-slate-400 font-bold hover:bg-white/5 transition-all flex items-center gap-2 uppercase text-xs tracking-widest"
                                >
                                    <RotateCcw className="w-4 h-4" /> Reset
                                </button>
                                <button
                                    disabled={isSubmitting}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black flex justify-center items-center gap-3 shadow-[0_10px_30px_rgba(37,99,235,0.4)] transition-all hover:-translate-y-1 uppercase text-sm tracking-widest"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> {formData._id ? 'Update Lokasi' : 'Simpan Lokasi'}</>}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* --- Project List --- */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-2 ml-1">
                        <h2 className="text-xl font-black text-white uppercase italic tracking-wider">Daftar Proyek Terdaftar</h2>
                        <span className="text-slate-600 text-sm font-bold bg-white/5 px-2 py-0.5 rounded-full">{locations.length}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                        {locations.map(loc => (
                            <div key={loc._id} className="group bg-slate-900 rounded-3xl border border-white/10 overflow-hidden hover:border-white/20 transition-all flex flex-col">
                                <div className="h-40 bg-slate-800 relative overflow-hidden">
                                    {loc.image ? (
                                        <img src={loc.image} alt={loc.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-700"><ImageIcon className="w-12 h-12" /></div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                                    <div className="absolute top-4 right-4 px-3 py-1 bg-yellow-500/90 backdrop-blur rounded-lg text-[10px] font-black text-slate-950 uppercase tracking-tighter">
                                        {loc.category}
                                    </div>
                                    <h3 className="absolute bottom-4 left-6 pr-4 font-black text-xl text-white tracking-tight uppercase italic leading-none truncate">
                                        {loc.name}
                                    </h3>
                                </div>

                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="space-y-3 flex-1 mb-6">
                                        <div className="flex items-center gap-3 text-slate-400">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                                <User className="w-4 h-4 text-blue-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] block text-slate-600 font-bold uppercase tracking-widest leading-none mb-1">Project Manager</span>
                                                <span className="text-sm font-bold truncate block">{loc.pmName || '-'}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 text-slate-400">
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                                <Video className="w-4 h-4 text-purple-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] block text-slate-600 font-bold uppercase tracking-widest leading-none mb-1">CCTV Connected</span>
                                                <span className="text-sm font-bold block">{loc.cameras?.length || 0} Perangkat</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-white/5 px-2 py-1 rounded">
                                            <MapPin className="w-3 h-3" />
                                            {loc.lat?.toFixed(3)}, {loc.lng?.toFixed(3)}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleEdit(loc)}
                                                className="p-3 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
                                                title="Edit Data"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(loc._id)}
                                                className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                                title="Hapus Data"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {locations.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600 border-2 border-dashed border-white/5 rounded-[40px] bg-slate-900/20">
                            <MapPin className="w-20 h-20 mb-4 opacity-10" />
                            <p className="font-bold text-lg uppercase tracking-widest opacity-20 italic">Belum ada lokasi yang terdaftar</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
