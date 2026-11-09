"use client";
/**
 * HariKontrakRow — tiga angka Hari Kontrak, Hari Terpakai, dan Sisa Hari
 * (dihitung dari tanggal mulai & selesai kontrak) untuk kartu Progress Fisik.
 */
import { kontrakHari } from '@/lib/projectReport';

const fHari = (n: number) => n.toLocaleString('id-ID');

export default function HariKontrakRow({ startDate, endDate, compact = false, hint = false }: {
    startDate?: string | Date | null; endDate?: string | Date | null; compact?: boolean; hint?: boolean;
}) {
    const h = kontrakHari(startDate, endDate);
    if (!h) {
        return hint ? (
            <p className="text-[11px] text-slate-600 dark:text-slate-400">Isi tanggal mulai dan selesai di tab Informasi untuk melihat hari kontrak.</p>
        ) : null;
    }
    const lewat = h.sisa < 0;
    const items = [
        { label: 'Hari Kontrak', value: fHari(h.total), tone: 'text-slate-900 dark:text-white' },
        { label: 'Hari Terpakai', value: fHari(h.terpakai), tone: 'text-slate-900 dark:text-white' },
        { label: lewat ? 'Lewat' : 'Sisa Hari', value: fHari(Math.abs(h.sisa)), tone: lewat ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400' },
    ];
    return (
        <div className="space-y-1.5">
            <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {items.map(i => (
                    <div key={i.label} className={`rounded-xl bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/5 text-center ${compact ? 'px-1.5 py-1.5' : 'p-2.5'}`}>
                        <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 truncate">{i.label}</div>
                        <div className={`${compact ? 'text-sm' : 'text-base'} font-black font-mono leading-tight ${i.tone}`}>
                            {i.value}<span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 ml-0.5">hr</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden" role="img" aria-label={`Waktu terpakai ${h.persen.toFixed(1)} persen`}>
                <div className={`h-full rounded-full ${lewat ? 'bg-rose-500' : 'div-accent-solid'}`} style={{ width: `${h.persen}%` }} />
            </div>
        </div>
    );
}
