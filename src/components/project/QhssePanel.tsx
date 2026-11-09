"use client";
/**
 * QhssePanel — tab QHSSE di panel peta (read-only).
 * Kartu dikelompokkan per bidang dengan ukuran & visual berbeda sesuai sifat datanya:
 * bar open/closed (NC), bar per domain (QPASS), ring (SMK3L), batang bulanan (PAK, keamanan),
 * dua garis (5R: jumlah & durasi), progress (efisiensi energi).
 */
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { QhsseSparkline, QhsseTrendChart } from '@/components/project/QhsseChart';
import { ACCENT, DeltaChip, MiniBars, ScoreRing, TREND, type Trend } from '@/components/project/QhsseParts';
import {
    QHSSE_DIMS, deltaOf, filledCount, fmtNum, fmtRupiah, fmtValue, latestRow, periodeFull, qpassOverall, seriesFor, summarize,
    type QhsseData, type QhsseDimId,
} from '@/lib/qhsse';

const BIDANG_COLOR = { Quality: '#38bdf8', Safety: '#fb923c', Health: '#fb7185', Environment: '#34d399', Security: '#a78bfa' } as const;

/** Kerangka kartu: label bidang + judul di kiri atas, chip selisih di kanan atas. */
function Card({ dim, title, chip, className = '', children }: {
    dim: QhsseDimId; title?: string; chip?: ReactNode; className?: string; children: ReactNode;
}) {
    const d = QHSSE_DIMS.find(x => x.id === dim)!;
    return (
        <div className={`min-w-0 flex flex-col gap-2 p-3 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5 ${className}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: BIDANG_COLOR[d.bidang] }}>{d.bidang}</span>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white leading-snug">{title ?? d.short}</span>
                </div>
                {chip}
            </div>
            {children}
        </div>
    );
}

function Section({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <span className="w-1 h-3.5 rounded-full" style={{ background: color }} aria-hidden="true" />{title}
            </h4>
            <div className="grid grid-cols-2 gap-2.5">{children}</div>
        </section>
    );
}

const Big = ({ children, unit }: { children: ReactNode; unit?: string }) => (
    <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black font-mono leading-none text-slate-900 dark:text-white">{children}</span>
        {unit && <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{unit}</span>}
    </div>
);

const Foot = ({ children }: { children: ReactNode }) => (
    <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{children}</div>
);

export default function QhssePanel({ data }: { data?: QhsseData }) {
    const filled = filledCount(data);
    if (filled === 0) {
        return (
            <div className="p-8 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.05] dark:border-white/[0.05] text-center">
                <ShieldCheck className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-60" aria-hidden="true" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Belum ada data QHSSE</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Diisi PIC di halaman Detail Proyek</p>
            </div>
        );
    }

    const sum = (id: QhsseDimId) => summarize(id, data);
    const pts = (id: QhsseDimId, i = 0) => seriesFor(id, data)[i].points;
    const chip = (id: QhsseDimId, fmtDelta?: (d: number) => string) => {
        const s = sum(id);
        return <DeltaChip delta={s.delta} trend={s.trend} text={s.delta == null ? '' : (fmtDelta ?? ((d: number) => fmtNum(d, 2)))(s.delta)} />;
    };
    const trendColor = (id: QhsseDimId) => TREND[(sum(id).trend ?? 'flat') as Trend].color;
    const lastPeriode = (id: QhsseDimId) => { const p = sum(id).periode; return p ? periodeFull(p) : 'Belum ada data'; };

    const nc = latestRow(data?.nc);
    const qp = latestRow(data?.qpass);
    const r5 = latestRow(data?.r5);
    const ncTotal = nc?.totalNC ?? ((nc?.open ?? 0) + (nc?.closed ?? 0));
    const r5Dur = seriesFor('r5', data)[1].points;
    const r5DurDelta = deltaOf(r5Dur, false);
    const qpassOv = qp ? qpassOverall(qp) : undefined;
    const energi = sum('energi');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    QHSSE Proyek
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-black/10 dark:border-white/10">
                    {filled}/{QHSSE_DIMS.length} dimensi
                </span>
            </div>
            <p className="-mt-2 text-[11px] text-slate-500 dark:text-slate-400">Panah dibandingkan bulan lalu. Hijau berarti membaik, merah berarti memburuk.</p>

            {/* ── Quality ─────────────────────────────────────────────── */}
            <Section title="Quality" color={BIDANG_COLOR.Quality}>
                {/* NC Status: lebar penuh, bar open vs closed + grafik */}
                <Card dim="nc" title="NC Status" chip={chip('nc', d => fmtNum(d, 0))} className="col-span-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-end">
                        <div className="space-y-2">
                            <Big unit="NC open">{fmtValue('nc', sum('nc').latest)}</Big>
                            <div className="h-2.5 rounded-full overflow-hidden flex bg-black/[0.06] dark:bg-white/10" role="img" aria-label={`Closed ${nc?.closed ?? 0}, open ${nc?.open ?? 0}, total ${ncTotal}`}>
                                {ncTotal > 0 && <div className="h-full bg-emerald-500" style={{ width: `${((nc?.closed ?? 0) / ncTotal) * 100}%` }} />}
                                {ncTotal > 0 && <div className="h-full bg-rose-500" style={{ width: `${((nc?.open ?? 0) / ncTotal) * 100}%` }} />}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-emerald-500" aria-hidden="true" />Closed {nc?.closed ?? '-'}</span>
                                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-rose-500" aria-hidden="true" />Open {nc?.open ?? '-'}</span>
                                <span>Total {ncTotal || '-'}</span>
                            </div>
                        </div>
                        <div className="h-16"><QhsseSparkline points={pts('nc')} color={trendColor('nc')} fmt={v => fmtNum(v, 0)} /></div>
                    </div>
                    <Foot>{lastPeriode('nc')}</Foot>
                </Card>

                {/* Cost of NC */}
                <Card dim="cost" title="Cost of NC" chip={chip('cost', fmtRupiah)}>
                    <Big>{fmtValue('cost', sum('cost').latest)}</Big>
                    <div className="h-12"><QhsseSparkline points={pts('cost')} color={trendColor('cost')} fmt={v => fmtRupiah(v)} /></div>
                </Card>

                {/* QPASS: skor overall + bar per domain */}
                <Card dim="qpass" title="QPASS" chip={chip('qpass')}>
                    <Big>{fmtValue('qpass', qpassOv)}</Big>
                    <ul className="space-y-1.5">
                        {([['Str', qp?.struktur], ['Ars', qp?.arsitektur], ['MEP', qp?.mep]] as const).map(([l, v]) => (
                            <li key={l} className="flex items-center gap-2 text-[11px]">
                                <span className="w-7 font-bold text-slate-600 dark:text-slate-400">{l}</span>
                                <span className="flex-1 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                    <span className="block h-full rounded-full" style={{ width: `${Math.min(100, v ?? 0)}%`, background: ACCENT }} />
                                </span>
                                <span className="w-9 text-right font-mono font-bold text-slate-800 dark:text-slate-200">{v == null ? '-' : fmtNum(v, 1)}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            </Section>

            {/* ── Safety ──────────────────────────────────────────────── */}
            <Section title="Safety" color={BIDANG_COLOR.Safety}>
                <Card dim="trir" title="TRIR" chip={chip('trir')}>
                    <Big>{fmtValue('trir', sum('trir').latest)}</Big>
                    <div className="h-12"><QhsseSparkline points={pts('trir')} color={trendColor('trir')} fmt={v => fmtNum(v, 2)} /></div>
                    <Foot>Makin kecil makin baik</Foot>
                </Card>
                <Card dim="smk3l" title="Score SMK3L" chip={chip('smk3l')}>
                    <div className="flex items-center gap-3">
                        <ScoreRing value={sum('smk3l').latest} color={trendColor('smk3l')} label="Score SMK3L" />
                        <div className="min-w-0">
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">dari 100</div>
                            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{lastPeriode('smk3l')}</div>
                        </div>
                    </div>
                </Card>
            </Section>

            {/* ── Health, Environment & Security ──────────────────────── */}
            <Section title="Health, Environment & Security" color={BIDANG_COLOR.Environment}>
                {/* 5R: dua angka (jumlah & durasi) + dua garis */}
                <Card dim="r5" title="Giat Bersih 5R" chip={chip('r5', d => fmtNum(d, 0))} className="col-span-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jumlah laporan</div>
                            <Big unit="laporan">{fmtValue('r5', r5?.jumlah)}</Big>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Rata-rata durasi
                                <DeltaChip delta={r5DurDelta?.delta} trend={r5DurDelta?.trend} text={r5DurDelta ? fmtNum(r5DurDelta.delta, 1) : ''} />
                            </div>
                            <Big unit="menit">{fmtValue('r5', r5?.durasi)}</Big>
                        </div>
                    </div>
                    <QhsseTrendChart label="Giat Bersih 5R" series={seriesFor('r5', data)} fmt={v => fmtNum(v, 1)} />
                </Card>

                {/* Efisiensi energi: progress */}
                <Card dim="energi" title="Efisiensi Energi" chip={chip('energi', d => `${fmtNum(d, 1)}%`)}>
                    <Big>{fmtValue('energi', energi.latest)}</Big>
                    <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden" role="img" aria-label={`Kepatuhan ${energi.latest == null ? 'belum ada' : fmtNum(energi.latest, 1) + ' persen'}`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, energi.latest ?? 0)}%`, background: trendColor('energi') }} />
                    </div>
                    <Foot>Kepatuhan · {lastPeriode('energi')}</Foot>
                </Card>

                {/* PAK: batang bulanan */}
                <Card dim="pak" title="Jumlah PAK" chip={chip('pak', d => fmtNum(d, 0))}>
                    <Big unit="kasus">{fmtValue('pak', sum('pak').latest)}</Big>
                    <MiniBars points={pts('pak')} color={trendColor('pak')} className="h-14" />
                </Card>

                {/* Keamanan: lebar penuh, batang bulanan di samping angka */}
                <Card dim="keamanan" title="Penyimpangan Keamanan" chip={chip('keamanan', d => fmtNum(d, 0))} className="col-span-2">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 items-end">
                        <div>
                            <Big unit="kasus">{fmtValue('keamanan', sum('keamanan').latest)}</Big>
                            <Foot>{lastPeriode('keamanan')}</Foot>
                        </div>
                        <MiniBars points={pts('keamanan')} color={trendColor('keamanan')} className="h-14" />
                    </div>
                </Card>
            </Section>
        </div>
    );
}
