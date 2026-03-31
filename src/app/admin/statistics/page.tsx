"use client";

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Loader2, Users, Eye, ArrowUpRight, BarChart3, Smartphone, Laptop, TrendingUp, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

interface StatsData {
    summary: {
        totalVisits: number;
        uniqueVisitors: number;
    };
    deviceStats: { name: string; value: number }[];
    dailyVisits: { date: string; views: number }[];
    popularLinks: { name: string; token: string; views: number }[];
}

const COLORS = ['#eab308', '#f97316', '#ef4444', '#3b82f6'];

export default function StatisticsPage() {
    const [data, setData] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/stats/summary')
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    setData(res.data);
                }
            })
            .catch(err => console.error("Failed to fetch stats", err))
            .finally(() => setLoading(false));
    }, []);

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    const cardVariants = {
        hidden: { opacity: 0, y: 24, scale: 0.96 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
    };

    if (loading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-24 text-slate-600 border-2 border-dashed border-white/10 rounded-[2rem] bg-slate-900/20 px-16"
                >
                    <BarChart3 className="w-20 h-20 mb-4 opacity-10" />
                    <p className="font-bold text-lg uppercase tracking-wider opacity-30">Gagal memuat data statistik</p>
                    <p className="text-sm mt-2 opacity-40 font-medium">Coba muat ulang halaman ini</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-slate-950 p-6 md:p-10 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                <motion.header
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="flex items-end justify-between pb-6 border-b border-white/5"
                >
                    <div>
                        <h1 className="text-4xl font-bold tracking-tight uppercase flex items-center gap-4 text-white">
                            <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl shadow-[0_8px_30px_rgba(234,179,8,0.3)] relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <BarChart3 className="w-8 h-8 text-slate-950 relative z-10" />
                            </div>
                            Statistik Pengunjung
                        </h1>
                        <p className="text-slate-500 text-sm mt-3 font-medium tracking-wide">
                            Pantau aktivitas penonton pada tautan CCTV yang dibagikan.
                        </p>
                    </div>
                </motion.header>

                {/* Summary Cards */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    <motion.div
                        variants={cardVariants}
                        className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 relative overflow-hidden group hover:border-yellow-500/30 hover:shadow-[0_20px_40px_rgba(234,179,8,0.08)] transition-all"
                    >
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-yellow-500/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-yellow-500/20 transition-colors" />
                        <div className="absolute top-6 right-6 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Eye className="w-16 h-16 text-yellow-500" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 rounded-xl bg-yellow-500/10">
                                    <Eye className="w-4 h-4 text-yellow-500" />
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Kunjungan</p>
                            </div>
                            <h2 className="text-4xl font-black text-white tracking-tight">{data.summary.totalVisits}</h2>
                            <p className="text-xs text-yellow-500 mt-3 font-bold uppercase tracking-wider">30 Hari Terakhir</p>
                        </div>
                    </motion.div>

                    <motion.div
                        variants={cardVariants}
                        className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 relative overflow-hidden group hover:border-orange-500/30 hover:shadow-[0_20px_40px_rgba(249,115,22,0.08)] transition-all"
                    >
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-orange-500/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-orange-500/20 transition-colors" />
                        <div className="absolute top-6 right-6 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Users className="w-16 h-16 text-orange-500" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 rounded-xl bg-orange-500/10">
                                    <Users className="w-4 h-4 text-orange-500" />
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pengunjung Unik</p>
                            </div>
                            <h2 className="text-4xl font-black text-white tracking-tight">{data.summary.uniqueVisitors}</h2>
                            <p className="text-xs text-orange-500 mt-3 font-bold uppercase tracking-wider">Pengguna Berbeda</p>
                        </div>
                    </motion.div>
                    
                    <motion.div
                        variants={cardVariants}
                        className="bg-slate-900/60 backdrop-blur-xl border border-yellow-500/20 rounded-3xl p-7 relative overflow-hidden shadow-[0_0_30px_rgba(234,179,8,0.05)] group hover:border-yellow-500/40 hover:shadow-[0_20px_40px_rgba(234,179,8,0.12)] transition-all"
                    >
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-blue-500/20 transition-colors" />
                        <div className="absolute top-6 right-6 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ArrowUpRight className="w-16 h-16 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
                                    <TrendingUp className="w-4 h-4 text-yellow-500" />
                                </div>
                                <p className="text-[11px] font-bold text-yellow-500/80 uppercase tracking-wider">Link Terpopuler</p>
                            </div>
                            <h2 className="text-xl font-bold text-white truncate w-full">
                                {data.popularLinks[0]?.name || '-'}
                            </h2>
                            <p className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-wider">
                                {data.popularLinks[0]?.views || 0} kali dilihat
                            </p>
                        </div>
                    </motion.div>
                </motion.div>

                {/* Charts Row */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                    {/* Line Chart */}
                    <motion.div
                        variants={cardVariants}
                        className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 lg:col-span-2 hover:border-blue-500/20 transition-all"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-xl bg-blue-500/10">
                                <Activity className="w-4 h-4 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Tren Kunjungan</h3>
                            <span className="text-[10px] font-bold bg-white/5 text-slate-400 px-3 py-1 rounded-full border border-white/5 uppercase tracking-wider">7 Hari</span>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.dailyVisits} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                                        itemStyle={{ color: '#eab308', fontWeight: 'bold' }}
                                    />
                                    <Area type="monotone" dataKey="views" name="Views" stroke="#eab308" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Pie Chart */}
                    <motion.div
                        variants={cardVariants}
                        className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-7 hover:border-yellow-500/20 transition-all"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-xl bg-yellow-500/10">
                                <Smartphone className="w-4 h-4 text-yellow-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white uppercase tracking-wider">Perangkat</h3>
                        </div>
                        <div className="h-[220px] w-full relative">
                            {data.deviceStats.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data.deviceStats}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {data.deviceStats.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}
                                            itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-white/5 rounded-2xl">
                                    <Smartphone className="w-12 h-12 mb-3 opacity-10" />
                                    <span className="text-sm font-bold uppercase tracking-wider opacity-30">Belum ada data</span>
                                </div>
                            )}
                            
                            {/* Custom Legend */}
                            {data.deviceStats.length > 0 && (
                                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4">
                                    {data.deviceStats.map((entry, index) => (
                                        <div key={entry.name} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full shadow-[0_0_6px_currentColor]" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                            <span className="text-xs font-bold text-slate-300">{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
                
                {/* Top Links Table */}
                <motion.div
                    variants={cardVariants}
                    initial="hidden"
                    animate="show"
                    className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden hover:border-blue-500/20 transition-all"
                >
                    <div className="px-7 py-6 border-b border-white/5 flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-500/10">
                            <Eye className="w-4 h-4 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-wider">Share Link Teraktif</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-950/50">
                                    <th className="px-7 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nama Kamera / Label</th>
                                    <th className="px-7 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Total Tayangan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.popularLinks.length > 0 ? (
                                    data.popularLinks.map((link) => (
                                        <tr key={link.token} className="border-t border-white/5 hover:bg-white/[0.03] transition-colors group">
                                            <td className="px-7 py-5">
                                                <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{link.name}</div>
                                                <div className="text-[10px] text-slate-500 mt-1 font-mono">{link.token}</div>
                                            </td>
                                            <td className="px-7 py-5 text-right">
                                                <div className="inline-flex items-center gap-2 bg-yellow-500/10 text-yellow-500 px-3.5 py-1.5 rounded-full font-bold text-sm border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                                                    <Eye className="w-3.5 h-3.5" />
                                                    {link.views}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={2} className="px-7 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-600">
                                                <Eye className="w-12 h-12 mb-3 opacity-10" />
                                                <span className="text-sm font-bold uppercase tracking-wider opacity-30">Belum ada link yang diakses</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
