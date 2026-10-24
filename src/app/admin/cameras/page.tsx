"use client";

import { useState, useMemo, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { 
    Trash2, Plus, Monitor, Loader2, Pencil, X, Check, Camera, 
    PlayCircle, ArrowUpAZ, ArrowDownAZ, Link, Wifi, WifiOff, 
    Upload, Download, CheckSquare, Square, 
    AlertTriangle, Radio, Activity, Copy, CheckCheck, FolderPlus, MapPin
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ICameraData } from '@/models/Camera';
import { containerVariants, itemVariants, inputCls, getApiError, getErrorMessage } from '@/components/admin/shared';
import { PageHeader, FormField, EmptyState, LoadingState, SearchBar, useConfirm } from '@/components/admin/AdminUI';
import OptimizedVideoPlayer from '@/components/OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { swrFetcher } from '@/lib/swrFetcher';
import { maskStreamUrl } from '@/lib/maskStreamUrl';

const schema = z.object({
    name: z.string().min(1, "Nama tidak boleh kosong"),
    streamUrl: z.string().min(1, "URL tidak boleh kosong"),
});

type FormData = z.infer<typeof schema>;
// Bentuk minimal data lokasi (hasil /api/locations) yang dipakai halaman ini
interface LocationOption {
    _id: string;
    name: string;
    category: string;
    cameras?: (string | { _id?: string })[];
}

// Escape menutup modal
function useEscapeClose(onClose: () => void) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
}

