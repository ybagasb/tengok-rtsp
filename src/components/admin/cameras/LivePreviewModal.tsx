"use client";

import { useState } from 'react';
import { Radio, X, Copy, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import type { ICameraData } from '@/models/Camera';
import OptimizedVideoPlayer from '@/components/OptimizedVideoPlayer';
import { useStreamManager } from '@/lib/StreamManager';
import { maskStreamUrl } from '@/lib/maskStreamUrl';
import { useEscapeClose } from './types';

export function LivePreviewModal({
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
                <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-950/60">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 shrink-0">
                            <Radio aria-hidden="true" className="w-5 h-5 animate-pulse motion-reduce:animate-none" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{camera.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                    camera.status === 'online' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                }`}>
                                    <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${camera.status === 'online' ? 'bg-emerald-400 animate-ping motion-reduce:animate-none' : 'bg-rose-400'}`} />
                                    {camera.status === 'online' ? 'LIVE' : 'OFFLINE'}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">ID: {camera._id}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup pratinjau"
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
                    >
                        <X aria-hidden="true" className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                    {camera._id ? (
                        <OptimizedVideoPlayer cameraId={camera._id} manager={streamManager} />
                    ) : (
                        <div className="text-slate-500 text-xs">ID Kamera tidak valid</div>
                    )}
                </div>

                <div className="p-5 bg-white/80 dark:bg-slate-950/80 border-t border-black/10 dark:border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Kata sandi disamarkan. Gunakan &quot;Salin URL&quot; untuk mengambil URL lengkap.</p>
                </div>
            </motion.div>
        </motion.div>
    );
}
