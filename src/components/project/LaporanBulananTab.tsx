"use client";

import { Fragment, useId, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Check, X, Plus, Trash2, Copy, ChevronDown } from 'lucide-react';
import {
    BULAN_SINGKAT, computeEvm, derivedFromLaporan, hppPersen, huRencanaPeriode, periodeLabel, periodeOf, periodeRange, prevPeriode, sortLaporan,
    type LaporanBulanan, type RencanaKurvaS,
} from '@/lib/projectReport';

// ── Satuan input ──────────────────────────────────────────────────────────────
// PIC mengetik dalam satuan pilihan (Rp / Juta / Miliar); disimpan sebagai IDR penuh.
type UnitKey = 'Rp' | 'Juta' | 'Miliar';
const UNITS: Record<UnitKey, number> = { Rp: 1, Juta: 1_000_000, Miliar: 1_000_000_000 };

function fmtRp(v?: number): string {
    if (v == null || !Number.isFinite(v)) return '-';
    const sign = v < 0 ? '-' : '';
    const a = Math.abs(v);
    const f = (n: number, d: number) => n.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
    if (a >= 1_000_000_000_000) return `${sign}Rp ${f(a / 1_000_000_000_000, 2)} T`;
    if (a >= 1_000_000_000) return `${sign}Rp ${f(a / 1_000_000_000, 2)} M`;
    if (a >= 1_000_000) return `${sign}Rp ${f(a / 1_000_000, 2)} Jt`;
    return `${sign}Rp ${f(a, 0)}`;
}

const parseNum = (s: string): number => {
    const t = s.trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
};
const toStr = (n: number) => String(Number(n.toFixed(6)));

// ── Definisi field ────────────────────────────────────────────────────────────
interface FieldSpec {
    path: string;            // path bertitik ke objek laporan, mis. 'evm.bcwp'
    label: string;           // label lengkap (pesan galat)
    short: string;           // label singkat di kartu/input
    kind: 'money' | 'count';
    signed?: boolean;        // boleh negatif
    hint?: string;
}
interface GroupSpec { id: string; title: string; desc?: string; fields: FieldSpec[]; huKey?: 'huBulanIni' | 'huSdBulanIni' }

const huFields = (key: string, title: string): FieldSpec[] => [
    { path: `${key}.pendapatan`, label: `${title} – Pendapatan`, short: 'Pendapatan', kind: 'money' },
    { path: `${key}.hpp`, label: `${title} – HPP`, short: 'HPP', kind: 'money', hint: 'Harga Pokok Penjualan. Persen HPP dihitung otomatis.' },
    { path: `${key}.ebitda`, label: `${title} – EBITDA`, short: 'EBITDA', kind: 'money', signed: true },
    { path: `${key}.labaBersih`, label: `${title} – Laba bersih`, short: 'Laba Bersih', kind: 'money', signed: true },
];

const GROUPS: GroupSpec[] = [
    {
        id: 'evm', title: 'Earned Value (EVM)',
        desc: 'Nilai kumulatif s.d periode. CPI, SPI, CV, SV dihitung otomatis.',
        fields: [
            { path: 'evm.bac', label: 'BAC', short: 'BAC', kind: 'money', hint: 'Budget At Completion: total anggaran biaya proyek.' },
            { path: 'evm.bcws', label: 'BCWS', short: 'BCWS', kind: 'money', hint: 'Planned Value: nilai pekerjaan yang direncanakan s.d periode.' },
            { path: 'evm.bcwp', label: 'BCWP', short: 'BCWP', kind: 'money', hint: 'Earned Value: nilai pekerjaan yang sudah dicapai s.d periode.' },
            { path: 'evm.acwp', label: 'ACWP', short: 'ACWP', kind: 'money', hint: 'Actual Cost: biaya aktual yang sudah keluar s.d periode.' },
        ],
    },
    {
        id: 'kurva', title: 'Kurva S – Realisasi Internal',
        desc: 'Nilai kumulatif realisasi internal (RI) s.d periode. Rencana RKAP/Eksternal diisi di tab Rencana Tahunan.',
        fields: [{ path: 'ri', label: 'Realisasi internal (RI)', short: 'RI kumulatif', kind: 'money' }],
    },
    { id: 'hu-bulan', title: 'Hasil Usaha – Bulan Ini', huKey: 'huBulanIni', fields: huFields('huBulanIni', 'Bulan ini') },
    { id: 'hu-sd', title: 'Hasil Usaha – s.d Bulan Ini', huKey: 'huSdBulanIni', fields: huFields('huSdBulanIni', 's.d bulan ini') },
    {
        id: 'cash', title: 'Cash Flow Bulan Ini',
        fields: [
            { path: 'cashIn', label: 'Cash in', short: 'Cash In', kind: 'money' },
            { path: 'cashOut', label: 'Cash out', short: 'Cash Out', kind: 'money' },
        ],
    },
    {
        id: 'tagihan', title: 'Tagihan',
        fields: [
            { path: 'tagihanBruto', label: 'Tagihan bruto', short: 'Tagihan Bruto', kind: 'money' },
            { path: 'targetTagihan', label: 'Target tagihan', short: 'Target Tagihan', kind: 'money' },
        ],
    },
    {
        id: 'pengadaan', title: 'Pengadaan',
        fields: [
            { path: 'pengadaan.paketTotal', label: 'Total paket', short: 'Total Paket', kind: 'count' },
            { path: 'pengadaan.paketRealisasi', label: 'Paket terealisasi', short: 'Paket Terealisasi', kind: 'count' },
            { path: 'pengadaan.paguTotal', label: 'Total pagu', short: 'Total Pagu', kind: 'money' },
            { path: 'pengadaan.paguRealisasi', label: 'Pagu terealisasi', short: 'Pagu Terealisasi', kind: 'money' },
        ],
    },
];
const ALL_FIELDS: FieldSpec[] = GROUPS.flatMap(g => g.fields);

type FormState = Record<string, string>;

function getPath(obj: unknown, path: string): number | undefined {
    let cur: unknown = obj;
    for (const k of path.split('.')) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[k];
    }
    return typeof cur === 'number' ? cur : undefined;
}
function setPath(obj: Record<string, unknown>, path: string, value: number) {
    const keys = path.split('.');
    let cur = obj;
    keys.slice(0, -1).forEach(k => {
        if (typeof cur[k] !== 'object' || cur[k] == null) cur[k] = {};
        cur = cur[k] as Record<string, unknown>;
    });
    cur[keys[keys.length - 1]] = value;
}

