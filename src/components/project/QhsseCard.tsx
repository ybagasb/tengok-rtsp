"use client";
/**
 * QhsseCard — kartu ringkasan satu dimensi QHSSE: nilai terbaru, selisih vs bulan lalu
 * (hijau = membaik, merah = memburuk), dan grafik mini tren. Dipakai di tampilan "Semua"
 * tab QHSSE dan (mode compact) di panel QHSSE pada Ringkasan halaman detail.
 */
import { QhsseSparkline } from '@/components/project/QhsseChart';
import { DeltaChip, TREND } from '@/components/project/QhsseParts';
import {
    detailText, fmtNum, fmtRupiah, fmtValue, periodeFull, periodeShort, seriesFor, summarize,
    type QhsseData, type QhsseDim,
} from '@/lib/qhsse';

export default function QhsseCard({ dim, data, onClick, className = '', compact = false }: {
    dim: QhsseDim; data?: QhsseData; onClick?: () => void; className?: string; compact?: boolean;
}) {
    const s = summarize(dim.id, data);
    const t = s.trend ? TREND[s.trend] : undefined;
    const fmt = (v: number) => fmtValue(dim.id, v);
    const points = seriesFor(dim.id, data)[0].points;
    const sub = detailText(dim.id, data);
    const hasUnit = (dim.unit === 'kasus' || dim.unit === 'laporan') && s.latest != null;
    const deltaText = s.delta == null ? '' : dim.id === 'cost' ? fmtRupiah(s.delta) : fmtNum(s.delta, 2);
    const when = s.periode ? (compact ? periodeShort(s.periode) : periodeFull(s.periode)) : 'Belum ada data';

    const body = (
        <>
            {compact ? (
                <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{dim.bidang}</span>
                        <DeltaChip delta={s.delta} trend={s.trend} text={deltaText} />
                    </div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-2" title={dim.label}>{dim.short}</span>
                </div>
            ) : (
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{dim.bidang}</span>
                        <span className="block text-xs font-bold text-slate-900 dark:text-white leading-snug" title={dim.label}>{dim.label}</span>
                    </div>
                    <DeltaChip delta={s.delta} trend={s.trend} text={deltaText} />
                </div>
            )}
            <div className="flex items-baseline gap-1.5">
                <span className={`${compact ? 'text-xl' : 'text-2xl'} font-black font-mono text-slate-900 dark:text-white leading-none`}>{fmtValue(dim.id, s.latest)}</span>
                {hasUnit && <span className="text-[11px] text-slate-500 dark:text-slate-400">{dim.unit}</span>}
            </div>
            <div className={`text-[11px] text-slate-600 dark:text-slate-400 leading-snug ${compact ? 'truncate [@media(max-height:900px)]:hidden' : 'min-h-[1.1em]'}`} title={sub}>
                {when}{sub ? ` · ${sub}` : ''}
            </div>
            <div className={`flex-1 ${compact ? 'min-h-6' : 'min-h-10'}`}>
                <QhsseSparkline points={points} color={t?.color ?? 'rgb(var(--div-accent-rgb))'} fmt={fmt} />
            </div>
        </>
    );
    const base = `min-w-0 flex flex-col gap-1.5 ${compact ? 'p-2.5 overflow-hidden' : 'p-3'} rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 text-left ${className}`;
    return onClick ? (
        <button type="button" onClick={onClick} className={`${base} hover:border-[rgba(var(--div-accent-rgb),0.5)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none`}>
            {body}
        </button>
    ) : (
        <div className={base}>{body}</div>
    );
}
