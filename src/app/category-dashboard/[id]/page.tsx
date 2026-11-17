"use client";

/**
 * Dashboard "model RRB" — /category-dashboard/[id].
 *
 * Menampilkan dimensi fisik/keuangan/profitabilitas gaya RRB untuk sekumpulan
 * proyek (Location), dikelompokkan per section (divisi atau kategori) sesuai
 * konfigurasi di src/lib/categoryDashboards.ts. SEMUA data ditarik dari data
 * proyek yang SUDAH ADA (progress fisik, kontrak, laporan bulanan) + field
 * pelengkap (DIPA, MC cair, cut-off) via toProgramView. Tidak ada input khusus
 * dashboard — PIC mengisi lewat Detail Proyek di sidebar peta biasa.
 *
 * Akses: semua yang login (viewer PIN & SSO) — /api/locations GET pakai requireAuth.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Layers, Wallet, Gauge, Target, TrendingUp, ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import axios from "axios";
import { getDivisionCssVars } from "@/lib/divisionTheme";
import { usePageTracking } from "@/hooks/usePageTracking";
import { fRpShort } from "@/components/PanelCharts";
import { dashboardById, type CategoryDashboardSection } from "@/lib/categoryDashboards";
import { toProgramView, type ProgramView, type ProgramSource } from "@/lib/programDim";

interface LocItem extends ProgramSource {
  _id: string;
  category: string;
  division?: string;
}

function rp(v?: number): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}
function pct(v?: number): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
/** Persen dengan tanda + untuk nilai positif; "—" bila kosong. */
function signedPct(v?: number): string {
  const t = pct(v);
  return v !== undefined && v !== null && Number.isFinite(v) && v >= 0 ? `+${t}` : t;
}
function tgl(v?: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

interface SectionData { label: string; division?: string; category?: string; rows: { id: string; view: ProgramView }[] }

export default function CategoryDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const config = dashboardById(id);
  usePageTracking(`category-dashboard-${id}`);

  const [items, setItems] = useState<LocItem[]>([]);
  const [loading, setLoading] = useState(!!config);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!config) return;
    let active = true;
    (async () => {
      try {
        // Satu permintaan per section (filter divisi+kategori). Dedup di bawah.
        const results = await Promise.all(
          config.sections.map((s) =>
            axios.get("/api/locations", { params: { ...(s.division ? { division: s.division } : {}), ...(s.category ? { category: s.category } : {}) } })
          )
        );
        if (!active) return;
        const seen = new Set<string>();
        const all: LocItem[] = [];
        for (const r of results) {
          const data: LocItem[] = r.data?.success && Array.isArray(r.data.data) ? r.data.data : [];
          for (const it of data) {
            if (!seen.has(it._id)) { seen.add(it._id); all.push(it); }
          }
        }
        setItems(all);
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [config]);

  const sections: SectionData[] = useMemo(() => {
    if (!config) return [];
    const match = (it: LocItem, s: CategoryDashboardSection) =>
      (!s.division || it.division === s.division) && (!s.category || it.category === s.category);
    return config.sections.map((s) => ({
      label: s.label,
      division: s.division,
      category: s.category,
      rows: items.filter((it) => match(it, s)).map((it) => ({ id: it._id, view: toProgramView(it) })),
    }));
  }, [items, config]);

  const totals = useMemo(() => {
    let renc = 0, real = 0;
    for (const sec of sections) for (const r of sec.rows) {
      renc += r.view.fisikRencana.rupiah ?? 0;
      real += r.view.fisikRealisasi.rupiah ?? 0;
    }
    const dev = real - renc;
    const devPct = renc > 0 ? (dev / renc) * 100 : undefined;
    return { renc, real, dev, devPct };
  }, [sections]);

  if (!config) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center text-slate-500 dark:bg-[#070d18] dark:text-slate-400">
        <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden="true" />
        <p className="text-sm font-semibold">Dashboard tidak ditemukan.</p>
        <Link href="/categories" className="rounded-xl border border-black/10 bg-black/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-wider dark:border-white/10 dark:bg-white/5">
          Ke Kategori
        </Link>
      </div>
    );
  }

  const cssVars = getDivisionCssVars(config.themeDivision) as React.CSSProperties;
  const grandTotal = sections.reduce((a, s) => a + s.rows.length, 0);

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-[#070d18] dark:text-white" style={cssVars}>
      <div className="w-full px-4 py-6 sm:px-6 lg:px-10 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={config.backHref}
            className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-black/[0.04] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 transition-colors hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Kembali
          </Link>
          <span className="rounded-full border border-[rgba(var(--div-accent-rgb),0.3)] bg-[rgba(var(--div-accent-rgb),0.12)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] div-accent-text">
            Dashboard {config.label}
          </span>
        </div>

        <header className="mb-8">
          <h1 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{config.label}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {config.description ?? "Rekap dimensi data program"}
            {!loading && !error && <span className="font-mono font-bold"> · {grandTotal} proyek</span>}
          </p>
        </header>

        {loading ? (
          <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white/70 py-16 text-center dark:border-white/10 dark:bg-slate-900/50">
            <AlertCircle className="h-8 w-8 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-semibold">Gagal memuat data.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <TotalCard label="Total Rencana" value={rp(totals.renc)} sub={`${grandTotal} proyek`} icon={Target} tone="sky" />
              <TotalCard
                label="Total Realisasi"
                value={rp(totals.real)}
                sub={totals.renc > 0 ? `${pct((totals.real / totals.renc) * 100)} dari rencana` : undefined}
                icon={TrendingUp}
                tone="emerald"
              />
              <TotalCard
                label="Deviasi"
                value={`${totals.dev >= 0 ? "+" : ""}${rp(totals.dev)}`}
                sub={totals.devPct != null ? `${totals.devPct >= 0 ? "+" : ""}${pct(totals.devPct)}` : undefined}
                icon={totals.dev >= 0 ? ArrowUpRight : ArrowDownRight}
                tone={totals.dev >= 0 ? "emerald" : "rose"}
              />
            </div>

            <div className="space-y-6">
              {sections.map((s) => (
                <SectionBlock key={s.label} section={s} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: SectionData }) {
  const totalDipa = section.rows.reduce((a, r) => a + (r.view.dipaTersedia ?? 0), 0);
  const realValues = section.rows.map((r) => r.view.fisikRealisasi.percent).filter((v): v is number => v != null && Number.isFinite(v));
  const avgReal = realValues.length ? realValues.reduce((a, b) => a + b, 0) / realValues.length : undefined;

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white/80 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10"
        style={{ background: `linear-gradient(90deg, rgba(var(--div-accent-rgb),0.14), transparent)` }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg div-accent-solid text-sm font-black text-slate-950">
            {section.label.charAt(0)}
          </span>
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] div-accent-text">{section.category ? "Kategori" : "Divisi"}</p>
            <h2 className="text-sm font-black uppercase leading-tight tracking-tight sm:text-base">{section.label}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stat icon={Layers} label="Proyek" value={String(section.rows.length)} />
          <Stat icon={Wallet} label="Total Dipa" value={rp(totalDipa)} />
          <Stat icon={Gauge} label="Rata² Realisasi" value={pct(avgReal)} />
        </div>
      </div>

      {section.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Belum ada proyek untuk {section.label}.
        </p>
      ) : (
        <ProgramTable division={section.division} category={section.category} rows={section.rows} />
      )}
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white/70 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
      <Icon className="h-3.5 w-3.5 div-accent-text" aria-hidden="true" />
      <div className="leading-tight">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
        <div className="font-mono text-xs font-black">{value}</div>
      </div>
    </div>
  );
}

function TotalCard({ label, value, sub, icon: Icon, tone }: {
  label: string; value: string; sub?: string; icon: LucideIcon; tone: "sky" | "emerald" | "rose";
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/12"
    : tone === "rose" ? "text-rose-600 dark:text-rose-400 bg-rose-500/12"
    : "text-sky-600 dark:text-sky-400 bg-sky-500/12";
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/[0.06] dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneCls}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 font-mono text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function ProgramTable({ division, category, rows }: { division?: string; category?: string; rows: { id: string; view: ProgramView }[] }) {
  const mapHref = `/map${division ? `?division=${encodeURIComponent(division)}${category ? `&category=${encodeURIComponent(category)}` : ""}` : ""}`;
  const thGroup = "border-l border-black/10 px-2 py-2 text-center font-black div-accent-text dark:border-white/10";
  const thSub = "px-2 py-2 text-center font-bold";
  const thSubL = "border-l border-black/10 px-2 py-2 text-center font-bold dark:border-white/10";
  return (
    <table className="w-full table-fixed border-collapse text-left text-[11px]">
      <colgroup>
        <col className="w-[14%]" />
        <col className="w-[9%]" />
        {Array.from({ length: 12 }, (_, i) => <col key={i} className="w-[6.4%]" />)}
      </colgroup>
      <thead>
        <tr className="bg-black/[0.03] text-[10px] uppercase tracking-wider text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
          <th rowSpan={2} className="px-3 py-2 text-left font-black align-middle">Proyek</th>
          <th rowSpan={2} className="border-l border-black/10 px-2 py-2 text-center font-black align-middle dark:border-white/10">Target</th>
          <th colSpan={3} className={thGroup}>Progress Fisik</th>
          <th colSpan={3} className={thGroup}>Progress Keuangan</th>
          <th colSpan={3} className={thGroup} title="Progress internal: rencana internal (RBP) lawan realisasi internal (RI), dalam persen nilai kontrak">Progress Internal</th>
          <th colSpan={3} className={thGroup}>Profitabilitas (R / R)</th>
        </tr>
        <tr className="bg-black/[0.02] text-[10px] uppercase tracking-wider text-slate-500 dark:bg-white/[0.02] dark:text-slate-400">
          <th className={thSubL}>Rencana</th>
          <th className={thSub}>Realisasi</th>
          <th className={thSub}>Deviasi</th>
          <th className={thSubL}>Dipa</th>
          <th className={thSub}>MC Cair</th>
          <th className={thSub}>Tagihan</th>
          <th className={thSubL} title="Rencana Internal s.d. bulan laporan terakhir (Rencana Tahunan)">RBP</th>
          <th className={thSub} title="Realisasi internal: pendapatan s.d. bulan laporan terakhir (Hasil Usaha)">RI</th>
          <th className={thSub}>Deviasi</th>
          <th className={thSubL}>BL</th>
          <th className={thSub}>BAU</th>
          <th className={thSub}>L/R</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map(({ id, view: v }, idx) => {
          const devPositive = (v.fisikDeviasi.percent ?? 0) >= 0;
          return (
            <tr
              key={id}
              className={`border-t border-black/[0.06] align-top transition-colors hover:bg-[rgba(var(--div-accent-rgb),0.07)] dark:border-white/[0.06] ${idx % 2 ? "bg-black/[0.015] dark:bg-white/[0.015]" : ""}`}
            >
              <td className="px-3 py-2.5">
                <Link href={`${mapHref}${mapHref.includes("?") ? "&" : "?"}project=${encodeURIComponent(id)}`} className="font-sans text-xs font-bold leading-tight text-slate-900 hover:underline dark:text-white" title="Buka peta proyek">
                  {v.name}
                </Link>
              </td>
              <Cell
                top={tgl(v.targetDate)}
                bottom={sisaHariText(v.sisaHari)}
                bottomCls={sisaHariCls(v.sisaHari)}
                bottom2={v.cutOffLabel ? `cut-off ${v.cutOffLabel}` : undefined}
                border
                small
              />
              <Cell top={pct(v.fisikRencana.percent)} bottom={fRpShort(v.fisikRencana.rupiah)} border />
              <Cell top={pct(v.fisikRealisasi.percent)} bottom={fRpShort(v.fisikRealisasi.rupiah)} highlight />
              <Cell
                top={signedPct(v.fisikDeviasi.percent)}
                bottom={fRpShort(v.fisikDeviasi.rupiah)}
                tone={devPositive ? "emerald" : "rose"}
              />
              <Cell top={fRpShort(v.dipaTersedia)} border />
              <Cell top={fRpShort(v.mcCair)} bottom={v.mcCairLabel} />
              <Cell top={fRpShort(v.tagihanBruto)} />
              <Cell top={pct(v.internalRencana.percent)} bottom={fRpShort(v.internalRencana.rupiah)} border />
              <Cell top={pct(v.internalRealisasi.percent)} bottom={fRpShort(v.internalRealisasi.rupiah)} highlight />
              <Cell
                top={signedPct(v.internalDeviasi.percent)}
                bottom={fRpShort(v.internalDeviasi.rupiah)}
                tone={v.internalDeviasi.percent === undefined ? undefined : v.internalDeviasi.percent >= 0 ? "emerald" : "rose"}
              />
              <Cell top={pct(v.bl.rencana)} bottom={pct(v.bl.realisasi)} border pair />
              <Cell top={pct(v.bau.rencana)} bottom={pct(v.bau.realisasi)} pair />
              <Cell top={pct(v.labaRugi.rencana)} bottom={pct(v.labaRugi.realisasi)} pair />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function sisaHariText(n?: number): string | undefined {
  if (n === undefined) return undefined;
  if (n < 0) return `lewat ${Math.abs(n)} hari`;
  if (n === 0) return "hari ini";
  return `sisa ${n} hari`;
}
function sisaHariCls(n?: number): string | undefined {
  if (n === undefined) return undefined;
  if (n < 0) return "font-bold text-rose-600 dark:text-rose-400";
  if (n <= 30) return "font-bold text-amber-600 dark:text-amber-400";
  return undefined;
}

function Cell({ top, bottom, bottomCls, bottom2, border = false, highlight = false, tone, pair = false, small = false }: {
  top: string; bottom?: string; bottomCls?: string; bottom2?: string; border?: boolean; highlight?: boolean; tone?: "emerald" | "rose"; pair?: boolean; small?: boolean;
}) {
  const toneCls = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "rose" ? "text-rose-600 dark:text-rose-400" : "";
  return (
    <td className={`px-2 py-2.5 text-center ${border ? "border-l border-black/10 dark:border-white/10" : ""}`}>
      <span className={`block font-bold ${small ? "text-[11px]" : ""} ${highlight ? "div-accent-text" : toneCls}`}>{top}</span>
      {bottom && (
        <span className={`block text-[10px] ${bottomCls ?? (pair ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400")}`}>{bottom}</span>
      )}
      {bottom2 && <span className="block text-[10px] text-slate-500 dark:text-slate-400">{bottom2}</span>}
    </td>
  );
}
