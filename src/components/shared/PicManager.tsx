'use client';

import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import useSWR from 'swr';
import { AlertTriangle, Check, Loader2, Plus, User, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { swrFetcher } from '@/lib/swrFetcher';

export interface PicUser {
    cognitoSub: string;
    username: string;
    fullName: string | null;
    jobTitle: string | null;
    email: string | null;
}

interface PicResponse {
    success: boolean;
    data?: {
        picSubs?: string[];
        pics?: PicUser[];
    };
}

interface PicManagerProps {
    projectId: string;
    /** Opsional dipanggil setelah PIC berhasil ditambah atau dihapus. */
    onUpdated?: (picSubs: string[]) => void;
    className?: string;
}

/**
 * Panel pengelola PIC proyek (cognito_sub): menampilkan PIC aktif, menghapus PIC,
 * serta typeahead pencarian user SSO (/api/sso-users/search).
 * Dipakai di /project/[id] (Kelola Data > PIC Proyek) dan modal Atur PIC di /admin/locations.
 */
export default function PicManager({ projectId, onUpdated, className = '' }: PicManagerProps) {
    const { data, error, isLoading, mutate } = useSWR<PicResponse>(
        `/api/projects/${projectId}/pic`,
        swrFetcher,
        { revalidateOnFocus: false },
    );
    const picSubs = data?.data?.picSubs ?? [];
    const pics = data?.data?.pics ?? [];
    const [saving, setSaving] = useState(false);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PicUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length === 0) return;

        debounceRef.current = setTimeout(async () => {
            try {
                const res = await axios.get('/api/sso-users/search', {
                    params: { q: trimmed, limit: 20 },
                });
                if (res.data?.success) {
                    setResults(Array.isArray(res.data.data) ? res.data.data : []);
                    setSearchError(null);
                }
            } catch (err) {
                setResults([]);
                if (axios.isAxiosError(err) && err.response?.status === 503) {
                    setSearchError('Direktori user SSO sedang tidak tersedia; coba lagi nanti.');
                } else if (axios.isAxiosError(err) && err.response?.status === 403) {
                    setSearchError('Anda tidak memiliki izin mencari user SSO.');
                } else {
                    setSearchError('Gagal mencari user.');
                }
            } finally {
                setSearching(false);
            }
        }, 350);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const handleQueryChange = (val: string) => {
        setQuery(val);
        if (val.trim().length === 0) {
            setResults([]);
            setSearchError(null);
            setSearching(false);
        } else {
            setSearching(true);
            setSearchError(null);
        }
    };

    const nameFor = (sub: string) => {
        const p = pics.find((x) => x.cognitoSub === sub);
        if (p && (p.fullName || p.username)) return p.fullName || p.username;
        const m = /^ldap_(.+)$/.exec(sub);
        if (m) return m[1];
        return 'User (belum login)';
    };

    const persist = async (next: string[], extraPic?: PicUser) => {
        setSaving(true);
        const optimisticPics = extraPic && !pics.some((p) => p.cognitoSub === extraPic.cognitoSub)
            ? [...pics, extraPic]
            : pics;
        await mutate({ success: true, data: { picSubs: next, pics: optimisticPics } }, false);
        try {
            const res = await axios.patch(`/api/projects/${projectId}/pic`, { picSubs: next });
            const savedSubs = Array.isArray(res.data?.data?.picSubs) ? res.data.data.picSubs : next;
            toast.success('PIC proyek diperbarui');
            onUpdated?.(savedSubs);
            await mutate();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
            toast.error(msg || 'Gagal menyimpan PIC');
            await mutate();
        } finally {
            setSaving(false);
        }
    };

    const addPic = async (u: PicUser) => {
        if (picSubs.includes(u.cognitoSub)) {
            handleQueryChange('');
            return;
        }
        const next = [...picSubs, u.cognitoSub];
        handleQueryChange('');
        await persist(next, u);
    };

    const removePic = async (sub: string) => {
        const next = picSubs.filter((s) => s !== sub);
        await persist(next);
    };

    return (
        <div
            className={`p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 ${className}`}
        >
            <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    PIC Proyek
                </h3>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 ml-1" aria-hidden="true" />}
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
                PIC dapat mengedit data proyek ini. Dapat ditetapkan oleh super-admin atau admin divisi.
            </p>

            {isLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Memuat PIC...
                </div>
            ) : error ? (
                <div role="alert" className="flex items-center justify-between gap-2 text-xs text-rose-600 dark:text-rose-400 py-2">
                    <span className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> Gagal memuat PIC proyek.
                    </span>
                    <button
                        type="button"
                        onClick={() => mutate()}
                        className="underline font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded"
                    >
                        Coba lagi
                    </button>
                </div>
            ) : (
                <>
                    {/* Chips PIC saat ini */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {picSubs.length === 0 && (
                            <span className="text-xs text-slate-500">
                                Belum ada PIC. Proyek ini hanya dapat diedit super-admin atau admin divisi.
                            </span>
                        )}
                        {picSubs.map((sub) => (
                            <span
                                key={sub}
                                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-bold text-amber-700 dark:text-amber-300"
                            >
                                {nameFor(sub)}
                                <button
                                    type="button"
                                    onClick={() => removePic(sub)}
                                    disabled={saving}
                                    className="w-6 h-6 min-w-6 rounded-full bg-black/5 dark:bg-white/10 hover:bg-rose-500/30 flex items-center justify-center transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    aria-label={`Hapus PIC ${nameFor(sub)}`}
                                >
                                    <X className="w-3 h-3" aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                    </div>

                    {/* Typeahead tambah PIC */}
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            aria-label="Cari user SSO untuk ditambahkan sebagai PIC"
                            placeholder="Cari nama atau username SSO untuk ditambahkan sebagai PIC..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white/80 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-amber-500/60 outline-none"
                        />
                    </div>

                    {searchError && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {searchError}
                        </div>
                    )}
                    {searching && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Mencari...
                        </div>
                    )}
                    {!searching && !searchError && results.length > 0 && (
                        <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                            {results.map((u) => {
                                const already = picSubs.includes(u.cognitoSub);
                                return (
                                    <button
                                        key={u.cognitoSub}
                                        type="button"
                                        onClick={() => addPic(u)}
                                        disabled={saving || already}
                                        className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-amber-500/10 border border-transparent hover:border-amber-500/25 transition-colors text-left disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                {u.fullName || u.username}
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate">
                                                @{u.username}
                                                {u.jobTitle ? ` · ${u.jobTitle}` : ''}
                                            </div>
                                        </div>
                                        {already ? (
                                            <Check className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                                        ) : (
                                            <Plus className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
