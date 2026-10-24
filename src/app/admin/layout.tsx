"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
    LayoutDashboard, Monitor, MapPin, Tags, ArrowLeft, Shield, ShieldCheck,
    Link2, BarChart3, Activity, MoreHorizontal, X, ClipboardList, Bell 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sidebarVariants, navItemVariants } from '@/components/admin/shared';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [showMore, setShowMore] = useState(false);

    const navigation = [
        { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
        { name: 'Kamera', href: '/admin/cameras', icon: Monitor },
        { name: 'Lokasi Proyek', href: '/admin/locations', icon: MapPin },
        { name: 'Kategori', href: '/admin/categories', icon: Tags },
        { name: 'Share Links', href: '/admin/share-links', icon: Link2 },
        { name: 'Statistik', href: '/admin/statistics', icon: BarChart3 },
        { name: 'Uptime & SLA', href: '/admin/uptime', icon: Activity },
        { name: 'Notifikasi', href: '/admin/notifications', icon: Bell },
        { name: 'Hak Akses', href: '/admin/roles', icon: ShieldCheck },
        { name: 'Audit Log', href: '/admin/audit-log', icon: ClipboardList },
    ];

    // Mobile: show first 4 (Dashboard, Kamera, Lokasi, Kategori), put rest in "More" menu
    const mobileMainNav = navigation.slice(0, 4);
    const mobileMoreNav = navigation.slice(4);

    // Escape menutup sheet "Lainnya"
    useEffect(() => {
        if (!showMore) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMore(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showMore]);

    return (
        <div className="flex min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white font-sans">
            {/* Sidebar (Desktop) */}
            <nav aria-label="Navigasi admin" className="w-64 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-black/5 dark:border-white/5 flex-col hidden lg:flex sticky top-0 h-dvh relative overflow-hidden">
                {/* Sidebar decoration */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-yellow-500/10 rounded-full blur-[60px] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-[50px] pointer-events-none" />

                <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center gap-3 relative z-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="w-11 h-11 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(234,179,8,0.4)]"
                    >
                        <Shield aria-hidden="true" className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                    </motion.div>
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1">Admin Panel</h2>
                        <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Tengok System</span>
                    </div>
                </div>

                <motion.div
                    variants={sidebarVariants}
                    initial="hidden"
                    animate="show"
                    className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto relative z-10 custom-scrollbar"
                >
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.href === '/admin' 
                            ? pathname === '/admin' 
                            : pathname.startsWith(item.href);

                        return (
                            <motion.div key={item.name} variants={navItemVariants}>
                                <Link
                                    href={item.href}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`flex items-center gap-3 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded-xl transition-all group relative overflow-hidden ${
                                        isActive
                                            ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border border-yellow-500/20 shadow-[0_4px_20px_rgba(234,179,8,0.08)]'
                                            : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white border border-transparent'
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-indicator"
                                            className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-yellow-500 to-orange-500 rounded-r-full"
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <Icon aria-hidden="true" className={`w-5 h-5 transition-all ${isActive ? 'text-yellow-600 dark:text-yellow-500' : 'group-hover:scale-110 group-hover:text-yellow-400'}`} />
                                    <span className="text-sm font-bold">{item.name}</span>
                                    {isActive && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]"
                                        />
                                    )}
                                </Link>
                            </motion.div>
                        );
                    })}
                </motion.div>

                <div className="p-4 border-t border-black/5 dark:border-white/5 relative z-10 space-y-2">
                    <div className="mx-1 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold uppercase tracking-[0.18em]">
                        <span aria-hidden="true" className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping motion-reduce:animate-none" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                        System Online
                    </div>
                    <div className="px-1"><ThemeToggle className="w-full justify-start" /></div>
                    <button
                        onClick={() => router.push('/categories')}
                        className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none w-full flex items-center gap-3 px-4 py-3.5 text-slate-500 dark:text-slate-400 hover:text-yellow-700 dark:hover:text-yellow-400 hover:bg-yellow-500/10 rounded-xl transition-all group"
                    >
                        <ArrowLeft aria-hidden="true" className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-bold tracking-wide">Exit Admin</span>
                    </button>
                </div>
            </nav>

            {/* Mobile Navigation (Bottom Bar) — 4 items + More */}
            <nav aria-label="Navigasi admin seluler" className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-black/10 dark:border-white/10 z-50 pb-safe shadow-[0_-8px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-around p-2.5">
                    {mobileMainNav.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.href === '/admin' 
                            ? pathname === '/admin' 
                            : pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={`flex flex-col items-center gap-1 py-2 px-3 min-w-[64px] min-h-12 rounded-xl transition-all relative focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
                                    isActive ? 'text-yellow-700 dark:text-yellow-500' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="mobile-indicator"
                                        className="absolute -top-2.5 w-8 h-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <Icon aria-hidden="true" className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : ''}`} />
                                <span className="text-[11px] font-bold">{item.name}</span>
                            </Link>
                        );
                    })}

                    {/* More Menu Trigger */}
                    <button
                        type="button"
                        onClick={() => setShowMore(true)}
                        aria-expanded={showMore}
                        aria-haspopup="dialog"
                        aria-label="Menu lainnya"
                        className={`flex flex-col items-center gap-1 py-2 px-3 min-w-[64px] min-h-12 rounded-xl transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
                            mobileMoreNav.some(n => pathname.startsWith(n.href)) ? 'text-yellow-700 dark:text-yellow-500' : 'text-slate-500'
                        }`}
                    >
                        <MoreHorizontal aria-hidden="true" className="w-5 h-5" />
                        <span className="text-[11px] font-bold">Lainnya</span>
                    </button>
                </div>
            </nav>

            {/* Mobile "More" Slide-up Sheet */}
            <AnimatePresence>
                {showMore && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu lainnya"
                        className="lg:hidden fixed inset-0 z-[60] flex items-end"
                    >
                        <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowMore(false)} />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                            className="relative w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-black/10 dark:border-white/10 rounded-t-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wider">Menu Lainnya</h3>
                                <button
                                    type="button"
                                    onClick={() => setShowMore(false)}
                                    aria-label="Tutup menu lainnya"
                                    className="w-10 h-10 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded-xl bg-black/[0.04] dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    <X aria-hidden="true" className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-2">
                                {mobileMoreNav.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname.startsWith(item.href);
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            onClick={() => setShowMore(false)}
                                            aria-current={isActive ? 'page' : undefined}
                                            className={`flex items-center gap-4 p-4 rounded-2xl transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
                                                isActive
                                                    ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border border-yellow-500/20'
                                                    : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white border border-transparent'
                                            }`}
                                        >
                                            <Icon aria-hidden="true" className="w-5 h-5" />
                                            <span className="text-sm font-bold">{item.name}</span>
                                            {isActive && <div aria-hidden="true" className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                                        </Link>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => { setShowMore(false); router.push('/categories'); }}
                                className="w-full flex items-center gap-4 p-4 mt-4 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded-2xl text-slate-500 dark:text-slate-400 hover:text-yellow-700 dark:hover:text-yellow-400 hover:bg-yellow-500/10 transition-all border-t border-black/5 dark:border-white/5 pt-6"
                            >
                                <ArrowLeft aria-hidden="true" className="w-5 h-5" />
                                <span className="text-sm font-bold">Exit Admin</span>
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Grid HUD tipis di atas konten (murni dekorasi, tidak menangkap klik) */}
            <div
                aria-hidden
                className="pointer-events-none fixed inset-0 lg:left-64 z-[1] opacity-[0.05] dark:opacity-[0.07]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(234,179,8,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(234,179,8,0.8) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                    maskImage: 'radial-gradient(ellipse 90% 80% at 50% 30%, #000 20%, transparent 100%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 30%, #000 20%, transparent 100%)',
                }}
            />

            {/* Main Content Area */}
            <main id="admin-main" className="flex-1 min-w-0 pb-24 lg:pb-0 w-full overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
