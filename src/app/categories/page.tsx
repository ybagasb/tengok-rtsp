"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, X, ShieldAlert, LayoutGrid, Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Category {
    _id: string;
    name: string;
    identifier: string;
    description: string;
    icon: string;
    color: string;
}


export default function CategoriesPage() {
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pin, setPin] = useState(['', '', '', '', '', '']);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const { data } = await axios.get('/api/categories');
                setCategories(data);
            } catch (error) {
                console.error("Failed to fetch categories:", error);
                toast.error("Gagal memuat kategori proyek");
            } finally {
                setIsLoadingCategories(false);
            }
        };
        fetchCategories();
    }, []);

    const handleCategoryClick = (categoryId: string) => {
        router.push(`/map?category=${categoryId}`);
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
            if (enteredPin === '654321') {
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
        <div className="min-h-screen bg-slate-950 p-6 md:p-12 relative overflow-hidden flex flex-col">
            {/* Background Decorations */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-yellow-600/10 blur-[120px]" />
            </div>

            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-12 sm:mb-16 relative z-10">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <img src="/abipraya_original.svg" alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12" />
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent tracking-tight uppercase">
                            Kategori Proyek
                        </h1>
                        <p className="text-slate-400 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider opacity-60">Pilih lokasi yang ingin dipantau</p>
                    </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto px-4 sm:px-0">
                    <button
                        onClick={() => setShowPinModal(true)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 text-slate-400 hover:text-yellow-400 transition-all px-4 sm:px-5 py-2.5 rounded-xl bg-slate-900/50 backdrop-blur border border-white/5 hover:border-yellow-500/30 group"
                        title="Management"
                    >
                        <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
                        <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Management</span>
                    </button>
                    <div className="hidden sm:block w-px h-6 bg-white/10 mx-1" />
                    <button
                        onClick={() => router.push('/login')}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 transition-all px-4 sm:px-5 py-2.5 rounded-xl bg-slate-900/50 backdrop-blur border border-white/5 hover:border-red-500/30 group"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">Logout</span>
                    </button>
                </div>
            </header>

            {/* Grid Kategori */}
            {isLoadingCategories ? (
                <div className="flex justify-center items-center py-20 relative z-10">
                    <Loader2 className="w-12 h-12 animate-spin text-yellow-500 opacity-50" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto relative z-10">
                    {categories.map((cat, index) => {
                        const Icon = (LucideIcons as any)[cat.icon] || LayoutGrid;
                        return (
                            <motion.button
                                key={cat._id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1, ease: "easeOut" }}
                                onClick={() => handleCategoryClick(cat.identifier)}
                                className="group relative h-48 sm:h-64 rounded-[2.5rem] overflow-hidden bg-slate-900/40 backdrop-blur-xl border border-white/5 hover:border-yellow-500/30 transition-all duration-500 text-left p-6 sm:p-10 shadow-2xl hover:shadow-yellow-500/10 active:scale-95 flex flex-col justify-between"
                            >
                                {/* Icon Background Glow */}
                                <div className={`absolute -top-10 -right-10 w-32 h-32 sm:w-40 sm:h-40 bg-gradient-to-br ${cat.color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />

                                <div className="relative z-10 flex justify-between items-start">
                                    <div className={`p-4 sm:p-5 rounded-3xl bg-gradient-to-br ${cat.color} shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                                        <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-white stroke-[2.5]" />
                                    </div>
                                    <LucideIcons.ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-slate-700 group-hover:text-yellow-400 group-hover:translate-x-2 transition-all duration-500" />
                                </div>

                                <div className="relative z-10 mt-auto">
                                    <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight uppercase mb-2 group-hover:text-yellow-400 transition-colors">
                                        {cat.name}
                                    </h2>
                                    <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider opacity-60 leading-relaxed sm:max-w-[80%] line-clamp-2">
                                        {cat.description}
                                    </p>
                                </div>

                                {/* Hover Border Gradient */}
                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-yellow-500/20 rounded-[2.5rem] transition-all duration-500 pointer-events-none" />
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
                            className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
                            onClick={() => setShowPinModal(false)}
                        />

                        {/* Modal Content */}
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-xl bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-8 sm:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
                        >
                            <button
                                onClick={() => setShowPinModal(false)}
                                className="absolute top-6 sm:top-10 right-6 sm:top-10 right-6 sm:right-10 p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>

                            <div className="flex flex-col items-center text-center">
                                <div className="p-6 sm:p-8 rounded-[2.5rem] bg-yellow-500/10 mb-8 sm:mb-10 shadow-2xl shadow-yellow-500/5">
                                    <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-500 stroke-[2.5]" />
                                </div>

                                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight uppercase mb-3 px-4">
                                    Admin Access
                                </h2>
                                <p className="text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider opacity-60 mb-10 sm:mb-12">
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
                                            className="w-10 h-14 sm:w-16 sm:h-20 bg-slate-950/50 border-2 border-white/10 rounded-2xl sm:rounded-3xl text-center text-2xl sm:text-4xl font-bold text-white focus:border-yellow-500/50 focus:outline-none transition-all shadow-2xl"
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
                    © 2026 PT Brantas Abipraya (Persero) • Smart Monitoring System
                </p>
            </footer>
        </div>
    );
}
