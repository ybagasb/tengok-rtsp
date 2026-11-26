"use client";

import { useState } from 'react';
import { mutate } from 'swr';
import axios from 'axios';
import { FolderPlus, X, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { inputCls, getApiError } from '@/components/admin/shared';
import { FormField } from '@/components/admin/AdminUI';
import { LocationOption, useEscapeClose } from './types';

export function BulkAssignModal({
    cameraIds,
    locations,
    onClose,
}: {
    cameraIds: string[];
    locations: LocationOption[];
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const [selectedLocationId, setSelectedLocationId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!selectedLocationId) {
            toast.error('Pilih lokasi tujuan terlebih dahulu');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await axios.patch('/api/cameras/bulk', {
                cameraIds,
                locationId: selectedLocationId,
            });
            if (res.data.success) {
                toast.success(res.data.message || 'Kamera berhasil dipasangkan ke lokasi');
                mutate('/api/locations?scope=admin');
                mutate('/api/cameras?includeStreamUrl=1&scope=admin');
                onClose();
            }
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal memasangkan kamera');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Tautkan kamera ke lokasi"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-md shadow-[0_30px_60px_rgba(15,23,42,0.25)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] max-h-[92dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-black/10 dark:border-white/10">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                        <FolderPlus aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" />
                        Tautkan ke Lokasi ({cameraIds.length} Kamera)
                    </h3>
                    <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        <X aria-hidden="true" className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Pilih lokasi proyek di mana {cameraIds.length} kamera yang dipilih akan dipasangkan:
                    </p>

                    <FormField label="Pilih Lokasi Tujuan">
                        <select
                            value={selectedLocationId}
                            onChange={e => setSelectedLocationId(e.target.value)}
                            className={inputCls()}
                        >
                            <option value="">-- Pilih Lokasi Proyek --</option>
                            {locations.map(loc => (
                                <option key={loc._id} value={loc._id}>
                                    {loc.name} ({loc.category})
                                </option>
                            ))}
                        </select>
                    </FormField>
                </div>

                <div className="flex gap-3 p-6 border-t border-black/10 dark:border-white/10 bg-white/60 dark:bg-slate-950/40">
                    <button
                        type="button"
                        onClick={onClose}
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-3 rounded-xl border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white text-xs uppercase tracking-wider"
                    >
                        Batal
                    </button>
                    <motion.button
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSubmit}
                        disabled={isSubmitting || !selectedLocationId}
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <><Check aria-hidden="true" className="w-4 h-4" /> Pasangkan</>}
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}
