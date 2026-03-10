"use client";

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Plus, Trash2, Edit2, Loader2, Save, RotateCcw,
    LayoutGrid, Tags, Palette, Info, Link as LinkIcon,
    ArrowLeft, Home, Building2, School, Hotel, Hospital, Briefcase, Camera
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import * as LucideIcons from 'lucide-react';

interface Category {
    _id: string;
    name: string;
    identifier: string;
    description: string;
    icon: string;
    color: string;
    createdAt?: string;
}

// Available standard icons for categories
const AVAILABLE_ICONS = [
    'School', 'Building2', 'Home', 'Hotel', 'Hospital', 'Briefcase',
    'Camera', 'ShieldCheck', 'Map', 'LayoutGrid', 'HardHat', 'Truck'
];

// Available standard Tailwind gradients
const AVAILABLE_COLORS = [
    { label: 'Blue-Cyan', value: 'from-blue-500 to-cyan-400', class: 'bg-gradient-to-br from-blue-500 to-cyan-400' },
    { label: 'Yellow-Orange', value: 'from-yellow-500 to-orange-400', class: 'bg-gradient-to-br from-yellow-500 to-orange-400' },
    { label: 'Purple-Pink', value: 'from-purple-500 to-pink-400', class: 'bg-gradient-to-br from-purple-500 to-pink-400' },
    { label: 'Emerald-Teal', value: 'from-emerald-500 to-teal-400', class: 'bg-gradient-to-br from-emerald-500 to-teal-400' },
    { label: 'Rose-Red', value: 'from-rose-500 to-red-400', class: 'bg-gradient-to-br from-rose-500 to-red-400' },
    { label: 'Indigo-Purple', value: 'from-indigo-500 to-purple-400', class: 'bg-gradient-to-br from-indigo-500 to-purple-400' },
    { label: 'Slate-Gray', value: 'from-slate-500 to-gray-400', class: 'bg-gradient-to-br from-slate-500 to-gray-400' },
];