function entryToForm(entry: LaporanBulanan | undefined, unit: UnitKey): FormState {
    const f: FormState = {};
    for (const spec of ALL_FIELDS) {
        const v = getPath(entry, spec.path);
        f[spec.path] = v == null ? '' : spec.kind === 'money' ? toStr(v / UNITS[unit]) : String(v);
    }
    return f;
}

function formToData(form: FormState, unit: UnitKey): { data: Record<string, unknown>; invalid: string[] } {
    const data: Record<string, unknown> = {};
    const invalid: string[] = [];
    for (const spec of ALL_FIELDS) {
        const s = (form[spec.path] ?? '').trim();
        if (!s) continue;
        const n = parseNum(s);
        if (!Number.isFinite(n)) { invalid.push(spec.label); continue; }
        setPath(data, spec.path, spec.kind === 'money' ? Math.round(n * UNITS[unit]) : n);
    }
    return { data, invalid };
}

// Data yang relatif tetap antar bulan: aman disalin dari laporan sebelumnya.
const FIXED_PATHS = ['evm.bac', 'pengadaan.paketTotal', 'pengadaan.paguTotal'];
const HU_KEYS = ['pendapatan', 'hpp', 'ebitda', 'labaBersih'] as const;

/** Laporan sebelumnya: bulan tepat sebelumnya, atau yang terdekat sebelum periode. */
function findPrev(sorted: LaporanBulanan[], periode: string): LaporanBulanan | undefined {
    const key = prevPeriode(periode);
    return sorted.find(l => l.periode === key) ?? [...sorted].reverse().find(l => l.periode < periode);
}

/** Nilai s.d bulan lalu (IDR) untuk tahun yang sama; 0 bila awal tahun / belum ada. */
function prevSdBase(sorted: LaporanBulanan[], periode: string, k: typeof HU_KEYS[number]): number {
    const key = prevPeriode(periode);
    if (!key || key.slice(0, 4) !== periode.slice(0, 4)) return 0;
    return sorted.find(l => l.periode === key)?.huSdBulanIni?.[k] ?? 0;
}

/** Isi otomatis "s.d bulan ini" = s.d bulan lalu (tahun sama) + bulan ini. */
function applySd(form: FormState, unit: UnitKey, sorted: LaporanBulanan[], periode: string): FormState {
    const next = { ...form };
    for (const k of HU_KEYS) {
        const bulan = parseNum(form[`huBulanIni.${k}`] ?? '');
        next[`huSdBulanIni.${k}`] = Number.isFinite(bulan) ? toStr(prevSdBase(sorted, periode, k) / UNITS[unit] + bulan) : '';
    }
    return next;
}

/** Apakah s.d tersimpan sama dengan hitung otomatis? (menentukan mode awal saat edit) */
function isSdAuto(entry: LaporanBulanan | undefined, sorted: LaporanBulanan[]): boolean {
    if (!entry?.huSdBulanIni) return true;
    return HU_KEYS.every(k => {
        const bulan = entry.huBulanIni?.[k];
        const stored = entry.huSdBulanIni?.[k];
        if (bulan == null) return stored == null;
        return stored != null && Math.abs(stored - (prevSdBase(sorted, entry.periode, k) + bulan)) <= 1;
    });
}

const HU_LABEL: Record<typeof HU_KEYS[number], string> = { pendapatan: 'Pendapatan', hpp: 'HPP', ebitda: 'EBITDA', labaBersih: 'Laba Bersih' };

function entryFilled(e: LaporanBulanan): number {
    return ALL_FIELDS.filter(f => getPath(e, f.path) != null).length;
}

/**
 * Tafsirkan angka hasil tempel dari Excel. Mendukung "1.234,5" (id-ID),
 * "1,234.5" (en-US), dan simbol Rp/spasi. Satu pemisah tunggal dianggap desimal.
 */
