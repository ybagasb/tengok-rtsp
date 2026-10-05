"use client";

import { useState, useEffect, use } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LayoutGrid, Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { usePageTracking } from '@/hooks/usePageTracking';

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
    division: string;
    projectCount: number;
    categories: Category[];
}

export default function DivisionCategoriesPage({ params }: { params: Promise<{ division: string }> }) {
    const { division: rawDivision } = use(params);
    const division = decodeURIComponent(rawDivision);
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    usePageTracking('categories-division');

    useEffect(() => {
        const fetchDivision = async () => {
            try {
                const { data } = await axios.get('/api/divisions');
                const found: Division | undefined = (data.data || []).find((d: Division) => d.division === division);
                setCategories(found?.categories || []);
            } catch {
                toast.error('Gagal memuat kategori divisi');
            } finally {
                setLoading(false);
            }
        };
        fetchDivision();
    }, [division]);

    const handleCategoryClick = (identifier: string) => {
        router.push(`/map?division=${encodeURIComponent(division)}&category=${identifier}`);
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 px-4 py-4 sm:p-6 md:p-12 relative overflow-hidden flex flex-col">
            {/* Background */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-yellow-600/10 blur-[120px]" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center gap-3 mb-8 max-w-6xl mx-auto w-full">
                <button
                    onClick={() => router.push('/categories')}
                    className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/50 backdrop-blur border border-black/5 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-black/20 dark:hover:border-white/20 transition-colors shrink-0"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-base sm:text-2xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent tracking-tight uppercase leading-tight">
                        {division}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-[8px] sm:text-[11px] font-bold uppercase tracking-wider opacity-60 truncate">
                        Pilih kategori proyek di divisi ini
                    </p>
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                </div>
            ) : categories.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                    Belum ada kategori proyek di divisi ini.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto relative z-10 pb-8 w-full">
                    {categories.map((cat, index) => {
                        const Icon = (LucideIcons as any)[cat.icon] || LayoutGrid;
                        return (
                            <motion.button
                                key={cat._id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.08, ease: 'easeOut' }}
                                onClick={() => handleCategoryClick(cat.identifier)}
                                className="group relative h-36 sm:h-48 lg:h-64 rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-black/5 dark:border-white/5 hover:border-yellow-500/30 transition-all duration-500 text-left p-5 sm:p-8 lg:p-10 shadow-xl hover:shadow-yellow-500/10 active:scale-95 flex flex-col justify-between"
                            >
                                <div className={`absolute -top-10 -right-10 w-28 h-28 sm:w-40 sm:h-40 bg-gradient-to-br ${cat.color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />

                                <div className="relative z-10 flex justify-between items-start">
                                    <div className={`p-3 sm:p-4 lg:p-5 rounded-2xl sm:rounded-3xl bg-gradient-to-br ${cat.color} shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                                        <Icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-slate-900 dark:text-white stroke-[2.5]" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 bg-white/[0.06] border border-black/10 dark:border-white/10 rounded-full px-2.5 py-1">
                                        {cat.projectCount ?? 0} proyek
                                    </span>
                                </div>

                                <div className="relative z-10 mt-auto">
                                    <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-1 sm:mb-2 group-hover:text-yellow-400 transition-colors line-clamp-1">
                                        {cat.name}
                                    </h2>
                                    <p className="text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wider opacity-60 leading-relaxed line-clamp-2">
                                        {cat.description}
                                    </p>
                                </div>

                                <LucideIcons.ArrowRight className="absolute top-5 right-5 sm:top-8 sm:right-8 w-5 h-5 text-slate-700 group-hover:text-yellow-400 group-hover:translate-x-2 transition-all duration-500 opacity-0 group-hover:opacity-100" />
                            </motion.button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
