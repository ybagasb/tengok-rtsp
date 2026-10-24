"use client";

import type { ReactNode } from 'react';
import { CalendarDays, Receipt, TrendingUp, Truck, Wallet } from 'lucide-react';
import {
    cashflowSeries, huRencanaPeriode, kurvaSSeries, latestLaporan, periodeLabel,
    type LaporanBulanan, type RencanaKurvaS,
} from '@/lib/projectReport';
import { CashflowChart, HBar, HasilUsahaTable, SCurveChart, fRpShort } from '@/components/PanelCharts';

/**
 * Dashboard laporan bulanan untuk tab Ringkasan di halaman proyek.
 * Memakai komponen grafik yang sama dengan panel peta (PanelCharts) dan data
 * dari Laporan Bulanan: Kurva S, arus kas, hasil usaha, tagihan vs target, pengadaan.
 */
interface Props {
    project: {
        laporanBulanan?: LaporanBulanan[];
        rencanaKurvaS?: RencanaKurvaS[];
        contractValue?: number;
        tagihanBruto?: number;
    };
    canEdit: boolean;
    onGoLaporan: () => void;
}

const CARD = 'p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5';

function Card({ title, icon, aside, wide, children }: { title: string; icon: ReactNode; aside?: ReactNode; wide?: boolean; children: ReactNode }) {
    return (
        <section className={`${CARD} space-y-3 min-w-0 ${wide ? 'xl:col-span-2' : ''}`}>
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    {icon}{title}
                </h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

export default function DashboardRingkasan({ project, canEdit, onGoLaporan }: Props) {
    const latest = latestLaporan(project.laporanBulanan);

    if (!latest) {
        return (
            <div className={`${CARD} text-center py-8`}>
                <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold">Belum ada laporan bulanan untuk proyek ini.</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Grafik Kurva S, arus kas, hasil usaha, dan pengadaan tampil di sini setelah laporan diisi.</p>
                {canEdit && (
                    <button
                        type="button"
                        onClick={onGoLaporan}
                        className="mt-4 px-4 py-2.5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"
                    >
                        Isi Laporan Bulanan
                    </button>
                )}
            </div>
        );
    }

    const periodeText = periodeLabel(latest.periode);
    const kurvaS = kurvaSSeries(project);
    const cashflow = cashflowSeries(project.laporanBulanan);
    const huPlan = huRencanaPeriode(project.rencanaKurvaS, latest.periode);
    const sd = latest.huSdBulanIni;
    const hasHu = !!(latest.huBulanIni || sd);
    const margin = sd?.pendapatan && sd.pendapatan > 0 && sd.hpp != null ? ((sd.pendapatan - sd.hpp) / sd.pendapatan) * 100 : undefined;
    const tagihan = latest.tagihanBruto ?? project.tagihanBruto;
    const target = latest.targetTagihan;
    const pengadaan = latest.pengadaan;
    const showPengadaan = !!pengadaan && ((pengadaan.paketTotal ?? 0) > 0 || (pengadaan.paguTotal ?? 0) > 0);
    const showTagihan = tagihan != null && target != null && target > 0;
    const neto = cashflow ? cashflow.masuk - cashflow.keluar : 0;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 div-accent-text" aria-hidden="true" />
                    Dashboard Laporan · {periodeText}
                </h2>
                {canEdit && (
                    <button
                        type="button"
                        onClick={onGoLaporan}
                        className="px-3.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none"
                    >
                        Buka Laporan Bulanan
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {kurvaS && (
                    <Card
                        title={`Kurva S ${kurvaS.tahun}`}
                        icon={<TrendingUp className="w-4 h-4 div-accent-text" aria-hidden="true" />}
                        wide
                    >
                        <SCurveChart data={kurvaS} />
                    </Card>
                )}

                {cashflow && (
                    <Card
                        title={`Arus Kas Bulanan ${cashflow.tahun}`}
                        icon={<Wallet className="w-4 h-4 text-sky-400" aria-hidden="true" />}
                        aside={
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${neto >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'}`}>
                                Kumulatif {neto >= 0 ? '+' : '−'}{fRpShort(Math.abs(neto))}
                            </span>
                        }
                    >
                        <CashflowChart points={cashflow.points} tahun={cashflow.tahun} />
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                            <div>In s.d {periodeText}: <span className="font-black text-emerald-700 dark:text-emerald-400">{fRpShort(cashflow.masuk)}</span></div>
                            <div className="text-right">Out: <span className="font-black text-rose-700 dark:text-rose-400">{fRpShort(cashflow.keluar)}</span></div>
                        </div>
                    </Card>
                )}

                {hasHu && (
                    <Card
                        title="Hasil Usaha"
                        icon={<TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
                        aside={margin !== undefined ? (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${margin >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'}`}>
                                Margin kotor {margin.toFixed(2)}%
                            </span>
                        ) : undefined}
                    >
                        <HasilUsahaTable bulanIni={latest.huBulanIni} sdBulanIni={sd} rencana={huPlan} />
                    </Card>
                )}

                {(showTagihan || showPengadaan) && (
                    <Card
                        title={showTagihan && showPengadaan ? 'Tagihan & Pengadaan' : showTagihan ? 'Tagihan' : 'Pengadaan'}
                        icon={showTagihan ? <Receipt className="w-4 h-4 text-sky-400" aria-hidden="true" /> : <Truck className="w-4 h-4 text-sky-400" aria-hidden="true" />}
                        wide
                    >
                        <div className="space-y-4">
                            {showTagihan && (
                                <HBar
                                    label="Tagihan vs target"
                                    valueText={`${fRpShort(tagihan)} / ${fRpShort(target)} (${Math.round(((tagihan as number) / (target as number)) * 100)}%)`}
                                    fraction={(tagihan as number) / (target as number)}
                                    tone={(tagihan as number) >= (target as number) ? 'emerald' : 'sky'}
                                />
                            )}
                            {showPengadaan && pengadaan && (pengadaan.paketTotal ?? 0) > 0 && (
                                <HBar
                                    label="Jumlah paket"
                                    valueText={`${pengadaan.paketRealisasi ?? 0} / ${pengadaan.paketTotal} · sisa ${(pengadaan.paketTotal ?? 0) - (pengadaan.paketRealisasi ?? 0)}`}
                                    fraction={(pengadaan.paketRealisasi ?? 0) / (pengadaan.paketTotal as number)}
                                    tone="emerald"
                                />
                            )}
                            {showPengadaan && pengadaan && (pengadaan.paguTotal ?? 0) > 0 && (
                                <HBar
                                    label="Progres pagu"
                                    valueText={`${fRpShort(pengadaan.paguRealisasi ?? 0)} / ${fRpShort(pengadaan.paguTotal)} · sisa ${fRpShort((pengadaan.paguTotal ?? 0) - (pengadaan.paguRealisasi ?? 0))}`}
                                    fraction={(pengadaan.paguRealisasi ?? 0) / (pengadaan.paguTotal as number)}
                                    tone="sky"
                                />
                            )}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