export default function AdminCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<Category>>({
        name: '',
        identifier: '',
        description: '',
        icon: 'LayoutGrid',
        color: 'from-blue-500 to-cyan-400'
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/categories');
            setCategories(res.data);
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
            // Only auto-generate identifier if creating a new category
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
        if (!confirm(`Yakin ingin menghapus kategori "${name}"? Lokasi yang menggunakan kategori ini mungkin tidak akan tampil dengan benar.`)) return;
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
            color: 'from-blue-500 to-cyan-400'
        });
        setShowForm(false);
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
            <div className="max-w-5xl mx-auto">
                <header className="flex justify-between items-end mb-10 pb-6 border-b border-white/5">
                    <div className="flex items-center gap-6">
                        <Link href="/admin/locations" className="p-3 rounded-xl bg-slate-900 border border-white/10 hover:border-white/20 transition-all">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </Link>
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Kategori Proyek</h1>
                            <p className="text-slate-500 text-sm mt-1 font-medium tracking-wide">Kelola jenis kategori tayangan dan icon aplikasi</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { if (showForm) handleReset(); else setShowForm(true); }}
                        className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 text-sm uppercase tracking-widest ${showForm ? 'bg-slate-800 text-slate-400 border border-white/5' : 'bg-yellow-500 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.3)] hover:-translate-y-1'}`}
                    >
                        {showForm ? 'Batal' : <><Plus className="w-5 h-5" /> Tambah Kategori</>}
                    </button>
                </header>

                {showForm && (
                    <div className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 mb-12 shadow-2xl overflow-hidden relative group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[100px] pointer-events-none" />

                        <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                            {/* Section 1: Informasi Dasar */}
                            <div>
                                <SectionHeader icon={Info} title="Informasi Dasar" color="text-blue-500" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Kategori *</label>
                                        <input required type="text" value={formData.name} onChange={handleNameChange} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="Contoh: Sekolah Dasar" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">URL Identifier *</label>
                                        <div className="relative">
                                            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                            <input required type="text" value={formData.identifier} onChange={e => setFormData({ ...formData, identifier: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-yellow-500/50 outline-none transition-all" placeholder="sekolah-dasar" />
                                        </div>
                                        <p className="text-[10px] text-slate-600 ml-1">Gunakan huruf kecil, angka, dan strip (-). Contoh: rsud-baru</p>
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Deskripsi *</label>
                                        <textarea required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/50 outline-none transition-all" rows={3} placeholder="Penjelasan mengenai kategori ini..." />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Tampilan Visual */}
                            <div>
                                <SectionHeader icon={Palette} title="Tampilan Visual" color="text-yellow-500" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                                    {/* Icon Picker */}
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Pilih Icon *</label>
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                            {AVAILABLE_ICONS.map(iconName => {
                                                const IconComp = (LucideIcons as any)[iconName];
                                                const isSelected = formData.icon === iconName;
                                                return (
                                                    <button
                                                        key={iconName}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, icon: iconName })}
                                                        className={`p-4 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-yellow-500 text-slate-900 shadow-[0_0_15px_rgba(234,179,8,0.3)] ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-950 scale-110 z-10' : 'bg-black/50 text-slate-400 hover:bg-slate-800 hover:text-white border border-white/10'}`}
                                                        title={iconName}
                                                    >
                                                        {IconComp && <IconComp className="w-6 h-6" />}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Color Picker */}
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Mode Warna Kategori *</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {AVAILABLE_COLORS.map(color => {
                                                const isSelected = formData.color === color.value;
                                                return (
                                                    <button
                                                        key={color.value}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, color: color.value })}
                                                        className={`p-4 rounded-xl flex items-center gap-3 transition-all text-left ${isSelected ? 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-slate-950 bg-slate-800' : 'bg-black/50 hover:bg-slate-800 border border-white/10'}`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg shadow-inner ${color.class}`} />
                                                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>{color.label}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Live Preview */}
                                    <div className="md:col-span-2 mt-4 p-8 bg-black/30 rounded-2xl border border-white/5 flex flex-col items-center justify-center">
                                        <label className="text-[10px] font-bold text-slate-600 uppercase mb-6 tracking-widest">— Live Preview Card —</label>

                                        <div className={`w-[280px] h-[320px] rounded-[30px] p-1 bg-gradient-to-br border border-white/10 shadow-2xl flex flex-col justify-end text-left overflow-hidden relative group/preview ${formData.color}`}>
                                            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay"></div>
                                            <div className="absolute top-6 left-6 p-4 rounded-2xl bg-white/20 backdrop-blur-md shadow-lg border border-white/30">
                                                {formData.icon && (LucideIcons as any)[formData.icon] &&
                                                    (() => { const PreviewIcon = (LucideIcons as any)[formData.icon]; return <PreviewIcon className="w-8 h-8 text-white stroke-[2.5]" />; })()
                                                }
                                            </div>
                                            <div className="p-8 pb-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-32">
                                                <h2 className="text-3xl font-black text-white tracking-tighter mb-2 italic">
                                                    {formData.name || 'Nama Kategori'}
                                                </h2>
                                                <p className="text-white/80 text-sm font-medium leading-relaxed line-clamp-2">
                                                    {formData.description || 'Deskripsi kategori akan tampil di sini'}
                                                </p>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4 pt-6 border-t border-white/5">
                                <button type="submit" disabled={isSubmitting} className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(234,179,8,0.2)] hover:shadow-[0_0_30px_rgba(234,179,8,0.4)] flex items-center justify-center gap-2 uppercase tracking-wider text-sm disabled:opacity-50">
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    Simpan Kategori
                                </button>
                                <button type="button" onClick={handleReset} className="px-6 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all flex items-center justify-center border border-white/10 group">
                                    <RotateCcw className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Categories List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {categories.map((cat) => {
                        const IconComp = (LucideIcons as any)[cat.icon] || LayoutGrid;

                        return (
                            <div key={cat._id} className="group relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 hover:bg-slate-800/80 transition-all hover:border-white/20 hover:shadow-2xl overflow-hidden flex flex-col h-[280px]">
                                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${cat.color} opacity-20 blur-3xl pointer-events-none group-hover:opacity-40 transition-opacity duration-500`} />

                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${cat.color} text-white shadow-lg`}>
                                        <IconComp className="w-6 h-6" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleEdit(cat)} className="p-2.5 bg-black/40 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 rounded-xl transition-all border border-white/5 hover:border-blue-500/30">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(cat._id, cat.name)} className="p-2.5 bg-black/40 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all border border-white/5 hover:border-red-500/30">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-auto relative z-10">
                                    <h3 className="text-xl font-black text-white italic mb-1 uppercase tracking-wider">{cat.name}</h3>
                                    <p className="text-xs font-mono text-slate-500 mb-3 bg-black/30 w-fit px-2 py-1 rounded-md border border-white/5">/{cat.identifier}</p>
                                    <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">{cat.description}</p>
                                </div>
                            </div>
                        );
                    })}

                    {categories.length === 0 && !loading && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/10 rounded-3xl bg-slate-900/20">
                            <Tags className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-bold tracking-widest uppercase">Belum ada Kategori</p>
                            <p className="text-sm mt-2 opacity-60">Tambahkan kategori proyek pertama Anda di atas</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