function parsePasteNumber(raw: string): number | null {
    let t = raw.trim().replace(/[^\d.,-]/g, '');
    if (!t || t === '-') return null;
    const d = t.lastIndexOf('.');
    const c = t.lastIndexOf(',');
    if (d >= 0 && c >= 0) {
        const dec = d > c ? '.' : ',';
        const thou = dec === '.' ? ',' : '.';
        t = t.split(thou).join('').replace(dec, '.');
    } else if ((t.match(/[.,]/g) ?? []).length > 1) {
        t = t.replace(/[.,]/g, '');
    } else {
        t = t.replace(',', '.');
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

// Nilai kumulatif: biasanya tidak turun dari bulan ke bulan.
const CUMULATIVE_PATHS = new Set([
    'evm.bcws', 'evm.bcwp', 'evm.acwp', 'ri', 'huSdBulanIni.pendapatan', 'huSdBulanIni.hpp',
    'pengadaan.paketRealisasi', 'pengadaan.paguRealisasi',
]);

/** Peringatan lunak (tidak memblokir) untuk angka yang tampak salah satuan / salah isi. */
function fieldWarning(
    spec: FieldSpec, form: FormState, unit: UnitKey, prev: LaporanBulanan | undefined,
    periode: string, contractValue?: number,
): string | undefined {
    if (spec.kind !== 'money') return undefined;
    const raw = (form[spec.path] ?? '').trim();
    const n = parseNum(raw);
    if (!raw || !Number.isFinite(n)) return undefined;
    const v = n * UNITS[unit];
    const pv = getPath(prev, spec.path);
    if (pv != null && pv > 0 && v > 0) {
        const ratio = v / pv;
        if (ratio > 10 || ratio < 0.1) return `Jauh berbeda dari bulan lalu (${fmtRp(pv)}). Periksa satuan.`;
    }
    if (contractValue && contractValue > 0 && Math.abs(v) > contractValue * 5) {
        return `Lebih dari 5× nilai kontrak (${fmtRp(contractValue)}). Periksa satuan.`;
    }
    if (pv != null && v < pv && CUMULATIVE_PATHS.has(spec.path)) {
        const sameYear = !spec.path.startsWith('huSdBulanIni.') || prev?.periode.slice(0, 4) === periode.slice(0, 4);
        if (sameYear) return `Lebih kecil dari bulan lalu (${fmtRp(pv)}); nilai kumulatif biasanya naik.`;
    }
    return undefined;
}

/** Saring ketikan: angka, satu pemisah desimal, tanda minus di depan (bila boleh). */
function cleanTyping(raw: string, signed: boolean, decimal: boolean): string {
    let s = raw.replace(decimal ? /[^\d.,-]/g : /[^\d-]/g, '');
    const neg = signed && s.startsWith('-');
    s = s.replace(/-/g, '');
    if (decimal) {
        const m = /[.,]/.exec(s);
        if (m) {
            const i = m.index;
            s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '');
        }
    }
    return (neg ? '-' : '') + s;
}

// ── UI kecil ──────────────────────────────────────────────────────────────────
const LABEL_CLS = 'text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400';
const CTRL_CLS = 'w-full mt-1.5 px-3 py-2.5 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-sm font-mono outline-none focus:border-[rgba(var(--div-accent-rgb),0.5)]';
const FOCUS_CLS = 'focus-visible:ring-2 focus-visible:ring-[var(--div-accent)] focus-visible:outline-none';
const BTN_GHOST = `px-3.5 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 ${FOCUS_CLS}`;
const BTN_PRIMARY = `px-3.5 py-2.5 rounded-xl div-accent-solid hover:brightness-110 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 ${FOCUS_CLS}`;
const CARD_CLS = 'p-4 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-black/5 dark:border-white/5';

function NumField({ spec, value, onChange, unit, readOnly, warning }: { spec: FieldSpec; value: string; onChange: (v: string) => void; unit: UnitKey; readOnly?: boolean; warning?: string }) {
    const uid = useId();
    const n = parseNum(value);
    const money = spec.kind === 'money';
    const bad = value.trim() !== '' && !Number.isFinite(n);
    return (
        <div>
            <label htmlFor={uid} className={LABEL_CLS}>{spec.short}</label>
            <div className="relative">
                <input
                    id={uid}
                    type="text"
                    inputMode={spec.signed ? 'text' : 'decimal'}
                    value={value}
                    onChange={e => onChange(cleanTyping(e.target.value, !!spec.signed, money))}
                    placeholder="0"
                    aria-invalid={bad || undefined}
                    readOnly={readOnly}
                    title={spec.hint}
                    className={`${CTRL_CLS} ${money ? 'pr-14' : ''} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
                {money && <span className="absolute right-3 top-1/2 -translate-y-1/2 mt-[3px] text-[11px] font-bold text-slate-500 pointer-events-none">{unit}</span>}
            </div>
            {money && Number.isFinite(n) && value.trim() !== '' && (
                <p className="mt-1 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmtRp(n * UNITS[unit])}</p>
            )}
            {warning && <p role="status" className="mt-1 text-[11px] font-semibold text-orange-500">⚠ {warning}</p>}
            {spec.hint && <p className="mt-0.5 text-[11px] text-slate-500">{spec.hint}</p>}
        </div>
    );
}

function UnitPicker({ unit, onChange }: { unit: UnitKey; onChange: (u: UnitKey) => void }) {
    return (
        <div role="group" aria-label="Satuan input" className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/[0.04] dark:bg-white/5">
            <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Satuan</span>
            {(Object.keys(UNITS) as UnitKey[]).map(u => (
                <button
                    key={u}
                    type="button"
                    onClick={() => onChange(u)}
                    aria-pressed={unit === u}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${FOCUS_CLS} ${unit === u ? 'div-accent-solid text-slate-950' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'}`}
                >{u}</button>
            ))}
        </div>
    );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: 'good' | 'bad' | 'none' }) {
    const color = tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-rose-500' : 'text-slate-400';
    return (
        <div className={CARD_CLS}>
            <div className={LABEL_CLS}>{label}</div>
            <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
        </div>
    );
}

function EvmSummary({ evm }: { evm: ReturnType<typeof computeEvm> }) {
    const idx = (v?: number) => (v == null ? 'none' : v >= 1 ? 'good' : 'bad') as 'good' | 'bad' | 'none';
    const diff = (v?: number) => (v == null ? 'none' : v >= 0 ? 'good' : 'bad') as 'good' | 'bad' | 'none';
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Hasil hitung EVM">
            <KpiCard label="CPI" value={evm.cpi != null ? evm.cpi.toFixed(2) : '—'} hint="BCWP / ACWP · target ≥ 1" tone={idx(evm.cpi)} />
            <KpiCard label="SPI" value={evm.spi != null ? evm.spi.toFixed(2) : '—'} hint="BCWP / BCWS · target ≥ 1" tone={idx(evm.spi)} />
            <KpiCard label="CV" value={fmtRp(evm.cv).replace('-', '−')} hint="BCWP − ACWP" tone={diff(evm.cv)} />
            <KpiCard label="SV" value={fmtRp(evm.sv).replace('-', '−')} hint="BCWP − BCWS" tone={diff(evm.sv)} />
        </div>
    );
}

// ── Komponen utama ────────────────────────────────────────────────────────────
interface Props {
    projectId: string;
    laporan: LaporanBulanan[];
    rencana: RencanaKurvaS[];
    saldoAwal: { cashInAwal?: number; cashOutAwal?: number };
    contractValue?: number;
    isAdmin: boolean;
    onSaved: () => void;
    onGoContract: () => void;
    errorMessage: (err: unknown) => string;
}
type Section = 'bulanan' | 'rencana' | 'saldo';

