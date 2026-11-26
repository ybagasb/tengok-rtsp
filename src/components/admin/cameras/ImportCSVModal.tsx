"use client";

import { useState, useRef } from 'react';
import { mutate } from 'swr';
import axios from 'axios';
import { Upload, Download, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { inputCls, getApiError } from '@/components/admin/shared';
import { FormField } from '@/components/admin/AdminUI';
import { LocationOption, parseCsvLine, useEscapeClose } from './types';

function isValidStreamScheme(url: string): boolean {
    const u = url.trim().toLowerCase();
    return u.startsWith('rtsp://') || u.startsWith('rtsps://') || u.startsWith('http://') || u.startsWith('https://');
}

export function ImportCSVModal({
    locations,
    onClose,
}: {
    locations: LocationOption[];
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const [parsedData, setParsedData] = useState<Array<{ name: string; streamUrl: string }>>([]);
    const [skippedCount, setSkippedCount] = useState(0);
    const [fileName, setFileName] = useState('');
    const [targetLocationId, setTargetLocationId] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownloadTemplate = () => {
        const sampleCSV = `name,streamUrl\n"CCTV Gerbang 1",rtsp://admin:pass@192.168.1.100:554/stream1\n"CCTV Area Parkir",rtsp://admin:pass@192.168.1.101:554/live\n"CCTV Lobi Utama",https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;
        const blob = new Blob([sampleCSV], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template-import-kamera-tengok.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (!text) return;

            const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length < 2) {
                toast.error('File CSV kosong atau tidak memiliki baris data');
                return;
            }

            const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
            const nameIdx = header.indexOf('name') !== -1 ? header.indexOf('name') : 0;
            const urlIdx = header.indexOf('streamurl') !== -1 ? header.indexOf('streamurl') : (header.indexOf('url') !== -1 ? header.indexOf('url') : 1);

            const items: Array<{ name: string; streamUrl: string }> = [];
            let skipped = 0;
            for (let i = 1; i < lines.length; i++) {
                const parts = parseCsvLine(lines[i]);
                const name = parts[nameIdx]?.trim();
                const streamUrl = parts[urlIdx]?.trim();
                if (name && streamUrl && isValidStreamScheme(streamUrl)) {
                    items.push({ name, streamUrl });
                } else {
                    skipped++;
                }
            }

            setParsedData(items);
            setSkippedCount(skipped);
            if (items.length === 0) {
                toast.error('Tidak ada data valid (URL harus rtsp:// atau http(s)://)');
            } else {
                toast.success(`Ditemukan ${items.length} data kamera valid`);
            }
        };
        reader.readAsText(file);
    };

    const handleImportSubmit = async () => {
        if (parsedData.length === 0) {
            toast.error('Pilih file CSV dengan data kamera valid');
            return;
        }

        setIsUploading(true);
        try {
            const res = await axios.post('/api/cameras/bulk', {
                cameras: parsedData,
                ...(targetLocationId ? { locationId: targetLocationId } : {}),
            });
            if (res.data.success) {
                toast.success(`Berhasil mengimpor ${res.data.count} kamera!`);
                mutate('/api/cameras?includeStreamUrl=1&scope=admin');
                mutate('/api/locations?scope=admin');
                onClose();
            }
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal mengimpor data massal');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Import kamera dari CSV"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-xl shadow-[0_30px_60px_rgba(15,23,42,0.25)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] max-h-[92dvh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-black/10 dark:border-white/10">
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                        <Upload aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" />
                        Import Kamera dari CSV
                    </h3>
                    <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        <X aria-hidden="true" className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                        <div>
                            <h4 className="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider">Format CSV</h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Kolom wajib: <code className="text-slate-900 dark:text-white font-mono">name,streamUrl</code></p>
                        </div>
                        <button
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-yellow-400 transition-colors min-h-11"
                        >
                            <Download aria-hidden="true" className="w-3.5 h-3.5" /> Template
                        </button>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                        role="button"
                        tabIndex={0}
                        aria-label="Pilih file CSV untuk diimpor"
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none border-2 border-dashed border-black/15 dark:border-white/15 hover:border-yellow-500/50 rounded-2xl p-7 text-center cursor-pointer transition-colors bg-white/60 dark:bg-slate-950/40 group"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden"
                            aria-hidden="true"
                            tabIndex={-1}
                        />
                        <Upload aria-hidden="true" className="w-8 h-8 text-slate-500 group-hover:text-yellow-700 dark:group-hover:text-yellow-500 mx-auto mb-3 transition-colors" />
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{fileName || 'Klik atau tarik file CSV ke sini'}</p>
                        <p className="text-xs text-slate-500 mt-1">Mendukung format file .csv UTF-8</p>
                    </div>

                    <FormField label="Langsung Tautkan ke Lokasi Proyek (Opsional)">
                        <select
                            value={targetLocationId}
                            onChange={(e) => setTargetLocationId(e.target.value)}
                            className={inputCls()}
                        >
                            <option value="">— Jangan tautkan dulu —</option>
                            {locations.map((loc) => (
                                <option key={loc._id} value={loc._id}>
                                    {loc.name} ({loc.category})
                                </option>
                            ))}
                        </select>
                    </FormField>

                    {skippedCount > 0 && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
                            <span>{skippedCount} baris dilewati karena nama kosong atau skema URL bukan rtsp:// / http(s)://.</span>
                        </div>
                    )}

                    {parsedData.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>Pratinjau Data ({parsedData.length} baris):</span>
                                <span className="text-emerald-700 dark:text-emerald-400">Valid</span>
                            </div>
                            <div className="max-h-40 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-950/60 p-2 space-y-1.5 custom-scrollbar">
                                {parsedData.slice(0, 10).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-black/[0.04] dark:bg-white/5 text-xs">
                                        <span className="font-bold text-slate-900 dark:text-white truncate max-w-[40%] shrink-0">{item.name}</span>
                                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 ml-2">{item.streamUrl}</span>
                                    </div>
                                ))}
                                {parsedData.length > 10 && (
                                    <p className="text-center text-[11px] text-slate-500 py-1">...dan {parsedData.length - 10} kamera lainnya</p>
                                )}
                            </div>
                        </div>
                    )}
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
                        onClick={handleImportSubmit}
                        disabled={isUploading || parsedData.length === 0}
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <><Check aria-hidden="true" className="w-4 h-4" /> Import Sekarang</>}
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}
