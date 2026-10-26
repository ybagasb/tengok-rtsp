"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    ShieldCheck, Search, UserPlus, Trash2, Loader2, Lock, AlertTriangle, X,
} from 'lucide-react';
import { PageHeader, LoadingState, EmptyState, useConfirm } from '@/components/admin/AdminUI';

interface AdminRow {
    cognitoSub: string;
    username: string;
    fullName: string | null;
    jobTitle: string | null;
    isBootstrap: boolean;
    removable: boolean;
    createdBy?: string;
    createdAt?: string;
}

interface SsoUser {
    cognitoSub: string;
    username: string;
    fullName: string | null;
    email: string | null;
    jobTitle: string | null;
    branchName: string | null;
    status: string;
}

// Nama tampil ramah. UUID mentah tidak berguna bagi admin; bila belum dikenali
// (belum pernah login & tak ada di direktori SSO) tampilkan label netral.
function adminLabel(a: Pick<AdminRow, 'fullName' | 'username'>): string {
    return a.fullName || a.username || 'Pengguna belum dikenali (belum pernah login)';
}

export default function RolesPage() {
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [admins, setAdmins] = useState<AdminRow[]>([]);
    const { confirm, ConfirmDialog } = useConfirm();

    // Typeahead state
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SsoUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadAdmins = useCallback(async () => {
        try {
            const res = await axios.get('/api/admin/roles');
            if (res.data?.success) {
                setAdmins(Array.isArray(res.data.data?.admins) ? res.data.data.admins : []);
                setForbidden(false);
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 403) {
                setForbidden(true);
            } else {
                toast.error('Gagal memuat daftar super-admin');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAdmins(); }, [loadAdmins]);

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (query.trim().length === 0) {
            setResults([]);
            setSearchError(null);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await axios.get('/api/sso-users/search', { params: { q: query.trim(), limit: 20 } });
                if (res.data?.success) {
                    setResults(Array.isArray(res.data.data) ? res.data.data : []);
                    setSearchError(null);
                }
            } catch (err) {
                setResults([]);
                if (axios.isAxiosError(err) && err.response?.status === 503) {
                    setSearchError('Direktori user SSO sedang tidak tersedia; coba lagi nanti.');
                } else {
                    setSearchError('Gagal mencari user.');
                }
            } finally {
                setSearching(false);
            }
        }, 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query]);

    const addAdmin = async (sub: string) => {
        setAdding(sub);
        try {
            await axios.post('/api/admin/roles', { cognitoSub: sub });
            toast.success('Super-admin ditambahkan');
            setQuery('');
            setResults([]);
            await loadAdmins();
        } catch {
            toast.error('Gagal menambah super-admin');
        } finally {
            setAdding(null);
        }
    };

    const removeAdmin = async (row: AdminRow) => {
        const name = adminLabel(row);
        const ok = await confirm(`Cabut hak super-admin dari "${name}"?`, { title: 'Cabut Super-admin' });
        if (!ok) return;
        try {
            await axios.delete('/api/admin/roles', { params: { sub: row.cognitoSub } });
            toast.success('Hak super-admin dicabut');
            await loadAdmins();
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.error : null;
            toast.error(msg || 'Gagal mencabut super-admin');
        }
    };

    if (loading) {
        return (
            <div className="p-6 sm:p-10">
                <LoadingState message="Memuat Hak Akses..." />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="p-6 sm:p-10">
                <PageHeader
                    icon={ShieldCheck}
                    title="Hak Akses"
                    subtitle="Kelola super-admin TENGOK"
                />
                <div className="max-w-md mx-auto text-center py-16 flex flex-col items-center gap-4 text-slate-500">
                    <Lock aria-hidden="true" className="w-10 h-10 text-rose-700 dark:text-rose-400" />
                    <p className="text-lg font-bold text-slate-900 dark:text-white">Anda bukan super-admin</p>
                    <p className="text-sm">Hanya super-admin yang dapat mengelola hak akses. Hubungi super-admin TENGOK untuk meminta akses.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 sm:p-10">
            <PageHeader
                icon={ShieldCheck}
                title="Hak Akses"
                subtitle="Kelola super-admin TENGOK (penentu PIC proyek)"
            />

            {/* Tambah super-admin via pencarian direktori SSO */}
            <section className="mb-10 p-5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5">
                <div className="flex items-center gap-2 mb-4">
                    <UserPlus aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Tambah Super-admin</h2>
                </div>

                <div className="relative">
                    <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        aria-label="Cari user SSO"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Cari user SSO (nama, username, email)..."
                        className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm focus:border-yellow-500/50 outline-none"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            aria-label="Bersihkan pencarian"
                        >
                            <X aria-hidden="true" className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {searchError && (
                    <div role="alert" className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" /> {searchError}
                    </div>
                )}

                {searching && (
                    <div role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Mencari...
                    </div>
                )}

                {!searching && !searchError && results.length > 0 && (
                    <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                        {results.map((u) => (
                            <button
                                key={u.cognitoSub}
                                onClick={() => addAdmin(u.cognitoSub)}
                                aria-label={`Tambahkan ${u.fullName || u.username} sebagai super-admin`}
                                disabled={adding === u.cognitoSub}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] hover:bg-yellow-500/10 border border-transparent hover:border-yellow-500/20 transition-colors text-left disabled:opacity-60 min-h-11"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.fullName || u.username}</div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                        @{u.username}{u.jobTitle ? ` · ${u.jobTitle}` : ''}
                                    </div>
                                </div>
                                {adding === u.cognitoSub
                                    ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin text-yellow-700 dark:text-yellow-500 shrink-0" />
                                    : <UserPlus aria-hidden="true" className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
                            </button>
                        ))}
                    </div>
                )}

                {!searching && !searchError && query.trim().length > 0 && results.length === 0 && (
                    <p className="mt-3 text-xs text-slate-500">Tidak ada user yang cocok.</p>
                )}
            </section>

            {/* Daftar super-admin saat ini */}
            <section>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-4">Daftar Super-admin</h2>
                {admins.length === 0 ? (
                    <EmptyState icon={ShieldCheck} title="Belum ada super-admin" subtitle="Tambahkan super-admin lewat pencarian di atas." />
                ) : (
                    <ul className="space-y-2" aria-label="Daftar super-admin">
                        {admins.map((a) => (
                            <motion.li
                                key={a.cognitoSub}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5"
                            >
                                <div className="min-w-0 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                                        <ShieldCheck aria-hidden="true" className="w-4 h-4 text-yellow-700 dark:text-yellow-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                                            {adminLabel(a)}
                                            {a.isBootstrap && (
                                                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-500">Bootstrap</span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-500 truncate">
                                            {a.username ? `@${a.username}` : `ID ${a.cognitoSub.slice(0, 8)}…`}{a.jobTitle ? ` · ${a.jobTitle}` : ''}
                                        </div>
                                    </div>
                                </div>
                                {a.removable ? (
                                    <button
                                        onClick={() => removeAdmin(a)}
                                        aria-label={`Cabut akses super-admin ${adminLabel(a)}`}
                                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-rose-500/15 text-slate-500 hover:text-rose-700 dark:hover:text-rose-500 text-xs font-bold transition-colors shrink-0 min-h-11"
                                    >
                                        <Trash2 aria-hidden="true" className="w-3.5 h-3.5" /> Cabut
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-2 text-slate-500 dark:text-slate-400 text-xs font-bold shrink-0">
                                        <Lock aria-hidden="true" className="w-3.5 h-3.5" /> Terkunci
                                    </span>
                                )}
                            </motion.li>
                        ))}
                    </ul>
                )}
            </section>

            {ConfirmDialog}
        </div>
    );
}