export default function LaporanBulananTab(props: Props) {
    const [section, setSection] = useState<Section>('bulanan');
    return (
        <div className="space-y-5">
            <SetupCard {...props} onGoSection={setSection} />
            <div role="tablist" aria-label="Jenis data" className="inline-flex flex-wrap p-1 rounded-xl bg-black/[0.04] dark:bg-white/5 gap-1">
                {([['bulanan', 'Laporan Bulanan'], ['rencana', 'Rencana Tahunan'], ['saldo', 'Saldo Awal Kas']] as const).map(([id, label]) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={section === id}
                        onClick={() => setSection(id)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${FOCUS_CLS} ${section === id ? 'div-accent-solid text-slate-950' : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'}`}
                    >{label}</button>
                ))}
            </div>
            {section === 'bulanan' ? <BulananSection {...props} /> : section === 'rencana' ? <RencanaSection {...props} /> : <SaldoAwalSection {...props} />}
        </div>
    );
}

// ── Setup awal (sekali) ───────────────────────────────────────────────────────
function SetupCard({ rencana, saldoAwal, contractValue, isAdmin, onGoContract, onGoSection }: Props & { onGoSection: (s: Section) => void }) {
    const thisYear = new Date().getFullYear();
    const items = [
        {
            label: 'Nilai kontrak', done: (contractValue ?? 0) > 0, required: true,
            hint: 'Dipakai sebagai basis persen progres fisik.',
            action: isAdmin ? { label: 'Isi di tab Kontrak', run: onGoContract } : undefined,
        },
        {
            label: `Rencana tahunan ${thisYear}`, required: true,
            done: (rencana.find(r => r.tahun === thisYear)?.raRkap.length ?? 0) === 12,
            hint: 'Kurva S RA RKAP + rencana hasil usaha, diisi sekali setahun.',
            action: isAdmin ? { label: 'Isi rencana', run: () => onGoSection('rencana') } : undefined,
        },
        {
            label: 'Saldo awal kas', required: false,
            done: saldoAwal.cashInAwal !== undefined || saldoAwal.cashOutAwal !== undefined,
            hint: 'Opsional: hanya bila proyek sudah berjalan sebelum laporan bulanan pertama.',
            action: isAdmin ? { label: 'Isi saldo awal', run: () => onGoSection('saldo') } : undefined,
        },
    ];
    const requiredDone = items.filter(i => i.required).every(i => i.done);
    const [open, setOpen] = useState(!requiredDone);
    const uid = useId();

    return (
        <section aria-labelledby={uid} className={CARD_CLS}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className={`w-full flex items-center justify-between gap-3 text-left rounded-lg ${FOCUS_CLS}`}
            >
                <span id={uid} className="text-sm font-bold text-slate-900 dark:text-white">
                    {requiredDone ? '✓ Setup awal lengkap' : 'Setup awal (cukup sekali)'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
                <ul className="mt-3 space-y-2">
                    {items.map(i => (
                        <li key={i.label} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                                <span className={`font-bold ${i.done ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {i.done ? '✓' : '○'} {i.label}{!i.required && ' (opsional)'}
                                </span>
                                <span className="block text-[11px] text-slate-500">{i.hint}</span>
                            </div>
                            {!i.done && i.action && (
                                <button type="button" onClick={i.action.run} className={BTN_GHOST}>{i.action.label}</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

// ── Laporan bulanan ───────────────────────────────────────────────────────────
function BulananSection({ projectId, laporan, rencana, contractValue, isAdmin, onSaved, errorMessage }: Props) {
    const sorted = useMemo(() => sortLaporan(laporan), [laporan]);
    const currentMonth = periodeOf();
    const [periode, setPeriode] = useState<string>(() => sorted[sorted.length - 1]?.periode ?? currentMonth);
    const [unit, setUnit] = useState<UnitKey>('Juta');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<FormState>({});
    const [sdAuto, setSdAuto] = useState(true);
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
    const monthUid = useId();

    const entry = sorted.find(l => l.periode === periode);
    const prev = useMemo(() => findPrev(sorted, periode), [sorted, periode]);

    // Daftar periode: dari laporan pertama s.d bulan berjalan (atau laporan terbaru), lengkap dengan status.
    const options = useMemo(() => {
        const first = sorted[0]?.periode ?? currentMonth;
        const last = sorted[sorted.length - 1]?.periode ?? currentMonth;
        const list = periodeRange(first, last > currentMonth ? last : currentMonth);
        if (!list.includes(periode)) list.push(periode);
        return [...new Set(list)].sort().reverse();
    }, [sorted, periode, currentMonth]);
    const optionLabel = (p: string) => {
        const e = sorted.find(l => l.periode === p);
        const status = e ? `terisi ${entryFilled(e)}/${ALL_FIELDS.length}` : p < currentMonth ? 'belum diisi' : 'kosong';
        return `${periodeLabel(p)} · ${status}`;
    };
    const missing = useMemo(() => {
        if (sorted.length === 0) return [];
        return periodeRange(sorted[0].periode, currentMonth).filter(p => !sorted.some(l => l.periode === p)).reverse().slice(0, 6);
    }, [sorted, currentMonth]);

    /** Salin hanya data yang relatif tetap (BAC, total paket, total pagu) ke field yang masih kosong. */
    const fillFixed = (base: FormState, silent: boolean): FormState => {
        const src = findPrev(sorted, periode);
        if (!src) { if (!silent) toast.error('Belum ada laporan periode sebelumnya'); return base; }
        const fromSrc = entryToForm(src, unit);
        const next = { ...base };
        let n = 0;
        for (const path of FIXED_PATHS) {
            if (!(next[path] ?? '').trim() && fromSrc[path]) { next[path] = fromSrc[path]; n++; }
        }
        if (!silent) toast.success(n ? `Data tetap disalin dari ${periodeLabel(src.periode)}` : 'Data tetap sudah terisi');
        return next;
    };

    const filledIn = (g: GroupSpec) =>
        editing ? g.fields.filter(f => (form[f.path] ?? '').trim() !== '').length : g.fields.filter(f => getPath(entry, f.path) != null).length;

    const startEdit = () => {
        let f = entryToForm(entry, unit);
        if (!entry) f = fillFixed(f, true);
        const auto = isSdAuto(entry, sorted);
        setSdAuto(auto);
        f = auto ? applySd(f, unit, sorted, periode) : f;
        setForm(f);
        // Buka hanya blok yang belum lengkap; blok lengkap dilipat agar halaman tidak panjang.
        const m: Record<string, boolean> = {};
        for (const g of GROUPS) m[g.id] = g.fields.some(fld => (f[fld.path] ?? '').trim() === '');
        setOpenMap(m);
        setEditing(true);
    };
    const finishEdit = () => { setEditing(false); setOpenMap({}); };
    const setField = (path: string, v: string) =>
        setForm(f => {
            const next = { ...f, [path]: v };
            return sdAuto && path.startsWith('huBulanIni.') ? applySd(next, unit, sorted, periode) : next;
        });
    const toggleSdAuto = (auto: boolean) => {
        setSdAuto(auto);
        if (auto) setForm(f => applySd(f, unit, sorted, periode));
    };

    const changeUnit = (next: UnitKey) => {
        if (next === unit) return;
        setForm(prevForm => {
            const out: FormState = {};
            for (const spec of ALL_FIELDS) {
                const s = prevForm[spec.path] ?? '';
                const n = parseNum(s);
                out[spec.path] = spec.kind === 'money' && Number.isFinite(n) ? toStr((n * UNITS[unit]) / UNITS[next]) : s;
            }
            return out;
        });
        setUnit(next);
    };

    const warnings = useMemo(() => {
        const out: Record<string, string> = {};
        if (!editing) return out;
        for (const spec of ALL_FIELDS) {
            if (spec.path.startsWith('huSdBulanIni.') && sdAuto) continue;
            const w = fieldWarning(spec, form, unit, prev, periode, contractValue);
            if (w) out[spec.path] = w;
        }
        return out;
    }, [editing, form, unit, prev, periode, contractValue, sdAuto]);

    const save = async () => {
        const { data, invalid } = formToData(form, unit);
        if (invalid.length) { toast.error(`Angka tidak valid: ${invalid.join(', ')}`); return; }
        if (Object.keys(data).length === 0) { toast.error('Isi minimal satu angka sebelum menyimpan'); return; }
        const wc = Object.keys(warnings).length;
        if (wc > 0 && !window.confirm(`Ada ${wc} angka yang tampak janggal (lihat tanda oranye di form). Tetap simpan?`)) return;
        setSaving(true);
        try {
            await axios.put(`/api/projects/${projectId}/laporan`, { kind: 'bulanan', periode, data });
            toast.success(`Laporan ${periodeLabel(periode)} tersimpan`);
            finishEdit();
            onSaved();
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        if (!window.confirm(`Hapus laporan ${periodeLabel(periode)}? Tindakan ini tidak bisa dibatalkan.`)) return;
        setSaving(true);
        try {
            await axios.delete(`/api/projects/${projectId}/laporan`, { params: { kind: 'bulanan', periode } });
            toast.success('Laporan dihapus');
            const rest = sorted.filter(l => l.periode !== periode);
            setPeriode(rest[rest.length - 1]?.periode ?? currentMonth);
            onSaved();
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setSaving(false); }
    };

    // EVM hidup: dari form saat edit, dari data tersimpan saat baca.
    const evm = useMemo(() => {
        if (editing) {
            const { data } = formToData(form, unit);
            return computeEvm((data as { evm?: LaporanBulanan['evm'] }).evm);
        }
        return computeEvm(entry?.evm);
    }, [editing, form, unit, entry]);

    const huPlan = huRencanaPeriode(rencana, periode);

    return (
        <div className="space-y-5">
            {/* Pemilih periode + aksi */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor={`${monthUid}-sel`} className={LABEL_CLS}>Periode laporan</label>
                        <select
                            id={`${monthUid}-sel`}
                            value={periode}
                            disabled={editing}
                            onChange={e => setPeriode(e.target.value)}
                            className={`${CTRL_CLS} font-sans min-w-64 disabled:opacity-60`}
                        >
                            {options.map(p => (
                                <option key={p} value={p} className="bg-white dark:bg-slate-900">{optionLabel(p)}</option>
                            ))}
                        </select>
                    </div>
                    {isAdmin && !editing && (
                        <div>
                            <label htmlFor={`${monthUid}-new`} className={LABEL_CLS}>Periode lain</label>
                            <input
                                id={`${monthUid}-new`}
                                type="month"
                                value={periode}
                                min="2000-01"
                                max="2099-12"
                                onChange={e => { if (/^20\d{2}-\d{2}$/.test(e.target.value)) setPeriode(e.target.value); }}
                                className={`${CTRL_CLS} font-sans`}
                            />
                        </div>
                    )}
                </div>

                {isAdmin && (editing ? (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setForm(f => fillFixed(f, false))} className={BTN_GHOST} title="Menyalin BAC, total paket, dan total pagu dari laporan sebelumnya ke field yang masih kosong"><Copy className="w-3.5 h-3.5" aria-hidden="true" /> Salin data tetap</button>
                        <button type="button" onClick={finishEdit} className={BTN_GHOST}><X className="w-3.5 h-3.5" aria-hidden="true" /> Batal</button>
                        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Simpan
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        {entry && (
                            <button type="button" onClick={remove} disabled={saving} className={`${BTN_GHOST} hover:!text-rose-500`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Hapus</button>
                        )}
                        <button type="button" onClick={startEdit} className={entry ? BTN_GHOST : BTN_PRIMARY}>
                            {entry ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                            {entry ? 'Edit' : 'Isi laporan'}
                        </button>
                    </div>
                ))}
            </div>

            {/* Bulan yang belum dilaporkan */}
            {!editing && missing.length > 0 && (
                <div role="status" className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/25 text-xs text-slate-700 dark:text-slate-200">
                    <span className="font-bold">Belum dilaporkan:</span>
                    {missing.map(p => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => setPeriode(p)}
                            aria-pressed={p === periode}
                            className={`px-2.5 py-1 rounded-lg font-bold bg-black/[0.05] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 ${FOCUS_CLS}`}
                        >{periodeLabel(p)}</button>
                    ))}
                </div>
            )}

            {editing && <UnitPicker unit={unit} onChange={changeUnit} />}

            {!entry && !editing ? (
                <div className="py-14 px-4 text-center text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-sm">
                    {sorted.length === 0
                        ? 'Belum ada laporan bulanan untuk proyek ini.'
                        : `Laporan ${periodeLabel(periode)} belum diisi.`}
                    {!isAdmin && <p className="mt-1 text-xs">Hanya super-admin atau PIC proyek yang dapat mengisi laporan.</p>}
                </div>
            ) : (
                <>
                    <EvmSummary evm={evm} />
                    {GROUPS.map(g => {
                        const filled = filledIn(g);
                        const complete = filled === g.fields.length;
                        const open = openMap[g.id] ?? true;
                        const bodyId = `g-body-${g.id}`;
                        return (
                            <section key={g.id} aria-labelledby={`g-${g.id}`} className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => setOpenMap(m => ({ ...m, [g.id]: !open }))}
                                    aria-expanded={open}
                                    aria-controls={bodyId}
                                    className={`w-full flex items-center justify-between gap-3 text-left rounded-lg ${FOCUS_CLS}`}
                                >
                                    <span>
                                        <span id={`g-${g.id}`} className="block text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{g.title}</span>
                                        {g.desc && open && <span className="block text-[11px] font-normal normal-case tracking-normal text-slate-500 mt-0.5">{g.desc}</span>}
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${complete ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-500 border-black/10 dark:border-white/10'}`}>
                                            {complete ? '✓ ' : ''}{filled}/{g.fields.length}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    </span>
                                </button>
                                <div id={bodyId} hidden={!open} className="space-y-3">
                                    {editing ? (
                                        <>
                                            {g.huKey === 'huSdBulanIni' && (
                                                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={sdAuto}
                                                        onChange={e => toggleSdAuto(e.target.checked)}
                                                        className="w-4 h-4 accent-[var(--div-accent)]"
                                                    />
                                                    Hitung otomatis (s.d bulan lalu + bulan ini)
                                                </label>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                {g.fields.map(spec => (
                                                    <NumField
                                                        key={spec.path}
                                                        spec={spec}
                                                        unit={unit}
                                                        value={form[spec.path] ?? ''}
                                                        readOnly={g.huKey === 'huSdBulanIni' && sdAuto}
                                                        warning={warnings[spec.path]}
                                                        onChange={v => setField(spec.path, v)}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            {g.fields.map(spec => {
                                                const v = getPath(entry, spec.path);
                                                return (
                                                    <div key={spec.path} className={CARD_CLS}>
                                                        <div className={LABEL_CLS}>{spec.short}</div>
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white mt-1 break-words">
                                                            {v == null ? '-' : spec.kind === 'money' ? fmtRp(v) : v.toLocaleString('id-ID')}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {g.huKey && (() => {
                                                const hp = hppPersen(entry?.[g.huKey]);
                                                return (
                                                    <div className={CARD_CLS}>
                                                        <div className={LABEL_CLS}>HPP %</div>
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                                                            {hp == null ? '-' : `${hp.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    {/* Rencana hasil usaha: dibaca dari Rencana Tahunan, bukan diketik tiap bulan */}
                                    {g.huKey === 'huSdBulanIni' && (
                                        <div className="space-y-2">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rencana s.d {periodeLabel(periode)} (dari Rencana Tahunan)</div>
                                            {huPlan ? (
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                    {HU_KEYS.map(k => (
                                                        <div key={k} className={CARD_CLS}>
                                                            <div className={LABEL_CLS}>{HU_LABEL[k]}</div>
                                                            <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{fmtRp(huPlan[k])}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-500">Belum diisi untuk tahun {periode.slice(0, 4)}. Isi sekali di tab Rencana Tahunan.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                    {!editing && entry?.updatedAt && (
                        <p className="text-[11px] text-slate-500">
                            Terakhir disimpan: {new Date(entry.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}

// ── Rencana tahunan (Kurva S + hasil usaha) ───────────────────────────────────
type SeriesId = 'raRkap' | 'raEksternal' | 'huPendapatan' | 'huHpp' | 'huEbitda' | 'huLabaBersih';
interface SeriesSpec { id: SeriesId; label: string; block: 'kurva' | 'hu'; signed?: boolean }
const SERIES: SeriesSpec[] = [
    { id: 'raRkap', label: 'RA RKAP', block: 'kurva' },
    { id: 'raEksternal', label: 'RA Eksternal', block: 'kurva' },
    { id: 'huPendapatan', label: 'Pendapatan', block: 'hu' },
    { id: 'huHpp', label: 'HPP', block: 'hu' },
    { id: 'huEbitda', label: 'EBITDA', block: 'hu', signed: true },
    { id: 'huLabaBersih', label: 'Laba Bersih', block: 'hu', signed: true },
];
type RencanaForm = { puRkap: string; series: Record<SeriesId, string[]> };
const blank12 = () => Array<string>(12).fill('');
const emptyRencana = (): RencanaForm => ({
    puRkap: '',
    series: { raRkap: blank12(), raEksternal: blank12(), huPendapatan: blank12(), huHpp: blank12(), huEbitda: blank12(), huLabaBersih: blank12() },
});

function seriesValues(r: RencanaKurvaS | undefined, id: SeriesId): number[] {
    if (!r) return [];
    switch (id) {
        case 'raRkap': return r.raRkap;
        case 'raEksternal': return r.raEksternal;
        case 'huPendapatan': return r.huRencana?.pendapatan ?? [];
        case 'huHpp': return r.huRencana?.hpp ?? [];
        case 'huEbitda': return r.huRencana?.ebitda ?? [];
        case 'huLabaBersih': return r.huRencana?.labaBersih ?? [];
    }
}

function rencanaToForm(r: RencanaKurvaS | undefined, unit: UnitKey): RencanaForm {
    const f = emptyRencana();
    if (!r) return f;
    f.puRkap = r.puRkap != null ? toStr(r.puRkap / UNITS[unit]) : '';
    for (const s of SERIES) {
        const vals = seriesValues(r, s.id);
        f.series[s.id] = vals.length === 12 ? vals.map(v => toStr(v / UNITS[unit])) : blank12();
    }
    return f;
}

function RencanaSection({ projectId, laporan, rencana, isAdmin, onSaved, errorMessage }: Props) {
    const thisYear = new Date().getFullYear();
    const years = useMemo(() => {
        const set = new Set<number>([thisYear, thisYear + 1, ...rencana.map(r => r.tahun)]);
        laporan.forEach(l => set.add(Number(l.periode.slice(0, 4))));
        return [...set].sort((a, b) => b - a);
    }, [rencana, laporan, thisYear]);

    const [tahun, setTahun] = useState<number>(thisYear);
    const [unit, setUnit] = useState<UnitKey>('Juta');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<RencanaForm>(emptyRencana());
    const uid = useId();

    const current = rencana.find(r => r.tahun === tahun);
    const riByMonth = useMemo(() => {
        const out: (number | undefined)[] = Array(12).fill(undefined);
        laporan.forEach(l => {
            if (l.periode.startsWith(`${tahun}-`)) out[Number(l.periode.slice(5, 7)) - 1] = l.ri;
        });
        return out;
    }, [laporan, tahun]);

    const changeUnit = (next: UnitKey) => {
        if (next === unit) return;
        const conv = (s: string) => {
            const n = parseNum(s);
            return Number.isFinite(n) ? toStr((n * UNITS[unit]) / UNITS[next]) : s;
        };
        setForm(f => {
            const series = { ...f.series };
            for (const s of SERIES) series[s.id] = f.series[s.id].map(conv);
            return { puRkap: conv(f.puRkap), series };
        });
        setUnit(next);
    };

    const save = async () => {
        const toIdr = (s: string): number | null => {
            if (!s.trim()) return null;
            const n = parseNum(s);
            return Number.isFinite(n) ? Math.round(n * UNITS[unit]) : NaN;
        };
        const ser = (id: SeriesId) => (form.series[id].every(s => !s.trim()) ? [] : form.series[id].map(toIdr));
        const data = {
            tahun,
            puRkap: toIdr(form.puRkap),
            raRkap: ser('raRkap'),
            raEksternal: ser('raEksternal'),
            huRencana: { pendapatan: ser('huPendapatan'), hpp: ser('huHpp'), ebitda: ser('huEbitda'), labaBersih: ser('huLabaBersih') },
        };
        const all: (number | null)[] = [data.puRkap, ...data.raRkap, ...data.raEksternal, ...Object.values(data.huRencana).flat()];
        if (all.some(v => typeof v === 'number' && Number.isNaN(v))) { toast.error('Ada angka yang tidak valid'); return; }
        if (all.every(v => v == null)) { toast.error('Isi minimal satu angka sebelum menyimpan'); return; }
        setSaving(true);
        try {
            await axios.put(`/api/projects/${projectId}/laporan`, { kind: 'rencana', data });
            toast.success(`Rencana tahun ${tahun} tersimpan`);
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        if (!window.confirm(`Hapus rencana tahunan ${tahun}?`)) return;
        setSaving(true);
        try {
            await axios.delete(`/api/projects/${projectId}/laporan`, { params: { kind: 'rencana', tahun } });
            toast.success('Rencana dihapus');
            onSaved();
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setSaving(false); }
    };

    const setCell = (id: SeriesId, i: number, v: string) =>
        setForm(f => ({ ...f, series: { ...f.series, [id]: f.series[id].map((x, idx) => (idx === i ? v : x)) } }));

    /** Tempel dari Excel: satu baris → mengisi ke kanan; beberapa baris → mengisi seri di bawahnya. */
    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, sIdx: number, mIdx: number) => {
        const rows = e.clipboardData.getData('text').split(/\r?\n/).map(r => r.split('\t'));
        while (rows.length && rows[rows.length - 1].every(c => !c.trim())) rows.pop();
        if (rows.length === 0 || (rows.length === 1 && rows[0].length === 1)) return;   // tempel biasa 1 nilai
        e.preventDefault();
        setForm(f => {
            const series = { ...f.series };
            rows.forEach((cols, r) => {
                const sp = SERIES[sIdx + r];
                if (!sp) return;
                const arr = [...series[sp.id]];
                cols.forEach((c, k) => {
                    const idx = mIdx + k;
                    const n = parsePasteNumber(c);
                    if (idx > 11 || n === null || (n < 0 && !sp.signed)) return;
                    arr[idx] = toStr(n);
                });
                series[sp.id] = arr;
            });
            return { ...f, series };
        });
        toast.success('Data ditempel. Periksa angkanya, lalu simpan.');
    };

    const cellCls = 'w-24 px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-950/60 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs font-mono outline-none focus:border-[rgba(var(--div-accent-rgb),0.5)]';
    const stickyTh = 'text-left px-3 py-2 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-slate-100 dark:bg-slate-900';

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <label htmlFor={`${uid}-y`} className={LABEL_CLS}>Tahun</label>
                    <select
                        id={`${uid}-y`}
                        value={tahun}
                        disabled={editing}
                        onChange={e => setTahun(Number(e.target.value))}
                        className={`${CTRL_CLS} font-sans min-w-32 disabled:opacity-60`}
                    >
                        {years.map(y => <option key={y} value={y} className="bg-white dark:bg-slate-900">{y}{rencana.some(r => r.tahun === y) ? ' · terisi' : ''}</option>)}
                    </select>
                </div>
                {isAdmin && (editing ? (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}><X className="w-3.5 h-3.5" aria-hidden="true" /> Batal</button>
                        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Simpan
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        {current && <button type="button" onClick={remove} disabled={saving} className={`${BTN_GHOST} hover:!text-rose-500`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Hapus</button>}
                        <button type="button" onClick={() => { setForm(rencanaToForm(current, unit)); setEditing(true); }} className={current ? BTN_GHOST : BTN_PRIMARY}>
                            {current ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                            {current ? 'Edit' : 'Isi rencana'}
                        </button>
                    </div>
                ))}
            </div>

            {editing && <UnitPicker unit={unit} onChange={changeUnit} />}

            {!current && !editing ? (
                <div className="py-14 px-4 text-center text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-sm">
                    Rencana tahunan {tahun} belum diisi.
                    {!isAdmin && <p className="mt-1 text-xs">Hanya super-admin atau PIC proyek yang dapat mengisi rencana.</p>}
                </div>
            ) : (
                <>
                    <div className="max-w-xs">
                        {editing ? (
                            <NumField
                                spec={{ path: 'puRkap', label: 'Target PU RKAP', short: 'Target PU RKAP (setahun)', kind: 'money' }}
                                unit={unit}
                                value={form.puRkap}
                                onChange={v => setForm(f => ({ ...f, puRkap: v }))}
                            />
                        ) : (
                            <div className={CARD_CLS}>
                                <div className={LABEL_CLS}>Target PU RKAP (setahun)</div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{fmtRp(current?.puRkap)}</div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-500">
                        <p>Isi nilai <span className="font-bold">kumulatif</span> s.d akhir tiap bulan. Satu seri diisi lengkap 12 bulan, atau dikosongkan seluruhnya. Kurva S dan pendapatan/HPP tidak boleh turun.</p>
                        {editing && <p><span className="font-bold">Tempel dari Excel:</span> salin sel (satu baris atau beberapa baris) lalu Ctrl+V di sel mana pun. Baris tempel mengisi seri di bawahnya; satuan mengikuti pilihan di atas.</p>}
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-black/5 dark:border-white/5">
                        <table className="w-full text-xs">
                            <caption className="sr-only">Rencana tahunan {tahun}, nilai kumulatif per bulan</caption>
                            <thead>
                                <tr className="bg-black/[0.03] dark:bg-white/[0.03]">
                                    <th scope="col" className={stickyTh}>Seri</th>
                                    {BULAN_SINGKAT.map(b => <th key={b} scope="col" className="px-2 py-2 font-bold text-slate-600 dark:text-slate-300 text-right">{b}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {SERIES.map((sp, sIdx) => {
                                    const vals = seriesValues(current, sp.id);
                                    return (
                                        <Fragment key={sp.id}>
                                            {(sIdx === 0 || SERIES[sIdx - 1].block !== sp.block) && (
                                                <tr className="border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                                                    <th colSpan={13} scope="colgroup" className="text-left px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                        {sp.block === 'kurva' ? 'Kurva S (nilai kumulatif)' : 'Rencana Hasil Usaha (s.d akhir bulan)'}
                                                    </th>
                                                </tr>
                                            )}
                                            <tr className="border-t border-black/5 dark:border-white/5">
                                                <th scope="row" className={stickyTh}>{sp.label}</th>
                                                {Array.from({ length: 12 }, (_, i) => (
                                                    <td key={i} className="px-2 py-1.5 text-right">
                                                        {editing ? (
                                                            <input
                                                                type="text"
                                                                inputMode={sp.signed ? 'text' : 'decimal'}
                                                                aria-label={`${sp.label} ${BULAN_SINGKAT[i]} (${unit})`}
                                                                value={form.series[sp.id][i]}
                                                                onChange={e => setCell(sp.id, i, cleanTyping(e.target.value, !!sp.signed, true))}
                                                                onPaste={e => onPaste(e, sIdx, i)}
                                                                className={cellCls}
                                                            />
                                                        ) : (
                                                            <span className="font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                                {vals.length === 12 ? fmtRp(vals[i]) : '-'}
                                                            </span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                                <tr className="border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
                                    <th scope="row" className={stickyTh}>RI (dari laporan)</th>
                                    {riByMonth.map((v, i) => (
                                        <td key={i} className="px-2 py-2 text-right font-mono text-slate-500 whitespace-nowrap">{v == null ? '-' : fmtRp(v)}</td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Saldo awal kas ────────────────────────────────────────────────────────────
// Total cash in/out SEBELUM laporan bulanan pertama. Total berjalan di tab
// Finansial = saldo awal + jumlah arus kas semua laporan bulanan.
function SaldoAwalSection({ projectId, laporan, saldoAwal, isAdmin, onSaved, errorMessage }: Props) {
    const [unit, setUnit] = useState<UnitKey>('Juta');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const toF = (v: number | undefined, u: UnitKey) => (v == null ? '' : toStr(v / UNITS[u]));
    const [form, setForm] = useState({ cashInAwal: '', cashOutAwal: '' });

    const total = derivedFromLaporan({ laporanBulanan: laporan, cashInAwal: saldoAwal.cashInAwal, cashOutAwal: saldoAwal.cashOutAwal });
    const specs: { key: 'cashInAwal' | 'cashOutAwal'; spec: FieldSpec }[] = [
        { key: 'cashInAwal', spec: { path: 'cashInAwal', label: 'Cash in awal', short: 'Cash In Awal', kind: 'money', hint: 'Total uang masuk sejak proyek mulai sampai sebelum laporan bulanan pertama.' } },
        { key: 'cashOutAwal', spec: { path: 'cashOutAwal', label: 'Cash out awal', short: 'Cash Out Awal', kind: 'money', hint: 'Total uang keluar sejak proyek mulai sampai sebelum laporan bulanan pertama.' } },
    ];

    const changeUnit = (next: UnitKey) => {
        if (next === unit) return;
        const conv = (v: string) => { const n = parseNum(v); return Number.isFinite(n) ? toStr((n * UNITS[unit]) / UNITS[next]) : v; };
        setForm(f => ({ cashInAwal: conv(f.cashInAwal), cashOutAwal: conv(f.cashOutAwal) }));
        setUnit(next);
    };

    const save = async () => {
        const out: Record<string, number | null> = {};
        for (const { key, spec } of specs) {
            const v = form[key].trim();
            if (!v) { out[key] = null; continue; }
            const n = parseNum(v);
            if (!Number.isFinite(n)) { toast.error(`${spec.label} bukan angka`); return; }
            out[key] = Math.round(n * UNITS[unit]);
        }
        setSaving(true);
        try {
            await axios.put(`/api/projects/${projectId}/laporan`, { kind: 'saldoAwal', data: out });
            toast.success('Saldo awal kas tersimpan');
            setEditing(false);
            onSaved();
        } catch (err) { toast.error(errorMessage(err)); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs text-slate-500 max-w-xl">
                    Isi total cash in/out sejak proyek mulai sampai <span className="font-bold">sebelum</span> laporan bulanan pertama. Total di tab Finansial dihitung otomatis: saldo awal + arus kas semua laporan bulanan. Kosongkan (atau 0) bila laporan bulanan mulai dari awal proyek.
                </p>
                {isAdmin && (editing ? (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}><X className="w-3.5 h-3.5" aria-hidden="true" /> Batal</button>
                        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} Simpan
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => { setForm({ cashInAwal: toF(saldoAwal.cashInAwal, unit), cashOutAwal: toF(saldoAwal.cashOutAwal, unit) }); setEditing(true); }} className={BTN_GHOST}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                    </button>
                ))}
            </div>

            {editing && <UnitPicker unit={unit} onChange={changeUnit} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {specs.map(({ key, spec }) => editing ? (
                    <NumField key={key} spec={spec} unit={unit} value={form[key]} onChange={v => setForm(f => ({ ...f, [key]: v }))} />
                ) : (
                    <div key={key} className={CARD_CLS}>
                        <div className={LABEL_CLS}>{spec.short}</div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{fmtRp(saldoAwal[key])}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={CARD_CLS}>
                    <div className={LABEL_CLS}>Total Cash In (awal + laporan)</div>
                    <div className="text-sm font-bold text-emerald-500 mt-1">{total.cashIn !== undefined ? fmtRp(total.cashIn) : 'Menunggu laporan bulanan'}</div>
                </div>
                <div className={CARD_CLS}>
                    <div className={LABEL_CLS}>Total Cash Out (awal + laporan)</div>
                    <div className="text-sm font-bold text-rose-500 mt-1">{total.cashOut !== undefined ? fmtRp(total.cashOut) : 'Menunggu laporan bulanan'}</div>
                </div>
            </div>
        </div>
    );
}
