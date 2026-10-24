"use client";

import { useEffect, useState } from 'react';
import { Cpu, HardDrive, Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface Stats {
    memory: { rss: number; heapUsed: number; heapTotal: number };
    cpu: { process: number; systemLoad: number };
    system: { totalMemory: number; freeMemory: number };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function getColor(pct: number): string {
    if (pct < 50) return 'text-emerald-400';
    if (pct < 80) return 'text-yellow-400';
    return 'text-rose-400';
}

function Bar({ pct }: { pct: number }) {
    const color = pct < 50 ? 'bg-emerald-500' : pct < 80 ? 'bg-yellow-500' : 'bg-rose-500';
    return (
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.min(100, pct)}%` }}
            />
        </div>
    );
}

export default function ResourceMonitor() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [collapsed, setCollapsed] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async () => {
            try {
                const res = await fetch('/api/system/stats');
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (isMounted) { setStats(data); setError(false); }
            } catch {
                if (isMounted) setError(true);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 3000); // Refresh every 3 seconds
        return () => { isMounted = false; clearInterval(interval); };
    }, []);

    const ramUsed = stats ? stats.system.totalMemory - stats.system.freeMemory : 0;
    const ramPct = stats ? (ramUsed / stats.system.totalMemory) * 100 : 0;
    const cpuPct = stats?.cpu.process ?? 0;
    const heapPct = stats ? (stats.memory.heapUsed / stats.memory.heapTotal) * 100 : 0;

    return (
        <div className="fixed bottom-4 left-4 z-[2000] rounded-2xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10 bg-white/85 dark:bg-slate-900/80 backdrop-blur-xl">
            {/* Header row */}
            <button
                onClick={() => setCollapsed(p => !p)}
                className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors group min-h-10 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Tampilkan monitor sumber daya" : "Sembunyikan monitor sumber daya"}
            >
                <div className="relative">
                    <Activity className="w-3.5 h-3.5 text-yellow-500" aria-hidden="true" />
                    <div className="absolute inset-0 bg-yellow-500 blur-sm opacity-40 animate-pulse" />
                </div>
                <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Resources
                </span>
                {collapsed
                    ? <ChevronUp className="w-3 h-3 text-slate-500 ml-auto group-hover:text-white transition-colors" />
                    : <ChevronDown className="w-3 h-3 text-slate-500 ml-auto group-hover:text-white transition-colors" />
                }
            </button>

            {/* Stats body */}
            {!collapsed && (
                <div className="px-3 pb-3 pt-1 space-y-2.5 min-w-[160px]">
                    {error ? (
                        <p className="text-[11px] text-rose-400 uppercase tracking-wider">Unavailable</p>
                    ) : !stats ? (
                        <p className="text-[11px] text-slate-500 uppercase tracking-wider animate-pulse">Loading...</p>
                    ) : (
                        <>
                            {/* Process CPU */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        <Cpu className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">CPU</span>
                                    </div>
                                    <span className={`text-[11px] font-bold tabular-nums ${getColor(cpuPct)}`}>
                                        {cpuPct.toFixed(1)}%
                                    </span>
                                </div>
                                <Bar pct={cpuPct} />
                                <div className="text-[11px] text-slate-600 tabular-nums">
                                    Load avg: {stats.cpu.systemLoad.toFixed(2)}
                                </div>
                            </div>

                            {/* Heap Usage */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        <HardDrive className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">Heap</span>
                                    </div>
                                    <span className={`text-[11px] font-bold tabular-nums ${getColor(heapPct)}`}>
                                        {formatBytes(stats.memory.heapUsed)}
                                    </span>
                                </div>
                                <Bar pct={heapPct} />
                                <div className="text-[11px] text-slate-600 tabular-nums">
                                    of {formatBytes(stats.memory.heapTotal)}
                                </div>
                            </div>

                            {/* System RAM */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">RAM</span>
                                    </div>
                                    <span className={`text-[11px] font-bold tabular-nums ${getColor(ramPct)}`}>
                                        {Math.round(ramPct)}%
                                    </span>
                                </div>
                                <Bar pct={ramPct} />
                                <div className="text-[11px] text-slate-600 tabular-nums">
                                    {formatBytes(ramUsed)} / {formatBytes(stats.system.totalMemory)}
                                </div>
                            </div>

                            {/* Process RSS */}
                            <div className="pt-1 border-t border-black/5 dark:border-white/5">
                                <div className="text-[11px] text-slate-600 tabular-nums">
                                    Process RSS: {formatBytes(stats.memory.rss)}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