// ── Live Stream Preview Modal ────────────────────────────────────────────────
function LivePreviewModal({
    camera,
    onClose,
}: {
    camera: ICameraData;
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const streamManager = useStreamManager();
    const [copied, setCopied] = useState(false);

    const handleCopyUrl = () => {
        if (!camera.streamUrl) return;
        navigator.clipboard.writeText(camera.streamUrl);
        setCopied(true);
        toast.success('Stream URL disalin');
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                role="dialog"
 aria-modal="true"
 aria-label="Pratinjau live kamera"
 className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="bg-white dark:bg-slate-900 border border-black/10 dark:border-white/15 rounded-3xl w-full max-w-2xl shadow-[0_30px_70px_rgba(15,23,42,0.3)] dark:shadow-[0_30px_70px_rgba(0,0,0,0.8)] overflow-hidden relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Modal Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-950/60">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500">
                                <Radio aria-hidden="true" className="w-5 h-5 animate-pulse motion-reduce:animate-none" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-base">{camera.name}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                        camera.status === 'online' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                    }`}>
                                        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${camera.status === 'online' ? 'bg-emerald-400 animate-ping motion-reduce:animate-none' : 'bg-rose-400'}`} />
                                        {camera.status === 'online' ? 'LIVE' : 'OFFLINE'}
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">ID: {camera._id}</span>
                                </div>
                            </div>
                        </div>
                        <button 
                            type="button"
                            onClick={onClose} 
                            aria-label="Tutup pratinjau"
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                            <X aria-hidden="true" className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Video Player Frame */}
                    <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                        {camera._id ? (
                            <OptimizedVideoPlayer
                                cameraId={camera._id}
                                manager={streamManager}
                            />
                        ) : (
                            <div className="text-slate-500 text-xs">ID Kamera tidak valid</div>
                        )}
                    </div>

                    {/* Stream Diagnostics Footer */}
                    <div className="p-5 bg-white/80 dark:bg-slate-950/80 border-t border-black/10 dark:border-white/10 space-y-3">
                        <div>
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                <span>RTSP / HLS Stream URL:</span>
                                <button
                                    onClick={handleCopyUrl}
                                    type="button"
                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1 text-yellow-700 dark:text-yellow-500 hover:text-yellow-800 dark:hover:text-yellow-400 font-bold transition-colors"
                                >
                                    {copied ? <CheckCheck aria-hidden="true" className="w-3.5 h-3.5" /> : <Copy aria-hidden="true" className="w-3.5 h-3.5" />}
                                    {copied ? 'Tersalin' : 'Salin URL'}
                                </button>
                            </div>
                            <div className="p-2.5 rounded-xl bg-black/[0.04] dark:bg-black/60 border border-black/5 dark:border-white/5 font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all select-all">
                                {maskStreamUrl(camera.streamUrl) || 'URL tidak tersedia'}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Kata sandi disamarkan. Gunakan &quot;Salin URL&quot; untuk mengambil URL lengkap.</p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ── Add / Edit Camera Modal ──────────────────────────────────────────────────
function CameraFormModal({
    camera,
    onClose,
}: {
    camera?: ICameraData | null;
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const isEdit = !!camera;
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { 
            name: camera?.name || '', 
            streamUrl: camera?.streamUrl || '' 
        },
    });

    const streamUrlValue = watch('streamUrl');

    const handleTestStream = async () => {
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
            if (isEdit && camera?._id) {
                await axios.put(`/api/cameras/${camera._id}`, data);
                toast.success('Kamera berhasil diperbarui');
            } else {
                await axios.post('/api/cameras', data);
                toast.success('Kamera baru berhasil didaftarkan');
            }
            mutate('/api/cameras?includeStreamUrl=1');
            mutate('/api/locations');
            onClose();
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal menyimpan data kamera');
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
                    className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-[0_30px_60px_rgba(15,23,42,0.25)] dark:shadow-[0_30px_60px_rgba(0,0,0,0.6)] max-h-[92dvh] overflow-y-auto relative"
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
                        <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <X aria-hidden="true" className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="p-5 sm:p-8 space-y-6 relative z-10">
                        <FormField label="Nama Perangkat CCTV" error={errors.name?.message}>
                            <input 
                                {...register('name')} 
                                className={inputCls()} 
                                placeholder="Contoh: CCTV Gerbang Tol Utama" 
                            />
                        </FormField>

                        <div>
                            <FormField label="Stream URL (RTSP / HLS)" error={errors.streamUrl?.message}>
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
                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 min-h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
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
                        </div>

                        <div className="flex gap-4 pt-4 border-t border-black/5 dark:border-white/5 mt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-4 rounded-xl border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs uppercase tracking-wider"
                            >
                                Batal
                            </button>
                            <motion.button
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                type="submit"
                                disabled={isSaving}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex-1 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                            >
                                {isSaving ? <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin" /> : <><Check aria-hidden="true" className="w-5 h-5" /> {isEdit ? 'Perbarui' : 'Daftarkan'}</>}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ── Import CSV Modal ─────────────────────────────────────────────────────────
function ImportCSVModal({
    onClose,
}: {
    onClose: () => void;
}) {
    useEscapeClose(onClose);
    const [parsedData, setParsedData] = useState<Array<{ name: string; streamUrl: string }>>([]);
    const [fileName, setFileName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDownloadTemplate = () => {
        const sampleCSV = `name,streamUrl\nCCTV Gerbang 1,rtsp://admin:pass@192.168.1.100:554/stream1\nCCTV Area Parkir,rtsp://admin:pass@192.168.1.101:554/live\nCCTV Lobi Utama,https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`;
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

            const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const nameIdx = header.indexOf('name') !== -1 ? header.indexOf('name') : 0;
            const urlIdx = header.indexOf('streamurl') !== -1 ? header.indexOf('streamurl') : (header.indexOf('url') !== -1 ? header.indexOf('url') : 1);

            const items: Array<{ name: string; streamUrl: string }> = [];
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
                if (parts[nameIdx] && parts[urlIdx]) {
                    items.push({
                        name: parts[nameIdx],
                        streamUrl: parts[urlIdx],
                    });
                }
            }

            setParsedData(items);
            if (items.length === 0) {
                toast.error('Tidak ada data valid yang dapat diparsing dari CSV');
            } else {
                toast.success(`Ditemukan ${items.length} data kamera dari file`);
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
            const res = await axios.post('/api/cameras/bulk', { cameras: parsedData });
            if (res.data.success) {
                toast.success(`Berhasil mengimpor ${res.data.count} kamera!`);
                mutate('/api/cameras?includeStreamUrl=1');
                onClose();
            }
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal mengimpor data massal');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <AnimatePresence>
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
                        <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                            <X aria-hidden="true" className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Download Template Banner */}
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                            <div>
                                <h4 className="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider">Format CSV</h4>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Kolom wajib: <code className="text-slate-900 dark:text-white font-mono">name,streamUrl</code></p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDownloadTemplate}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-yellow-500 text-slate-950 text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-yellow-400 transition-colors min-h-10"
                            >
                                <Download aria-hidden="true" className="w-3.5 h-3.5" /> Template
                            </button>
                        </div>

                        {/* File Upload Box */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                            role="button"
                            tabIndex={0}
                            aria-label="Pilih file CSV untuk diimpor"
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none border-2 border-dashed border-black/15 dark:border-white/15 hover:border-yellow-500/50 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-white/60 dark:bg-slate-950/40 group"
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

                        {/* Preview Table */}
                        {parsedData.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                                    <span>Pratinjau Data ({parsedData.length} baris):</span>
                                    <span className="text-emerald-700 dark:text-emerald-400">Valid</span>
                                </div>
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-950/60 p-2 space-y-1.5 custom-scrollbar">
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
        </AnimatePresence>
    );
}

// ── Bulk Assign Modal ────────────────────────────────────────────────────────
function BulkAssignModal({
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
                mutate('/api/locations');
                mutate('/api/cameras?includeStreamUrl=1');
                onClose();
            }
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal memasangkan kamera');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
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
                        <button type="button" onClick={onClose} aria-label="Tutup dialog" className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
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
        </AnimatePresence>
    );
}

