"use client";

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ClipboardCheck, Download, Files, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { PageHeader, SearchBar, LoadingState, EmptyState } from '@/components/admin/AdminUI';
import { containerVariants, cardVariants } from '@/components/admin/shared';
import { swrFetcher } from '@/lib/swrFetcher';
import {
    DIVISI_LIST, TOTAL_DIMENSI, dimensiBelumDiisi, formatWaktuWib, persen, ringkas, urutkanKurangTerisi,
    type DivisiKey, type PengisianResponse, type RingkasanPengisian,
} from '@/lib/pengisian';
import { unduhPdfPengisian } from '@/lib/pengisianPdf';

const labelDivisi = (d: DivisiKey) => `Divisi ${d.slice(-1)}`;
const nadaBar = (p: number) => (p >= 80 ? 'bg-emerald-500' : p >= 40 ? 'bg-amber-500' : 'bg-rose-500');
const MAX_CHIP = 3;

const btnBase =
    'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all min-h-11 disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = `${btnBase} bg-white/80 dark:bg-slate-900/80 border-black/10 dark:border-white/10 hover:border-yellow-500/30 text-slate-600 dark:text-slate-300 hover:text-yellow-800 dark:hover:text-yellow-400`;

type PengisianApiResponse = PengisianResponse & { scopedDivisi?: DivisiKey | null };

