"use client";

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { Trash2, Plus, Monitor, Loader2, Pencil, X, Check, Camera, ShieldCheck, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ICameraData } from '@/models/Camera';

const schema = z.object({
    name: z.string().min(1, "Nama tidak boleh kosong"),
    streamUrl: z.string().min(1, "URL tidak boleh kosong").url("Harus berupa URL yang valid"),
});

type FormData = z.infer<typeof schema>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// ── Reusable Field component ──────────────────────────────────────────────────
function Field({ label, icon, error, children }: {
    label: string; icon?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
    return (
        <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 mb-1.5 block">{label}</label>
            <div className="relative">
                {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
                {children}
            </div>
            {error && <p className="text-red-400 text-[11px] font-medium mt-1.5 ml-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = false) =>
    `w-full bg-black/40 border border-white/10 rounded-xl ${hasIcon ? 'py-3.5 pl-11 pr-4' : 'p-4'} text-sm text-white focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-600`;

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
    camera,
    onClose,
}: {
    camera: ICameraData;
    onClose: () => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { name: camera.name, streamUrl: camera.streamUrl },
    });

    const onSubmit = async (data: FormData) => {
        setIsSaving(true);
        try {
            await axios.put(`/api/cameras/${camera._id}`, data);
            toast.success('Kamera berhasil diperbarui');
            mutate('/api/cameras');
            onClose();
        } catch {
            toast.error('Gagal memperbarui kamera');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" 
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 24 }}
                    className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-3xl w-full max-w-lg shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Background decoration */}
                    <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none" />
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-8 pt-6 pb-5 border-b border-white/5 relative z-10">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white">
                            <div className="p-2 rounded-xl bg-yellow-500/10">
                                <Pencil className="w-5 h-5 text-yellow-500" />
                            </div>
                            Edit Kamera
                        </h2>
                        <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-6 relative z-10">
                        <Field label="Nama Perangkat CCTV" error={errors.name?.message}>
                            <input {...register('name')} className={inputCls()} placeholder="Contoh: Gerbang Utama" />
                        </Field>

                        <Field label="Stream URL (RTSP / HLS)" error={errors.streamUrl?.message}>
                            <input {...register('streamUrl')} className={inputCls()} placeholder="rtsp://admin:pass@ip:port/stream" />
                        </Field>

                        <div className="flex gap-4 pt-4 border-t border-white/5 mt-6">
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-4 rounded-xl border border-white/10 text-slate-400 font-bold hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-wider"
                            >
                                Batal
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                type="submit"
                                disabled={isSaving}
                                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Simpan</>}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
    const { data, isLoading } = useSWR('/api/cameras', fetcher);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCamera, setEditingCamera] = useState<ICameraData | null>(null);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema)
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            await axios.post('/api/cameras', data);
            toast.success('Kamera berhasil ditambahkan');
            reset();
            mutate('/api/cameras');
        } catch {
            toast.error('Gagal menambahkan kamera');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Yakin ingin menghapus kamera "${name}"?`)) return;
        try {
            await axios.delete(`/api/cameras/${id}`);
            toast.success('Kamera dihapus');
            mutate('/api/cameras');
        } catch {
            toast.error('Gagal menghapus kamera');
        }
    };

    const cameras: ICameraData[] = data?.data || [];

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.08 }
        }
    };
    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans">
            {editingCamera && <EditModal camera={editingCamera} onClose={() => setEditingCamera(null)} />}

            <div className="max-w-6xl mx-auto">
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/5"
                >
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight uppercase flex items-center gap-4 text-white">
                            <div className="p-3 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl shadow-[0_8px_30px_rgba(37,99,235,0.3)] relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Camera className="w-8 h-8 text-white relative z-10" />
                            </div>
                            Kamera Terpusat
                        </h1>
                        <p className="text-slate-500 text-sm mt-3 font-medium tracking-wide">
                            Kelola alamat _stream_ (RTSP/HLS) perangkat CCTV sebelum dipasangkan ke dalam lokasi.
                        </p>
                    </div>
                </motion.header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Camera Form (Sticky Sidebar) */}
                    <div className="lg:col-span-1">
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 24 }}
                            className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-8 rounded-3xl sticky top-6 shadow-[0_30px_60px_rgba(0,0,0,0.4)] relative overflow-hidden group"
                        >
                            {/* Card Decoration */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[40px] pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-[30px] pointer-events-none" />
                            
                            <h2 className="text-lg font-bold mb-8 flex items-center gap-3 text-white uppercase tracking-wide">
                                <div className="p-2 rounded-xl bg-yellow-500/10">
                                    <Plus className="w-5 h-5 text-yellow-500" />
                                </div>
                                Daftarkan Kamera
                            </h2>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 relative z-10">
                                <Field label="Nama CCTV" error={errors.name?.message}>
                                    <input {...register('name')} className={inputCls()} placeholder="Contoh: Kamera Pos Satpam" />
                                </Field>
                                <Field label="Stream URL" error={errors.streamUrl?.message}>
                                    <input {...register('streamUrl')} className={inputCls()} placeholder="http://ip:port/stream.m3u8" />
                                </Field>
                                <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.97 }}
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-4 rounded-xl transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2 mt-4 uppercase text-sm tracking-wider"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Tambahkan Perangkat'}
                                </motion.button>
                            </form>
                        </motion.div>
                    </div>

                    {/* Camera List */}
                    <div className="lg:col-span-2 space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 mb-2 ml-1"
                        >
                            <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Monitor className="w-5 h-5 text-yellow-500" />
                                Kamera Aktif
                            </h2>
                            <span className="text-slate-900 bg-yellow-500 text-sm font-bold px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.3)]">{cameras.length}</span>
                        </motion.div>

                        {isLoading ? (
                            <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-yellow-500" />
                                <p className="uppercase tracking-wider font-bold text-sm">Sinkronisasi Data...</p>
                            </div>
                        ) : cameras.length === 0 ? (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center justify-center py-24 text-slate-600 border-2 border-dashed border-white/10 rounded-[2rem] bg-slate-900/20"
                            >
                                <ShieldCheck className="w-20 h-20 mb-4 opacity-10" />
                                <p className="font-bold text-lg uppercase tracking-wider opacity-30">Belum ada kamera</p>
                                <p className="text-sm mt-2 opacity-40 font-medium">Daftarkan URL streaming pertama Anda di panel samping</p>
                            </motion.div>
                        ) : (
                            <motion.div 
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show" 
                                className="grid gap-4"
                            >
                                {cameras.map((cam) => (
                                    <motion.div 
                                        variants={itemVariants}
                                        key={cam._id as string} 
                                        className="bg-slate-900/60 backdrop-blur-md border border-white/5 p-4 md:p-5 rounded-2xl hover:border-blue-500/30 hover:shadow-[0_20px_40px_rgba(37,99,235,0.08)] transition-all group overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 md:gap-5 min-w-0 flex-1">
                                                <div className="hidden md:flex w-16 h-12 flex-shrink-0 bg-black/50 rounded-xl border border-white/10 items-center justify-center text-slate-700 relative overflow-hidden group-hover:border-yellow-500/30 transition-colors">
                                                    <PlayCircle className="w-6 h-6 z-10" />
                                                    <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-bold text-white text-base md:text-lg tracking-tight truncate group-hover:text-blue-400 transition-colors">{cam.name}</h3>
                                                    <div className="flex items-center gap-2 mt-1 overflow-hidden">
                                                        <span className="text-[9px] font-bold bg-white/5 text-slate-400 px-2 py-0.5 rounded border border-white/5 uppercase tracking-wider shrink-0">HLS/RTSP</span>
                                                        <p className="text-slate-500 text-[10px] md:text-[11px] font-mono truncate">{cam.streamUrl}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => setEditingCamera(cam)}
                                                    className="p-2.5 md:p-3 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                                    title="Edit Data"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cam._id as string, cam.name)}
                                                    className="p-2.5 md:p-3 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                    title="Hapus Data"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