// ── Main Cameras Management Page ─────────────────────────────────────────────
export default function CamerasPage() {
    // Admin management needs streamUrl (cards, search, CSV export, edit form),
    // so it explicitly opts in — the API strips streamUrl by default.
    const { data: cameraData, isLoading: camerasLoading } = useSWR('/api/cameras?includeStreamUrl=1', swrFetcher);
    const { data: locationData } = useSWR('/api/locations', swrFetcher);

    const [editingCamera, setEditingCamera] = useState<ICameraData | null>(null);
    const [previewCamera, setPreviewCamera] = useState<ICameraData | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'url' | 'status'>('name-asc');
    const [filterCategory, setFilterCategory] = useState<'all' | 'online' | 'offline' | 'unassigned' | 'assigned'>('all');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isProbingBulk, setIsProbingBulk] = useState(false);

    const ITEMS_PER_PAGE = 8;
    const { confirm, ConfirmDialog } = useConfirm();

    const rawCameras = useMemo<ICameraData[]>(() => cameraData?.data || [], [cameraData]);
    const locations = useMemo<LocationOption[]>(() => locationData?.data || [], [locationData]);

    // Map each camera ID to its assigned locations
    const cameraToLocationMap = useMemo(() => {
        const map = new Map<string, { id: string; name: string; category: string }[]>();
        locations.forEach(loc => {
            if (Array.isArray(loc.cameras)) {
                loc.cameras.forEach((cam) => {
                    const cid = typeof cam === 'string' ? cam : cam._id;
                    if (cid) {
                        const existing = map.get(cid) || [];
                        existing.push({ id: loc._id, name: loc.name, category: loc.category });
                        map.set(cid, existing);
                    }
                });
            }
        });
        return map;
    }, [locations]);

    // Filter & Sort Cameras
    const filteredCameras = useMemo(() => {
        let result = [...rawCameras];

        // Filter by Status / Assignment
        if (filterCategory === 'online') {
            result = result.filter(c => c.status === 'online');
        } else if (filterCategory === 'offline') {
            result = result.filter(c => c.status === 'offline');
        } else if (filterCategory === 'unassigned') {
            result = result.filter(c => !cameraToLocationMap.has(c._id as string));
        } else if (filterCategory === 'assigned') {
            result = result.filter(c => cameraToLocationMap.has(c._id as string));
        }

        // Filter by Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c => {
                const assignedLocs = cameraToLocationMap.get(c._id as string) || [];
                const locNames = assignedLocs.map(l => l.name.toLowerCase()).join(' ');
                return (
                    c.name?.toLowerCase().includes(q) ||
                    c.streamUrl?.toLowerCase().includes(q) ||
                    locNames.includes(q)
                );
            });
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '');
            if (sortBy === 'url') return (a.streamUrl || '').localeCompare(b.streamUrl || '');
            if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
            return 0;
        });

        return result;
    }, [rawCameras, filterCategory, searchQuery, sortBy, cameraToLocationMap]);

    const totalPages = Math.ceil(filteredCameras.length / ITEMS_PER_PAGE) || 1;
    const paginatedCameras = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredCameras.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredCameras, currentPage]);

    // Counts for Filter Badges
    const onlineCount = rawCameras.filter(c => c.status === 'online').length;
    const offlineCount = rawCameras.filter(c => c.status === 'offline').length;
    const unassignedCount = rawCameras.filter(c => !cameraToLocationMap.has(c._id as string)).length;
    const assignedCount = rawCameras.length - unassignedCount;

    // Multi-select handlers
    const isAllSelected = paginatedCameras.length > 0 && paginatedCameras.every(c => selectedIds.includes(c._id as string));

    const handleSelectAll = () => {
        if (isAllSelected) {
            const pageIds = paginatedCameras.map(c => c._id as string);
            setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            const pageIds = paginatedCameras.map(c => c._id as string);
            setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Bulk Delete
    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const ok = await confirm(
            `Anda akan menghapus ${selectedIds.length} perangkat kamera secara permanen. Aksi ini tidak dapat dibatalkan.`,
            {
                title: `Hapus ${selectedIds.length} Kamera Terpilih?`,
                variant: 'danger',
            }
        );
        if (!ok) return;

        try {
            const res = await axios.delete('/api/cameras/bulk', { data: { cameraIds: selectedIds } });
            if (res.data.success) {
                toast.success(`${res.data.deletedCount} kamera berhasil dihapus`);
                setSelectedIds([]);
                mutate('/api/cameras?includeStreamUrl=1');
                mutate('/api/locations');
            }
        } catch {
            toast.error('Gagal menghapus kamera terpilih');
        }
    };

    // Bulk Probe / Re-check
    const handleBulkProbe = async () => {
        if (selectedIds.length === 0) return;
        setIsProbingBulk(true);
        try {
            await axios.post('/api/cameras/probe-now', { cameraIds: selectedIds });
            toast.success(`Memulai pengecekan status untuk ${selectedIds.length} kamera...`);
            setTimeout(() => {
                mutate('/api/cameras?includeStreamUrl=1');
                setIsProbingBulk(false);
            }, 3000);
        } catch {
            toast.error('Gagal memulai pengecekan status');
            setIsProbingBulk(false);
        }
    };

    // Export CSV
    const handleExportCSV = (exportSelectedOnly = false) => {
        const source = exportSelectedOnly 
            ? rawCameras.filter(c => selectedIds.includes(c._id as string)) 
            : filteredCameras;

        if (source.length === 0) {
            toast.error('Tidak ada data kamera untuk diexport');
            return;
        }

        const headers = ['ID', 'Nama Kamera', 'Stream URL', 'Status', 'Lokasi Terpasang'];
        const rows = source.map(c => {
            const locs = (cameraToLocationMap.get(c._id as string) || []).map(l => l.name).join('; ');
            return [
                `"${c._id}"`,
                `"${(c.name || '').replace(/"/g, '""')}"`,
                `"${(c.streamUrl || '').replace(/"/g, '""')}"`,
                `"${c.status}"`,
                `"${locs.replace(/"/g, '""') || 'Belum Terpasang'}"`
            ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kamera-tengok-${exportSelectedOnly ? 'terpilih-' : ''}${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('File CSV berhasil diunduh');
    };

    // Single Delete
    const handleDeleteSingle = async (id: string, name: string) => {
        const ok = await confirm(
            'Perangkat CCTV ini akan dihapus dari sistem dan dilepas dari seluruh lokasi.',
            {
                title: `Hapus Kamera "${name}"?`,
                variant: 'danger',
            }
        );
        if (!ok) return;

        try {
            await axios.delete(`/api/cameras/${id}`);
            toast.success('Kamera berhasil dihapus');
            mutate('/api/cameras?includeStreamUrl=1');
            mutate('/api/locations');
        } catch {
            toast.error('Gagal menghapus kamera');
        }
    };

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-36 font-sans">
            {ConfirmDialog}

            {/* Modals */}
            {previewCamera && (
                <LivePreviewModal 
                    camera={previewCamera} 
                    onClose={() => setPreviewCamera(null)} 
                />
            )}
            {editingCamera && (
                <CameraFormModal 
                    camera={editingCamera} 
                    onClose={() => setEditingCamera(null)} 
                />
            )}
            {showAddModal && (
                <CameraFormModal 
                    camera={null} 
                    onClose={() => setShowAddModal(false)} 
                />
            )}
            {showImportModal && (
                <ImportCSVModal 
                    onClose={() => setShowImportModal(false)} 
                />
            )}
            {showAssignModal && (
                <BulkAssignModal
                    cameraIds={selectedIds}
                    locations={locations}
                    onClose={() => {
                        setShowAssignModal(false);
                        setSelectedIds([]);
                    }}
                />
            )}

            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={Monitor}
                    title="Manajemen Kamera Terpusat"
                    subtitle="Daftarkan, uji streaming RTSP/HLS secara langsung, dan kelola penugasan kamera ke lokasi proyek."
                    actions={
                        <div className="flex flex-wrap items-center gap-2.5">
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleExportCSV(false)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider min-h-10"
                            >
                                <Download aria-hidden="true" className="w-4 h-4" /> Export CSV
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowImportModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400 transition-all text-xs font-bold uppercase tracking-wider min-h-10"
                            >
                                <Upload aria-hidden="true" className="w-4 h-4" /> Import CSV
                            </motion.button>
                            <motion.button
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setShowAddModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-slate-950 font-bold transition-all shadow-[0_4px_20px_rgba(234,179,8,0.4)] text-xs uppercase tracking-wider min-h-10"
                            >
                                <Plus aria-hidden="true" className="w-4 h-4" /> Tambah Kamera
                            </motion.button>
                        </div>
                    }
                />

                {/* Filter Tabs & Search Row */}
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-7">
                            <SearchBar
                                value={searchQuery}
                                onChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                placeholder="Cari nama CCTV, RTSP URL, atau lokasi proyek..."
                            />
                        </div>

                        {/* Sort Options */}
                        <div className="md:col-span-5 flex items-center justify-start md:justify-end gap-1">
                            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mr-1">Urutan:</span>
                            {([
                                { val: 'name-asc', icon: ArrowUpAZ, label: 'A-Z' },
                                { val: 'name-desc', icon: ArrowDownAZ, label: 'Z-A' },
                                { val: 'status', icon: Activity, label: 'Status' },
                                { val: 'url', icon: Link, label: 'URL' },
                            ] as const).map(({ val, icon: Icon, label }) => (
                                <button
                                    key={val}
                                    onClick={() => { setSortBy(val); setCurrentPage(1); }}
                                    aria-pressed={sortBy === val}
                                    aria-label={`Urutkan ${label}`}
                                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                        sortBy === val
                                            ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30'
                                            : 'bg-white/70 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-black/5 dark:border-white/5'
                                    } min-h-10`}
                                >
                                    <Icon aria-hidden="true" className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Filter Status / Assignment Buttons */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {([
                            { val: 'all', label: 'Semua Kamera', count: rawCameras.length },
                            { val: 'online', label: 'Online', count: onlineCount },
                            { val: 'offline', label: 'Offline', count: offlineCount },
                            { val: 'unassigned', label: 'Belum Terpasang', count: unassignedCount },
                            { val: 'assigned', label: 'Sudah Terpasang', count: assignedCount },
                        ] as const).map(({ val, label, count }) => (
                            <button
                                key={val}
                                onClick={() => { setFilterCategory(val); setCurrentPage(1); }}
                                aria-pressed={filterCategory === val}
                                className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0 border ${
                                    filterCategory === val
                                        ? val === 'online' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 shadow-sm'
                                        : val === 'offline' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 shadow-sm'
                                        : val === 'unassigned' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-sm'
                                        : 'bg-yellow-500 text-slate-950 border-yellow-500 shadow-sm'
                                        : 'bg-white/70 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-black/5 dark:border-white/5 hover:border-black/20 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white'
                                } min-h-10`}
                            >
                                {val === 'online' && <Wifi aria-hidden="true" className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />}
                                {val === 'offline' && <WifiOff aria-hidden="true" className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />}
                                {val === 'unassigned' && <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />}
                                {label}
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                                    filterCategory === val
                                        ? val === 'all' ? 'bg-black/[0.03] dark:bg-black/20 text-slate-950 font-bold' : 'bg-black/[0.06] dark:bg-white/10'
                                        : 'bg-black/[0.04] dark:bg-white/5 text-slate-500'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Camera List Content */}
                {camerasLoading ? (
                    <LoadingState />
                ) : filteredCameras.length === 0 ? (
                    <EmptyState
                        icon={Camera}
                        title={searchQuery ? 'Tidak ada kamera yang cocok' : 'Belum ada data kamera'}
                        subtitle={searchQuery ? 'Coba ubah kata kunci pencarian Anda' : 'Klik "Tambah Kamera" atau "Import CSV" untuk mendaftarkan URL streaming CCTV.'}
                    />
                ) : (
                    <div className="space-y-3">
                        {/* Select All Bar */}
                        <div className="flex items-center justify-between px-4 py-2 bg-white/60 dark:bg-slate-900/40 border border-black/5 dark:border-white/5 rounded-2xl text-xs">
                            <button
                                onClick={handleSelectAll}
                                aria-pressed={isAllSelected}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold transition-colors"
                            >
                                {isAllSelected ? <CheckSquare aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" /> : <Square aria-hidden="true" className="w-4 h-4 text-slate-500" />}
                                <span>Pilih Semua di Halaman Ini ({paginatedCameras.length})</span>
                            </button>
                            <span className="text-slate-500 text-[11px]">
                                Menampilkan {filteredCameras.length} kamera
                            </span>
                        </div>

                        {/* Cards Grid */}
                        <motion.div 
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            <AnimatePresence>
                                {paginatedCameras.map((cam) => {
                                    const isSelected = selectedIds.includes(cam._id as string);
                                    const assignedLocations = cameraToLocationMap.get(cam._id as string) || [];
                                    const isAssigned = assignedLocations.length > 0;

                                    return (
                                        <motion.div
                                            key={cam._id as string}
                                            variants={itemVariants}
                                            className={`bg-white/75 dark:bg-slate-900/70 backdrop-blur-xl border p-5 rounded-2xl transition-all relative overflow-hidden group ${
                                                isSelected 
                                                    ? 'border-yellow-500/50 bg-yellow-500/[0.04] shadow-[0_10px_30px_rgba(234,179,8,0.1)]' 
                                                    : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 hover:bg-white dark:hover:bg-slate-900/90'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3.5">
                                                {/* Selection Checkbox */}
                                                <button
                                                    onClick={() => handleToggleSelect(cam._id as string)}
                                                    className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none mt-1 text-slate-500 hover:text-yellow-800 dark:hover:text-yellow-400 transition-colors shrink-0"
                                                    aria-label={`Pilih kamera ${cam.name}`}
                                                    aria-pressed={isSelected}
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare aria-hidden="true" className="w-5 h-5 text-yellow-700 dark:text-yellow-500" />
                                                    ) : (
                                                        <Square aria-hidden="true" className="w-5 h-5" />
                                                    )}
                                                </button>

                                                {/* Camera Details */}
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-slate-900 dark:text-white text-base tracking-tight truncate group-hover:text-yellow-700 dark:group-hover:text-yellow-400 transition-colors">
                                                                    {cam.name}
                                                                </h3>
                                                                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                                                    cam.status === 'online' 
                                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' 
                                                                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                                                }`}>
                                                                    <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                                    {cam.status}
                                                                </span>
                                                            </div>

                                                            {/* Stream URL */}
                                                            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-1 select-all" title={maskStreamUrl(cam.streamUrl)}>
                                                                {maskStreamUrl(cam.streamUrl) || 'URL Kosong'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Location Badge */}
                                                    <div className="flex items-center gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                                                        {isAssigned ? (
                                                            <div className="flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 font-semibold truncate">
                                                                <MapPin aria-hidden="true" className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400 shrink-0" />
                                                                <span className="truncate">
                                                                    {assignedLocations.map(l => l.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400/90 font-medium">
                                                                <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                                                <span>Belum dipasangkan ke lokasi</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex items-center gap-2 pt-2">
                                                        <button
                                                            onClick={() => setPreviewCamera(cam)}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1 px-3 py-1.5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-bold transition-all min-h-10"
                                                            title="Buka Live Preview Modal"
                                                            aria-label={`Pratinjau live ${cam.name}`}
                                                        >
                                                            <PlayCircle aria-hidden="true" className="w-3.5 h-3.5" /> Preview
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingCamera(cam)}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all text-xs min-w-10 min-h-10 inline-flex items-center justify-center"
                                                            title="Edit Konfigurasi"
                                                            aria-label={`Edit kamera ${cam.name}`}
                                                        >
                                                            <Pencil aria-hidden="true" className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteSingle(cam._id as string, cam.name)}
                                                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 transition-all text-xs min-w-10 min-h-10 inline-flex items-center justify-center"
                                                            title="Hapus Kamera"
                                                            aria-label={`Hapus kamera ${cam.name}`}
                                                        >
                                                            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </motion.div>

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-black/5 dark:border-white/5 mt-6">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    Halaman <span className="text-slate-900 dark:text-white font-bold">{currentPage}</span> dari <span className="text-slate-900 dark:text-white font-bold">{totalPages}</span> (Total {filteredCameras.length} kamera)
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        aria-label="Halaman sebelumnya"
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all min-h-10"
                                    >
                                        ← Sebelumnya
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        aria-label="Halaman berikutnya"
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-4 py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all min-h-10"
                                    >
                                        Selanjutnya →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating Bulk Actions Bar */}
            <AnimatePresence>
                {selectedIds.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] sm:w-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-yellow-500/40 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.2)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] px-5 py-3.5 flex items-center gap-4 flex-wrap max-w-2xl"
                    >
                        <div role="status" className="flex items-center gap-2 pr-2 border-r border-black/10 dark:border-white/10">
                            <span aria-hidden="true" className="w-2 h-2 rounded-full bg-yellow-500 animate-ping motion-reduce:animate-none" />
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{selectedIds.length} Dipilih</span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handleBulkProbe}
                                disabled={isProbingBulk}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-bold transition-all disabled:opacity-50 min-h-10"
                            >
                                {isProbingBulk ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-yellow-700 dark:text-yellow-400" /> : <Activity aria-hidden="true" className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-400" />}
                                Cek Status
                            </button>

                            <button
                                onClick={() => setShowAssignModal(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-500/30 transition-all min-h-10"
                            >
                                <FolderPlus aria-hidden="true" className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                                Tautkan ke Lokasi
                            </button>

                            <button
                                onClick={() => handleExportCSV(true)}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.06] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-bold transition-all min-h-10"
                            >
                                <Download aria-hidden="true" className="w-3.5 h-3.5" /> CSV
                            </button>

                            <button
                                onClick={handleBulkDelete}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-500/30 transition-all min-h-10"
                            >
                                <Trash2 aria-hidden="true" className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" /> Hapus
                            </button>
                        </div>

                        <button
                            onClick={() => setSelectedIds([])}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white ml-auto min-w-10 min-h-10 inline-flex items-center justify-center"
                            title="Batal Pilih"
                            aria-label="Batalkan pilihan kamera"
                        >
                            <X aria-hidden="true" className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