export default function PengisianProyekPage() {
    const { data, error, isLoading, isValidating, mutate } = useSWR<PengisianApiResponse>('/api/admin/pengisian', swrFetcher, {
        revalidateOnFocus: false,
    });
    const [aktifTab, setAktif] = useState<DivisiKey>('DIVISI 1');
    const scopedDivisi = data?.scopedDivisi ?? null;
    const visibleDivisiList: readonly DivisiKey[] = scopedDivisi ? [scopedDivisi] : DIVISI_LIST;
    const aktif = scopedDivisi ?? aktifTab;
    const [cari, setCari] = useState('');
    const [mengunduh, setMengunduh] = useState<DivisiKey | 'semua' | null>(null);

    const ringkasan = useMemo(
        () => Object.fromEntries(DIVISI_LIST.map(d => [d, ringkas(data?.divisi[d] ?? [])])) as Record<DivisiKey, RingkasanPengisian>,
        [data],
    );

    const baris = useMemo(() => {
        const urut = urutkanKurangTerisi(data?.divisi[aktif] ?? []);
        const q = cari.trim().toLowerCase();
        if (!q) return urut;
        return urut.filter(b => [b.name, b.fullName ?? '', b.category].some(t => t.toLowerCase().includes(q)));
    }, [data, aktif, cari]);

    // Selalu ambil data TERBARU tepat sebelum membuat PDF, supaya isi & cap waktunya akurat.
    const unduh = async (target: DivisiKey | 'semua') => {
        setMengunduh(target);
        try {
            const segar = await mutate();
            if (!segar) throw new Error('Data kosong');
            const daftar = target === 'semua' ? [...DIVISI_LIST] : [target];
            for (const d of daftar) {
                await unduhPdfPengisian({
                    divisi: d,
                    baris: segar.divisi[d],
                    dimensi: segar.dimensi,
                    generatedAt: segar.generatedAt,
                });
            }
            toast.success(daftar.length > 1 ? `${daftar.length} PDF berhasil diunduh` : `PDF ${labelDivisi(daftar[0])} berhasil diunduh`);
        } catch (e) {
            console.error('[pengisian] gagal membuat PDF', e);
            toast.error('Gagal membuat PDF. Coba segarkan data lalu ulangi.');
        } finally {
            setMengunduh(null);
        }
    };

    const sibuk = mengunduh !== null;

    return (
        <div className="min-h-full bg-slate-100 dark:bg-slate-950 p-6 md:p-10 pb-32 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                <PageHeader
                    icon={ClipboardCheck}
                    title="Pengisian Proyek"
                    subtitle={`Rekap kelengkapan data ${TOTAL_DIMENSI} dimensi tiap proyek per divisi. Unduh sebagai PDF kapan pun, datanya selalu diambil terbaru.`}
                    actions={
                        <div className="flex items-center gap-3 flex-wrap justify-end">
                            {!scopedDivisi && (
                                <button
                                    type="button"
                                    onClick={() => unduh('semua')}
                                    disabled={sibuk || !data}
                                    className={btnSecondary}
                                >
                                    {mengunduh === 'semua'
                                        ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                                        : <Files aria-hidden="true" className="w-4 h-4" />}
                                    Unduh Ketiganya
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => mutate()}
                                disabled={sibuk}
                                className="focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none min-w-11 min-h-11 inline-flex items-center justify-center p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                                title="Segarkan Data"
                                aria-label="Segarkan data pengisian"
                            >
                                <RefreshCw aria-hidden="true" className={`w-4 h-4 ${isValidating ? 'animate-spin motion-reduce:animate-none text-yellow-700 dark:text-yellow-500' : ''}`} />
                            </button>
                        </div>
                    }
                />

                {isLoading && <LoadingState message="Menghitung pengisian..." />}

                {error && !data && (
                    <div role="alert" className="flex items-center gap-3 p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm font-medium">
                        <AlertTriangle aria-hidden="true" className="w-5 h-5 shrink-0" />
                        <span>Gagal memuat rekap pengisian.</span>
                        <button type="button" onClick={() => mutate()} className="ml-auto underline font-bold focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded">
                            Coba lagi
                        </button>
                    </div>
                )}

                {data && (
                    <>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Data per {formatWaktuWib(data.generatedAt)} WIB
                        </p>

                        {data.tanpaDivisi > 0 && (
                            <div role="status" className="flex items-center gap-3 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm font-medium">
                                <AlertTriangle aria-hidden="true" className="w-5 h-5 shrink-0" />
                                {data.tanpaDivisi} proyek belum punya divisi sehingga tidak masuk laporan mana pun.
                            </div>
                        )}

                        {/* Kartu ringkasan per divisi */}
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="show"
                            role="group"
                            aria-label="Pilih divisi"
                            className={`grid grid-cols-1 ${visibleDivisiList.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-1 max-w-md'} gap-4`}
                        >
                            {visibleDivisiList.map(d => {
                                const r = ringkasan[d];
                                const dipilih = aktif === d;
                                return (
                                    <motion.div
                                        key={d}
                                        variants={cardVariants}
                                        className={`p-5 rounded-3xl border bg-gradient-to-br from-white/90 dark:from-slate-900/90 to-slate-200/50 dark:to-slate-900/40 shadow-lg transition-colors ${
                                            dipilih ? 'border-yellow-500/50 ring-1 ring-yellow-500/30' : 'border-black/10 dark:border-white/10'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setAktif(d)}
                                            aria-pressed={dipilih}
                                            className="w-full text-left focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none rounded-xl"
                                        >
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{labelDivisi(d)}</span>
                                                <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">{r.rata}%</span>
                                            </div>
                                            <div className="mt-3 h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                                <div className={`h-full rounded-full ${nadaBar(r.rata)}`} style={{ width: `${r.rata}%` }} />
                                            </div>
                                            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                                                <div>
                                                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Proyek</dt>
                                                    <dd className="text-sm font-bold font-mono text-slate-900 dark:text-white">{r.total}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Lengkap</dt>
                                                    <dd className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">{r.lengkap}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[11px] text-slate-500 dark:text-slate-400">Belum mulai</dt>
                                                    <dd className="text-sm font-bold font-mono text-rose-700 dark:text-rose-400">{r.belumMulai}</dd>
                                                </div>
                                            </dl>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => unduh(d)}
                                            disabled={sibuk || r.total === 0}
                                            className={`${btnSecondary} w-full mt-4`}
                                        >
                                            {mengunduh === d
                                                ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                                                : <Download aria-hidden="true" className="w-4 h-4" />}
                                            Unduh PDF {labelDivisi(d)}
                                        </button>
                                    </motion.div>
                                );
                            })}
                        </motion.div>

                        {/* Pratinjau divisi terpilih */}
                        <section aria-label={`Pratinjau pengisian ${labelDivisi(aktif)}`} className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    {labelDivisi(aktif)} <span className="text-slate-500 font-medium normal-case tracking-normal">({baris.length} proyek, paling sedikit terisi di atas)</span>
                                </h2>
                                <div className="sm:w-80">
                                    <SearchBar value={cari} onChange={setCari} placeholder="Cari proyek atau kategori..." />
                                </div>
                            </div>

                            {baris.length === 0 ? (
                                <EmptyState icon={ClipboardCheck} title="Tidak ada proyek" subtitle={cari ? 'Tidak ada yang cocok dengan pencarian.' : `Belum ada proyek di ${labelDivisi(aktif)}.`} />
                            ) : (
                                <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl">
                                    <table className="w-full text-sm">
                                        <caption className="sr-only">Pengisian data proyek {labelDivisi(aktif)}</caption>
                                        <thead>
                                            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-black/10 dark:border-white/10">
                                                <th scope="col" className="px-4 py-3 font-bold">Proyek</th>
                                                <th scope="col" className="px-4 py-3 font-bold whitespace-nowrap">Terisi</th>
                                                <th scope="col" className="px-4 py-3 font-bold hidden md:table-cell">Belum diisi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {baris.map(b => {
                                                const p = persen(b);
                                                const kosong = dimensiBelumDiisi(b);
                                                return (
                                                    <tr key={b.id} className="border-b last:border-b-0 border-black/5 dark:border-white/5 align-top">
                                                        <td className="px-4 py-3 min-w-56">
                                                            <div className="font-bold text-slate-900 dark:text-white">{b.name}</div>
                                                            {b.fullName && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">{b.fullName}</div>}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <div className="flex items-center gap-2.5 w-36">
                                                                <div className="flex-1 h-2 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                                                                    <div className={`h-full rounded-full ${nadaBar(p)}`} style={{ width: `${p}%` }} />
                                                                </div>
                                                                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{b.terisi}/{TOTAL_DIMENSI}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 hidden md:table-cell">
                                                            {kosong.length === 0 ? (
                                                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Lengkap</span>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1.5" title={kosong.join(', ')}>
                                                                    {kosong.slice(0, MAX_CHIP).map(k => (
                                                                        <span key={k} className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">{k}</span>
                                                                    ))}
                                                                    {kosong.length > MAX_CHIP && (
                                                                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-500 dark:text-slate-400">+{kosong.length - MAX_CHIP} lagi</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
