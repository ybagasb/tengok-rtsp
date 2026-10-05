"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, Settings, X, ShieldAlert, LayoutGrid, Loader2, User, BookOpen } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { usePageTracking } from '@/hooks/usePageTracking';
import ThemeToggle from '@/components/ThemeToggle';

interface Category {
    _id: string;
    name: string;
    identifier: string;
    description: string;
    icon: string;
    color: string;
    projectCount?: number;
}

interface Division {
    division: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';
    projectCount: number;
    categories: Category[];
}

// Metadata tampilan tiap divisi (logo + gradient aksen).
const DIVISION_META: Record<string, { logo: string; color: string; desc: string }> = {
    'DIVISI 1': { logo: '/div1.svg', color: 'from-indigo-500 to-blue-500',   desc: 'Gedung, bangunan & fasilitas' },
    'DIVISI 2': { logo: '/div2.svg', color: 'from-cyan-500 to-teal-500',     desc: 'Bendungan, air & sumber daya air' },
    'DIVISI 3': { logo: '/div3.svg', color: 'from-amber-500 to-orange-500',  desc: 'Jalan, tol & infrastruktur transportasi' },
};


export default function CategoriesPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [pin, setPin] = useState(['', '', '', '', '', '']);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Track this page visit for analytics
    usePageTracking('categories');

    const handleLogout = async () => {
        setShowProfile(false);
        try {
            // 1. Clear server-side cookies
            await fetch('/api/auth/logout', { method: 'POST' });
            // 2. Clear NextAuth client session, then redirect to federated logout
            await signOut({ redirect: false });
            // 3. Redirect to federated logout (clears Cognito SSO session too)
            window.location.href = '/api/auth/federated-logout';
        } catch {
            window.location.href = '/login';
        }
    };

    useEffect(() => {
        const fetchDivisions = async () => {
            try {
                const { data } = await axios.get('/api/divisions');
                setDivisions(data.data || []);
            } catch (error) {
                console.error("Failed to fetch divisions:", error);
                toast.error("Gagal memuat divisi proyek");
            } finally {
                setIsLoadingCategories(false);
            }
        };
        fetchDivisions();
    }, []);

    const handleDivisionClick = (division: string) => {
        router.push(`/categories/${encodeURIComponent(division)}`);
    };

    const handlePinChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;

        const newPin = [...pin];
        newPin[index] = value.slice(-1);
        setPin(newPin);

        // Auto focus next
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    useEffect(() => {
        if (pin.every(digit => digit !== '')) {
            const enteredPin = pin.join('');
            const expectedPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '654321';
            
            if (enteredPin === expectedPin) {
                toast.success('Akses Diterima');
                router.push('/admin');
            } else {
                toast.error('PIN Salah');
                setPin(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        }
    }, [pin, router]);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white px-4 py-4 sm:p-6 md:p-12 relative overflow-hidden flex flex-col transition-colors">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-yellow-600/10 blur-[120px]" />
            </div>

            {/* Brantas Logo Watermark - Brand Identity Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <motion.img
                    src="/abipraya_original.svg"
                    alt=""
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.04, scale: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] min-w-[250px] min-h-[250px] object-contain select-none"
                    draggable={false}
                />
            </div>

            {/* Header */}
            <header className="flex flex-row justify-between items-center gap-2 mb-6 sm:mb-16 relative z-30">
                {/* Logo + Title */}
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                    <img src="/LOGO_ABIPRAYA.png" alt="Logo" className="w-8 h-8 sm:w-12 sm:h-12 shrink-0 block dark:hidden" />
                    <img src="/abipraya_original.svg" alt="Logo" className="w-8 h-8 sm:w-12 sm:h-12 shrink-0 hidden dark:block" />
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-2xl font-bold bg-gradient-to-r from-yellow-500 to-amber-500 dark:from-yellow-400 dark:to-yellow-200 bg-clip-text text-transparent tracking-tight uppercase leading-tight">
                            Project Management Information System
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-[8px] sm:text-[11px] font-bold uppercase tracking-wider opacity-70 dark:opacity-60 truncate">Pilih divisi untuk melihat proyek</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="relative flex items-center gap-1.5 sm:gap-3 shrink-0">

                    {/* Toggle tema (Auto / Terang / Gelap) */}
                    <ThemeToggle />

                    {/* Panduan pengguna (download PDF) — cara mengisi detail proyek */}
                    <a
                        href="/Panduan-Input-Detail-Proyek.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 group"
                        title="Unduh Panduan Pengisian Detail Proyek (PDF)"
                    >
                        <BookOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Panduan</span>
                    </a>

                    {/* SSO User Profile */}
                    {session?.user && (
                        <div className="relative">
                            <button
                                onClick={() => setShowProfile(p => !p)}
                                className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 transition-all group"
                                title={session.user.name || 'Profil'}
                            >
                                {session.user.image ? (
                                    <img
                                        src={session.user.image}
                                        alt={session.user.name || ''}
                                        className="w-7 h-7 rounded-full object-cover ring-2 ring-yellow-500/30"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-[11px] font-bold text-slate-900 dark:text-white shrink-0">
                                        {session.user.name?.charAt(0)?.toUpperCase() || <User className="w-3.5 h-3.5" />}
                                    </div>
                                )}
                                <div className="hidden sm:block text-left">
                                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">{session.user.name}</p>
                                    <p className="text-[9px] text-slate-500 leading-tight truncate max-w-[120px]">{session.user.email}</p>
                                </div>
                            </button>

                            {/* Profile Dropdown - fixed to right edge on mobile */}
                            <AnimatePresence>
                                {showProfile && (
                                    <>
                                        {/* Backdrop to close on click outside */}
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowProfile(false)}
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[260px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                                        >
                                            <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
                                                {session.user.image ? (
                                                    <img src={session.user.image} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20 shrink-0" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white shrink-0">
                                                        {session.user.name?.charAt(0)?.toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{session.user.name}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{session.user.email}</p>
                                                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                                                        <ShieldAlert className="w-2.5 h-2.5" /> SSO
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-2">
                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-sm font-semibold"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    Keluar / Logout
                                                </button>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}

                    {/* Settings / Management button */}
                    {session?.user && (
                        <button
                            onClick={() => setShowPinModal(true)}
                            className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-yellow-500/30 group"
                            title="Management"
                        >
                            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Management</span>
                        </button>
                    )}

                    {/* Logout button for non-SSO users */}
                    {!session?.user && (
                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-red-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 hover:border-red-500/30 group"
                            title="Logout"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Logout</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Grid Kategori */}
            {isLoadingCategories ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto relative z-10">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-36 sm:h-48 lg:h-64 rounded-3xl sm:rounded-[2.5rem] bg-white/60 dark:bg-slate-900/40 border border-black/5 dark:border-white/5 p-5 sm:p-8 flex flex-col justify-between animate-pulse">
                            <div className="flex justify-between items-start">
                                <div className="w-11 h-11 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-2xl sm:rounded-3xl bg-slate-300/70 dark:bg-slate-800/80" />
                                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                            </div>
                            <div className="mt-auto space-y-2 sm:space-y-3">
                                <div className="h-5 sm:h-7 lg:h-8 bg-slate-300/70 dark:bg-slate-800/80 rounded-xl w-3/4" />
                                <div className="h-2.5 sm:h-3 bg-slate-200/60 dark:bg-slate-800/50 rounded-lg w-full" />
                                <div className="h-2.5 sm:h-3 bg-slate-200/50 dark:bg-slate-800/40 rounded-lg w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto relative z-10 pb-8">
                    {divisions.map((div, index) => {
                        const meta = DIVISION_META[div.division];
                        const color = meta?.color || 'from-slate-500 to-slate-600';
                        const empty = div.projectCount === 0;
                        return (
                            <motion.button
                                key={div.division}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, ease: "easeOut" }}
                                onClick={() => !empty && handleDivisionClick(div.division)}
                                disabled={empty}
                                className={`group relative h-36 sm:h-48 lg:h-64 rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-black/5 dark:border-white/5 transition-all duration-500 text-left p-5 sm:p-8 lg:p-10 shadow-xl flex flex-col justify-between ${empty ? 'opacity-50 cursor-not-allowed' : 'hover:border-yellow-500/30 hover:shadow-yellow-500/10 active:scale-95'}`}
                            >
                                {/* Icon Background Glow */}
                                <div className={`absolute -top-10 -right-10 w-28 h-28 sm:w-40 sm:h-40 bg-gradient-to-br ${color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />

                                <div className="relative z-10 flex justify-between items-start">
                                    {meta?.logo ? (
                                        <div className={`rounded-2xl sm:rounded-3xl bg-white shadow-lg overflow-hidden transition-all duration-500 ${empty ? '' : 'group-hover:scale-110'}`}>
                                            <img src={meta.logo} alt={div.division} className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 object-contain p-1.5" />
                                        </div>
                                    ) : (
                                        <div className={`p-3 sm:p-4 lg:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br ${color} shadow-lg transition-all duration-500 ${empty ? '' : 'group-hover:scale-110 group-hover:rotate-6'}`}>
                                            <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-slate-900 dark:text-white stroke-[2.5]" />
                                        </div>
                                    )}
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 bg-black/[0.04] dark:bg-white/[0.06] border border-black/10 dark:border-white/10 rounded-full px-2.5 py-1">
                                        {div.projectCount} proyek
                                    </span>
                                </div>

                                <div className="relative z-10 mt-auto">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-1 sm:mb-2 group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors line-clamp-1">
                                            {div.division}
                                        </h2>
                                        {!empty && (
                                            <LucideIcons.ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 group-hover:text-yellow-400 group-hover:translate-x-1.5 transition-all duration-500 shrink-0 mb-1 sm:mb-2" />
                                        )}
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wider opacity-60 leading-relaxed line-clamp-2">
                                        {empty ? 'Belum ada proyek' : (meta?.desc || `${div.categories.length} kategori`)}
                                    </p>
                                </div>

                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-yellow-500/20 rounded-3xl sm:rounded-[2.5rem] transition-all duration-500 pointer-events-none" />
                            </motion.button>
                        );
                    })}
                </div>
            )}

            {/* Admin PIN Modal */}
            <AnimatePresence>
                {showPinModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10"
                    >
                        {/* Backdrop Blur */}
                        <div
                            className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-2xl"
                            onClick={() => setShowPinModal(false)}
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-3xl border border-black/10 dark:border-white/10 rounded-[3rem] p-8 sm:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
                        >
                            <button
                                onClick={() => setShowPinModal(false)}
                                className="absolute top-6 sm:top-10 right-6 sm:right-10 p-3 rounded-2xl bg-black/[0.04] dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>

                            <div className="flex flex-col items-center text-center">
                                <div className="p-6 sm:p-8 rounded-[2.5rem] bg-yellow-500/10 mb-8 sm:mb-10 shadow-2xl shadow-yellow-500/5">
                                    <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-500 stroke-[2.5]" />
                                </div>

                                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-3 px-4">
                                    Admin Access
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider opacity-60 mb-10 sm:mb-12">
                                    Masukkan PIN management rahasia
                                </p>

                                <div className="flex gap-2 sm:gap-4 justify-center mb-10 sm:mb-12">
                                    {pin.map((digit, index) => (
                                        <input
                                            key={index}
                                            ref={el => { inputRefs.current[index] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handlePinChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                            className="w-10 h-14 sm:w-16 sm:h-20 bg-white/70 dark:bg-slate-950/50 border-2 border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl text-center text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white focus:border-yellow-500/50 focus:outline-none transition-all shadow-2xl"
                                        />
                                    ))}
                                </div>

                                <p className="text-slate-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                                    Unauthorized access is strictly prohibited
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Footer */}
            <footer className="mt-auto text-center relative z-10 pb-10 pt-16 sm:pt-24">
                <p className="text-slate-500 text-[10px] sm:text-xs font-bold uppercase tracking-[0.3em] opacity-40">
                    © {new Date().getFullYear()} PT Brantas Abipraya (Persero) • Smart Monitoring System
                </p>
            </footer>
        </div>
    );
}
