"use client";

import { useState, useMemo } from 'react';
import { mutate } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import {
    Plus, Pencil, X, Check, Loader2, Activity, AlertTriangle, MapPin, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import type { ICameraData } from '@/models/Camera';
import { inputCls, selectCls, getApiError, getErrorMessage } from '@/components/admin/shared';
import { FormField } from '@/components/admin/AdminUI';
import { LocationOption, useEscapeClose } from './types';

const schema = z.object({
    name: z.string().min(1, 'Nama tidak boleh kosong'),
    streamUrl: z.string().min(1, 'URL tidak boleh kosong'),
    division: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function CameraFormModal({
    camera,
    locations,
    initialLocationIds,
    isSuperAdmin,
    callerDivisi,
    onClose,
}: {
    camera?: ICameraData | null;
    locations: LocationOption[];
    initialLocationIds?: string[];
    isSuperAdmin: boolean;
    callerDivisi: string | null;
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const isEdit = !!camera;
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(initialLocationIds || []);
    const [locQuery, setLocQuery] = useState('');

    const { register, handleSubmit, getValues, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: camera?.name || '',
            streamUrl: camera?.streamUrl || '',
            division: (!isSuperAdmin && callerDivisi) ? callerDivisi : (camera?.division || ''),
        },
    });

    // eslint-disable-next-line react-hooks/incompatible-library
    const selectedDivision = watch('division');

    // Untuk superadmin yang memilih divisi spesifik, prioritaskan/filter opsi lokasi
    // agar mudah menemukan proyek di divisi tersebut (namun lokasi yang sudah terpilih tetap tampil).
    const filteredLocations = useMemo(() => {
        const q = locQuery.trim().toLowerCase();
        return locations.filter((loc) => {
            if (isSuperAdmin && selectedDivision && loc.division && loc.division !== selectedDivision && !selectedLocationIds.includes(loc._id)) {
                return false;
            }
            if (!q) return true;
            return loc.name.toLowerCase().includes(q) || loc.category.toLowerCase().includes(q);
        });
    }, [locations, locQuery, isSuperAdmin, selectedDivision, selectedLocationIds]);

    const toggleLocation = (id: string) => {
        setSelectedLocationIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const handleTestStream = async () => {
        const streamUrlValue = getValues('streamUrl');
        if (!streamUrlValue?.trim()) {
            toast.error('Ketik Stream URL terlebih dahulu');
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const res = await axios.post('/api/cameras/test-stream', { streamUrl: streamUrlValue.trim() });
            if (res.data.success) {
                setTestResult({
                    success: true,
                    message: `Stream Terhubung: ${res.data.codec || 'OK'}`,
                });
                toast.success('Stream RTSP berhasil terhubung!');
            } else {
                setTestResult({
                    success: false,
                    message: res.data.error || 'Gagal membaca stream',
                });
                toast.error('Stream RTSP tidak dapat dijangkau');
            }
        } catch (err: unknown) {
            setTestResult({
                success: false,
                message: getApiError(err) || getErrorMessage(err) || 'Error saat testing stream',
            });
            toast.error('Gagal menguji koneksi stream');
        } finally {
            setIsTesting(false);
        }
    };

    const onSubmit = async (data: FormData) => {
        setIsSaving(true);
        try {
            const payload = {
                name: data.name,
                streamUrl: data.streamUrl,
                division: !isSuperAdmin && callerDivisi ? callerDivisi : (data.division || null),
                locationIds: selectedLocationIds,
            };
            if (isEdit && camera?._id) {
                await axios.put(`/api/cameras/${camera._id}`, payload);
                toast.success('Kamera berhasil diperbarui');
            } else {
                await axios.post('/api/cameras', payload);
                toast.success(
                    selectedLocationIds.length > 0
                        ? `Kamera didaftarkan & ditautkan ke ${selectedLocationIds.length} lokasi`
                        : 'Kamera baru berhasil didaftarkan',
                );
            }
            mutate('/api/cameras?includeStreamUrl=1&scope=admin');
            mutate('/api/locations?scope=admin');
            onClose();
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal menyimpan data kamera');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Form kamera"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-xl shadow-[0_30px_60px_rgba(15,23,42,0.25)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] max-h-[92dvh] overflow-y-auto relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-yellow-500/20 rounded-full blur-[80px] pointer-events-none" />

                <div className="flex items-center justify-between px-5 sm:px-8 pt-6 pb-5 border-b border-black/5 dark:border-white/5 relative z-10">
                    <h2 className="text-xl font-bold flex items-center gap-3 text-slate-900 dark:text-white">
                        <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                            {isEdit ? <Pencil aria-hidden="true" className="w-5 h-5" /> : <Plus aria-hidden="true" className="w-5 h-5" />}
                        </div>
                        {isEdit ? 'Edit Kamera' : 'Daftarkan Kamera Baru'}
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <X aria-hidden="true" className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="p-5 sm:p-8 space-y-5 relative z-10">
                    <FormField label="Nama Perangkat CCTV" required error={errors.name?.message}>
                        <input
                            {...register('name')}
                            className={inputCls()}
                            placeholder="Contoh: CCTV Gerbang Tol Utama"
                        />
                    </FormField>

                    <FormField label="Stream URL (RTSP / HLS)" required error={errors.streamUrl?.message}>
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    {...register('streamUrl')}
                                    aria-label="Stream URL (RTSP / HLS)"
                                    className={`flex-1 min-w-0 ${inputCls()}`}
                                    placeholder="rtsp://admin:pass@ip:port/stream"
                                />
                                <button
                                    type="button"
                                    onClick={handleTestStream}
                                    disabled={isTesting}
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 min-h-11 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
                                    title="Uji jangkauan stream dengan FFprobe"
                                >
                                    {isTesting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-yellow-700 dark:text-yellow-500" /> : <Activity aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" />}
                                    Test
                                </button>
                            </div>

                            {testResult && (
                                <motion.div
                                    role="status"
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 font-medium ${
                                        testResult.success
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                                    }`}
                                >
                                    {testResult.success ? <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" /> : <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 text-rose-700 dark:text-rose-400" />}
                                    <span>{testResult.message}</span>
                                </motion.div>
                            )}
                        </div>
                    </FormField>

                    <FormField label="Divisi">
                        <select
                            {...register('division')}
                            disabled={!isSuperAdmin && Boolean(callerDivisi)}
                            className={`${selectCls} disabled:opacity-70 disabled:cursor-not-allowed`}
                        >
                            <option value="">— Umum / Semua Divisi —</option>
                            <option value="DIVISI 1">DIVISI 1</option>
                            <option value="DIVISI 2">DIVISI 2</option>
                            <option value="DIVISI 3">DIVISI 3</option>
                        </select>
                    </FormField>

                    {/* Penugasan Lokasi Proyek Langsung */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                                <MapPin aria-hidden="true" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                Tautkan ke Lokasi Proyek ({selectedLocationIds.length} dipilih)
                            </span>
                            {selectedLocationIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedLocationIds([])}
                                    className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                                >
                                    Lepas Semua
                                </button>
                            )}
                        </div>

                        <div className="relative">
                            <Search aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={locQuery}
                                onChange={(e) => setLocQuery(e.target.value)}
                                placeholder="Cari lokasi proyek..."
                                aria-label="Cari lokasi proyek untuk ditautkan"
                                className="w-full pl-8 pr-3 py-2 rounded-xl bg-black/[0.03] dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-xs text-slate-900 dark:text-white outline-none focus:border-yellow-500/50"
                            />
                        </div>

                        <div className="max-h-40 overflow-y-auto rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-slate-950/50 p-2 space-y-1 custom-scrollbar">
                            {filteredLocations.length === 0 ? (
                                <p className="text-xs text-slate-500 text-center py-4">Tidak ada lokasi proyek yang cocok.</p>
                            ) : (
                                filteredLocations.map((loc) => {
                                    const checked = selectedLocationIds.includes(loc._id);
                                    return (
                                        <label
                                            key={loc._id}
                                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl cursor-pointer text-xs transition-colors border ${
                                                checked
                                                    ? 'bg-yellow-500/10 border-yellow-500/30 text-slate-900 dark:text-white font-semibold'
                                                    : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleLocation(loc._id)}
                                                    className="w-4 h-4 accent-yellow-500 rounded shrink-0"
                                                />
                                                <span className="truncate">{loc.name}</span>
                                            </div>
                                            <span className="text-[10px] font-mono uppercase text-slate-500 shrink-0">
                                                {loc.division ? `${loc.division} · ` : ''}{loc.category}
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-black/5 dark:border-white/5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-3.5 rounded-xl border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-wider"
                        >
                            Batal
                        </button>
                        <motion.button
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.97 }}
                            type="submit"
                            disabled={isSaving}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-3.5 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                        >
                            {isSaving ? <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin" /> : <><Check aria-hidden="true" className="w-5 h-5" /> {isEdit ? 'Perbarui' : 'Daftarkan'}</>}
                        </motion.button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
