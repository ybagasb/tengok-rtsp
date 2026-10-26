"use client";

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    Bell, Plus, Trash2, Save, Info, Lightbulb, AlertTriangle,
    ArrowUp, ArrowDown, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { PageHeader, LoadingState, useConfirm } from '@/components/admin/AdminUI';
import { getApiError } from '@/components/admin/shared';

type NoticeType = 'info' | 'tip' | 'warning';

interface Notice {
    id: string;
    type: NoticeType;
    title: string;
    message: string;
    enabled: boolean;
}

const TYPE_META: Record<NoticeType, { label: string; icon: typeof Info; color: string }> = {
    info: { label: 'Info', icon: Info, color: 'text-yellow-700 dark:text-yellow-500' },
    tip: { label: 'Tips', icon: Lightbulb, color: 'text-sky-700 dark:text-sky-400' },
    warning: { label: 'Peringatan', icon: AlertTriangle, color: 'text-rose-700 dark:text-rose-400' },
};

const newNotice = (): Notice => ({
    id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'info',
    title: '',
    message: '',
    enabled: true,
});

export default function NotificationsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const [autoDismissSec, setAutoDismissSec] = useState(8);
    const [notices, setNotices] = useState<Notice[]>([]);
    const { confirm, ConfirmDialog } = useConfirm();

    useEffect(() => {
        axios.get('/api/settings/notifications')
            .then(res => {
                const d = res.data?.data;
                if (d) {
                    setEnabled(d.enabled ?? true);
                    setAutoDismissSec(d.autoDismissSec ?? 8);
                    setNotices(Array.isArray(d.notices) ? d.notices : []);
                }
            })
            .catch(() => toast.error('Gagal memuat pengaturan notifikasi'))
            .finally(() => setLoading(false));
    }, []);

    const updateNotice = (id: string, patch: Partial<Notice>) => {
        setNotices(prev => prev.map(n => (n.id === id ? { ...n, ...patch } : n)));
    };

    const removeNotice = async (id: string) => {
        const ok = await confirm('Hapus notifikasi ini? Perubahan tersimpan setelah Anda klik Simpan.', {
            title: 'Hapus Notifikasi',
        });
        if (!ok) return;
        setNotices(prev => prev.filter(n => n.id !== id));
    };

    const move = (index: number, dir: -1 | 1) => {
        setNotices(prev => {
            const next = [...prev];
            const target = index + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const handleSave = async () => {
        // Basic validation: every notice needs a message.
        const invalid = notices.find(n => !n.message.trim());
        if (invalid) {
            toast.error('Setiap notifikasi harus punya isi pesan');
            return;
        }
        setSaving(true);
        try {
            await axios.put('/api/settings/notifications', { enabled, autoDismissSec, notices });
            toast.success('Pengaturan notifikasi tersimpan');
        } catch (err: unknown) {
            toast.error(getApiError(err) || 'Gagal menyimpan pengaturan');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-6 lg:p-10"><LoadingState message="Memuat pengaturan..." /></div>;

    return (
        <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            {ConfirmDialog}
            <PageHeader
                icon={Bell}
                title="Notifikasi"
                subtitle="Atur notifikasi informasi yang muncul di halaman peta CCTV"
                actions={
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 text-slate-950 font-bold text-sm shadow-lg hover:brightness-110 transition-all disabled:opacity-60"
                    >
                        {saving ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Save aria-hidden="true" className="w-4 h-4" />}
                        Simpan
                    </button>
                }
            />

            {/* Global settings */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-5"
            >
                <button
                    onClick={() => setEnabled(v => !v)}
                    aria-pressed={enabled}
                    className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                        enabled
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-black/[0.04] dark:bg-white/5 border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400'
                    }`}
                >
                    {enabled ? <Eye aria-hidden="true" className="w-4 h-4" /> : <EyeOff aria-hidden="true" className="w-4 h-4" />}
                    <span className="text-sm font-bold">{enabled ? 'Notifikasi Aktif' : 'Notifikasi Nonaktif'}</span>
                </button>

                <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="notif-auto-dismiss" className="text-sm font-medium text-slate-500 dark:text-slate-400">Tutup otomatis setelah</label>
                    <input
                        id="notif-auto-dismiss"
                        type="number"
                        min={0}
                        max={120}
                        value={autoDismissSec}
                        onChange={e => setAutoDismissSec(Math.max(0, Math.min(120, Number(e.target.value) || 0)))}
                        className="w-20 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm text-center focus:border-yellow-500/50 outline-none"
                    />
                    <span className="text-sm text-slate-500">detik (0 = manual)</span>
                </div>
            </motion.div>

            {/* Notice list */}
            <div className="space-y-4">
                {notices.length === 0 && (
                    <div className="text-center py-12 text-slate-500 border border-dashed border-black/10 dark:border-white/10 rounded-2xl">
                        Belum ada notifikasi. Tambahkan satu di bawah.
                    </div>
                )}

                {notices.map((notice, i) => {
                    const Meta = TYPE_META[notice.type];
                    const TypeIcon = Meta.icon;
                    return (
                        <motion.div
                            key={notice.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`bg-white/70 dark:bg-slate-900/60 border rounded-2xl p-5 ${notice.enabled ? 'border-black/10 dark:border-white/10' : 'border-black/5 dark:border-white/5 opacity-60'}`}
                        >
                            <div className="flex items-start gap-4">
                                <div className={`p-2 rounded-xl bg-black/[0.04] dark:bg-white/5 shrink-0 ${Meta.color}`}>
                                    <TypeIcon aria-hidden="true" className="w-5 h-5" />
                                </div>

                                <div className="flex-1 min-w-0 space-y-3">
                                    {/* Type + controls row */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {(Object.keys(TYPE_META) as NoticeType[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => updateNotice(notice.id, { type: t })}
                                                aria-pressed={notice.type === t}
                                                className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    notice.type === t
                                                        ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30'
                                                        : 'bg-black/[0.04] dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-transparent hover:text-slate-900 dark:hover:text-white'
                                                } min-h-10`}
                                            >
                                                {TYPE_META[t].label}
                                            </button>
                                        ))}

                                        <div className="ml-auto flex items-center gap-1">
                                            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Naik" aria-label={`Naikkan notifikasi ${i + 1}`}
                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-all min-w-11 min-h-11 inline-flex items-center justify-center">
                                                <ArrowUp aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            <button type="button" onClick={() => move(i, 1)} disabled={i === notices.length - 1} title="Turun" aria-label={`Turunkan notifikasi ${i + 1}`}
                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 transition-all min-w-11 min-h-11 inline-flex items-center justify-center">
                                                <ArrowDown aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => updateNotice(notice.id, { enabled: !notice.enabled })}
                                                title={notice.enabled ? 'Sembunyikan' : 'Tampilkan'}
                                                aria-label={notice.enabled ? `Sembunyikan notifikasi ${i + 1}` : `Tampilkan notifikasi ${i + 1}`}
                                                aria-pressed={notice.enabled}
                                                className={`focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg transition-all ${notice.enabled ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'} min-w-11 min-h-11 inline-flex items-center justify-center`}
                                            >
                                                {notice.enabled ? <Eye aria-hidden="true" className="w-4 h-4" /> : <EyeOff aria-hidden="true" className="w-4 h-4" />}
                                            </button>
                                            <button type="button" onClick={() => removeNotice(notice.id)} title="Hapus" aria-label={`Hapus notifikasi ${i + 1}`}
                                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none p-2 rounded-lg text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 transition-all min-w-11 min-h-11 inline-flex items-center justify-center">
                                                <Trash2 aria-hidden="true" className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <input
                                        value={notice.title}
                                        onChange={e => updateNotice(notice.id, { title: e.target.value })}
                                        placeholder="Judul (opsional)"
                                        aria-label={`Judul notifikasi ${i + 1}`}
                                        maxLength={120}
                                        className="w-full px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-bold focus:border-yellow-500/50 outline-none"
                                    />
                                    <textarea
                                        value={notice.message}
                                        onChange={e => updateNotice(notice.id, { message: e.target.value })}
                                        placeholder="Isi pesan notifikasi..."
                                        aria-label={`Isi pesan notifikasi ${i + 1}`}
                                        rows={2}
                                        maxLength={600}
                                        className="w-full px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm leading-relaxed focus:border-yellow-500/50 outline-none resize-y"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <button
                onClick={() => setNotices(prev => [...prev, newNotice()])}
                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none mt-4 w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-dashed border-black/15 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-yellow-500/40 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm font-bold"
            >
                <Plus aria-hidden="true" className="w-4 h-4" /> Tambah Notifikasi
            </button>
        </div>
    );
}
