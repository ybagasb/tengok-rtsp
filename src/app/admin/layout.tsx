"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Monitor, MapPin, Tags, ArrowLeft, Shield, Link2, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const navigation = [
        { name: 'Cameras', href: '/admin', icon: Monitor },
        { name: 'Locations', href: '/admin/locations', icon: MapPin },
        { name: 'Categories', href: '/admin/categories', icon: Tags },
        { name: 'Share Links', href: '/admin/share-links', icon: Link2 },
        { name: 'Statistik', href: '/admin/statistics', icon: BarChart3 },
    ];

    const sidebarVariants = {
        hidden: { x: -20, opacity: 0 },
        show: {
            x: 0,
            opacity: 1,
            transition: { staggerChildren: 0.07, delayChildren: 0.15 }
        }
    };

    const navItemVariants = {
        hidden: { x: -16, opacity: 0 },
        show: { x: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    return (
        <div className="flex min-h-screen bg-slate-950 text-white font-sans">
            {/* Sidebar (Desktop) */}
            <div className="w-64 bg-slate-900/80 backdrop-blur-xl border-r border-white/5 flex-col hidden lg:flex sticky top-0 h-screen relative overflow-hidden">
                {/* Sidebar decoration */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-yellow-500/10 rounded-full blur-[60px] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />

                <div className="p-6 border-b border-white/5 flex items-center gap-3 relative z-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="w-11 h-11 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(234,179,8,0.4)]"
                    >
                        <Shield className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                    </motion.div>
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-1">Admin Panel</h2>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tengok System</span>
                    </div>
                </div>

                <motion.div
                    variants={sidebarVariants}
                    initial="hidden"
                    animate="show"
                    className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto relative z-10"
                >
                    {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <motion.div key={item.name} variants={navItemVariants}>
                                <Link
                                    href={item.href}
                                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group relative overflow-hidden ${
                                        isActive
                                            ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 shadow-[0_4px_20px_rgba(234,179,8,0.08)]'
                                            : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                                    }`}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="sidebar-indicator"
                                            className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-yellow-500 to-orange-500 rounded-r-full"
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <Icon className={`w-5 h-5 transition-all ${isActive ? 'text-yellow-500' : 'group-hover:scale-110 group-hover:text-blue-400'}`} />
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

                <div className="p-4 border-t border-white/5 relative z-10">
                    <Link
                        href="/categories"
                        className="flex items-center gap-3 px-4 py-3.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-bold tracking-wide">Exit Admin</span>
                    </Link>
                </div>
            </div>

            {/* Mobile Navigation (Bottom Bar) */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around p-2.5 z-50 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
                {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all relative ${
                                isActive ? 'text-yellow-500' : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="mobile-indicator"
                                    className="absolute -top-2.5 w-8 h-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                            <Icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(234,179,8,0.5)]' : ''}`} />
                            <span className="text-[10px] font-bold">{item.name}</span>
                        </Link>
                    );
                })}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 pb-20 lg:pb-0 w-full overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
