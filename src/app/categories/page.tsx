"use client";

/**
 * Halaman Kategori (utama) — sekuens intro 3D gaya game:
 *  Fase 'hq'     : gedung holografik kantor pusat berputar (klik untuk lanjut).
 *  Fase 'split'  : 3 model divisi muncul di scene; kartu pilih di bawah.
 *  Fase 'detail' : kamera terbang ke divisi; panel level muncul (Langkah 4).
 *
 *  Langkah 2: Scene Three.js terpadu (IntroScene3D) menggantikan BrantasBuilding3D
 *  terpisah. Satu canvas persisten di belakang semua UI. Kamera lerp + parallax
 *  dikelola di dalam IntroScene3D.
 *
 * Semua kontrol header (Panduan, Tema, Profil/Logout, Management+PIN) dipertahankan.
 * Tidak menyentuh auth, API, model DB.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  LogOut,
  Settings,
  X,
  ShieldAlert,
  User,
  BookOpen,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import useSWR from "swr";
import { usePageTracking } from "@/hooks/usePageTracking";
import ThemeToggle from "@/components/ThemeToggle";
import { DIVISION_THEME, type DivisionKey } from "@/lib/divisionTheme";
import type { IntroScene3DProps } from "@/components/intro/IntroScene3D";

// Lazy-load IntroScene3D (Three.js tidak boleh SSR)
const IntroScene3D = dynamic<IntroScene3DProps>(
  () => import("@/components/intro/IntroScene3D"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#070d18]">
        <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
      </div>
    ),
  }
);

const ORDER: DivisionKey[] = ["DIVISI 1", "DIVISI 2", "DIVISI 3"];
const DIV_COLORS = ORDER.map((d) => DIVISION_THEME[d].accentHex);
const INTRO_KEY = "tengok_intro_seen_v1";

interface DivisionCategory {
  _id?: string;
  name: string;
  identifier: string;
  description?: string;
  projectCount?: number;
  cameraTotal?: number;
  cameraOnline?: number;
}

interface DivisionData {
  division: DivisionKey;
  projectCount: number;
  cameraTotal?: number;
  cameraOnline?: number;
  categories: DivisionCategory[];
}

type StatusTier = "good" | "warn" | "bad" | "none";

function statusTier(total?: number, online?: number): StatusTier {
  const tot = total ?? 0;
  const on = online ?? 0;
  if (tot === 0) return "none";
  const ratio = on / tot;
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.3) return "warn";
  return "bad";
}

function statusTierColor(tier: StatusTier, defaultColor: string): string {
  switch (tier) {
    case "good":
      return "#22c55e";
    case "warn":
      return "#f59e0b";
    case "bad":
      return "#ef4444";
    case "none":
    default:
      return defaultColor;
  }
}

const FALLBACK_LEVELS: Record<DivisionKey, DivisionCategory[]> = {
  "DIVISI 1": [
    { name: "Gedung Perkantoran & Pemerintahan", identifier: "gedung" },
    { name: "Gedung Hijau & Komersial", identifier: "gedung-hijau" },
    { name: "Mekanikal & Elektrikal", identifier: "me" },
    { name: "Bandara & Pembangkit", identifier: "bandara" },
  ],
  "DIVISI 2": [
    { name: "Bendungan & Waduk", identifier: "bendungan" },
    { name: "Jaringan Irigasi", identifier: "irigasi" },
    { name: "Pengendalian Banjir & Kanal", identifier: "banjir" },
    { name: "Terowongan & Reklamasi", identifier: "terowongan" },
  ],
  "DIVISI 3": [
    { name: "Tol Cisumdawu Seksi 5B & 6B", identifier: "tol" },
    { name: "Jalan Seredala–Dekai, Papua", identifier: "jalan" },
    { name: "Jembatan & Flyover", identifier: "jembatan" },
    { name: "Sistem Transportasi & Jalur Rel", identifier: "transportasi" },
  ],
};

export default function CategoriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [phaseReady, setPhaseReady] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);

  // Inisialisasi fase: cek sessionStorage (intro sekali per sesi) & ?div= dari URL (SSR-safe)
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reduced") === "1" || params.get("motion") === "0") {
        setForceReduced(true);
        console.log("[Intro3D] Mode reduced-motion diaktifkan via parameter URL.");
      }

      const hasSeenIntro = sessionStorage.getItem(INTRO_KEY) === "true";
      const divParam = params.get("div");
      const matchedIdx = divParam ? ORDER.indexOf(divParam as DivisionKey) : -1;

      if (!hasSeenIntro) {
        // Belum pernah lihat intro -> jalankan alur lengkap dari gedung HQ
        setPhase("hq");
        setSelectedDiv(-1);
      } else if (matchedIdx >= 0) {
        // Sudah lihat intro & ada parameter ?div= valid -> langsung panel detail divisi
        setPhase("detail");
        setSelectedDiv(matchedIdx);
      } else {
        // Sudah lihat intro & tanpa parameter ?div= -> langsung fase split (pilih divisi)
        setPhase("split");
        setSelectedDiv(-1);
      }
      setPhaseReady(true);
    }
  }, []);

  const isReduced = mounted ? forceReduced : false;
  const { data: session } = useSession();
  usePageTracking("categories");

  // Gating UI tombol Management: hanya super-admin.
  const accessFetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data: accessData } = useSWR(
    session?.user ? "/api/me/access" : null,
    accessFetcher
  );
  const isSuperAdmin = accessData?.isSuperAdmin === true;

  // Data divisi & kategori dari DB (di-cache oleh SWR, polling tiap 30 detik untuk update status kamera)
  const { data: divisionsRes } = useSWR<{ success: boolean; data: DivisionData[] }>(
    "/api/divisions",
    accessFetcher,
    { refreshInterval: 30000 }
  );
  const dbDivisions = divisionsRes?.data || [];

  // Status CCTV per divisi (urutan sesuai ORDER) untuk dikirim ke scene 3D
  const divisionStatus = ORDER.map((divKey) => {
    const d = dbDivisions.find((x) => x.division === divKey);
    return {
      total: d?.cameraTotal ?? 0,
      online: d?.cameraOnline ?? 0,
    };
  });

  // ── Sekuens 3D ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"hq" | "explode" | "split" | "detail">("hq");
  const [selectedDiv, setSelectedDiv] = useState(-1);
  const [hoveredDiv, setHoveredDiv] = useState(-1);
  const [flash, setFlash] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);

  const onBuildingClick = useCallback(() => {
    if (phase !== "hq") return;
    console.log(
      `[Intro3D] onBuildingClick dipanggil. isReduced: ${isReduced}`
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 90);
    // Jalankan fase explode (IntroScene3D)
    setPhase("explode");
  }, [phase, isReduced]);

  const onExplodeComplete = useCallback(() => {
    console.log("[Intro3D] onExplodeComplete dipanggil -> beralih ke fase 'split'");
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(INTRO_KEY, "true");
      } catch {
        // ignore
      }
    }
    setPhase("split");
  }, []);

  const onDivisionClick = useCallback(
    (i: number) => {
      if (phase !== "split") return;
      const divKey = ORDER[i];
      console.log(`[Intro3D] onDivisionClick dipanggil: ${divKey} (index ${i}) -> beralih ke fase 'detail'`);
      setSearchQuery("");
      setShowAllCategories(false);
      setSelectedDiv(i);
      setPhase("detail");
      router.replace(`/categories?div=${encodeURIComponent(divKey)}`);
    },
    [phase, router]
  );

  const handleBackToSplit = useCallback(() => {
    setSearchQuery("");
    setShowAllCategories(false);
    setPhase("split");
    setSelectedDiv(-1);
    router.replace("/categories");
  }, [router]);

  const handleReplayIntro = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(INTRO_KEY);
      } catch {
        // ignore
      }
    }
    setSearchQuery("");
    setShowAllCategories(false);
    setPhase("hq");
    setSelectedDiv(-1);
    setHoveredDiv(-1);
    router.replace("/categories");
  }, [router]);

  const handleLevelClick = useCallback(
    (divisionKey: DivisionKey, categoryIdentifier?: string) => {
      if (categoryIdentifier) {
        router.push(
          `/map?division=${encodeURIComponent(divisionKey)}&category=${encodeURIComponent(
            categoryIdentifier
          )}`
        );
      } else {
        router.push(`/map?division=${encodeURIComponent(divisionKey)}`);
      }
    },
    [router]
  );

  // Esc key listener untuk kembali ke fase split saat di fase detail
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "detail") {
          handleBackToSplit();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, handleBackToSplit]);

  const onDivisionHover = useCallback(
    (i: number) => {
      setHoveredDiv(i);
    },
    []
  );

  // ── Profil / Logout / PIN management ──────────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogout = async () => {
    setShowProfile(false);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(INTRO_KEY);
      } catch {
        // ignore
      }
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await signOut({ redirect: false });
      window.location.href = "/api/auth/federated-logout";
    } catch {
      window.location.href = "/login";
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  useEffect(() => {
    if (!pin.every((digit) => digit !== "")) return;
    if (isVerifyingPin) return;
    const enteredPin = pin.join("");
    setIsVerifyingPin(true);
    axios
      .post("/api/auth/verify", { pin: enteredPin })
      .then(() => {
        toast.success("Akses Diterima");
        router.push("/admin");
      })
      .catch(() => {
        toast.error("PIN Salah");
        setPin(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        setIsVerifyingPin(false);
      });
  }, [pin, router, isVerifyingPin]);

  return (
    <div className="relative h-screen overflow-hidden bg-[#070d18] text-white select-none">
      {/* Scanline overlay & HUD corner brackets (persis prototipe) */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)",
        }}
      />
      <span className="pointer-events-none absolute top-2.5 left-2.5 w-6 h-6 border-t-2 border-l-2 border-amber-500/70 z-20" />
      <span className="pointer-events-none absolute top-2.5 right-2.5 w-6 h-6 border-t-2 border-r-2 border-amber-500/70 z-20" />
      <span className="pointer-events-none absolute bottom-2.5 left-2.5 w-6 h-6 border-b-2 border-l-2 border-amber-500/70 z-20" />
      <span className="pointer-events-none absolute bottom-2.5 right-2.5 w-6 h-6 border-b-2 border-r-2 border-amber-500/70 z-20" />

      {/* Flash putih singkat saat gedung pecah (persis prototipe) */}
      <div
        className="pointer-events-none fixed inset-0 z-50 bg-white transition-opacity duration-150"
        style={{ opacity: flash ? 0.7 : 0 }}
      />

      {/* Canvas Three.js — absolut penuh layar, di belakang semua UI */}
      <div className="absolute inset-0 z-0">
        {phaseReady && (
          <IntroScene3D
            phase={phase}
            selectedDiv={selectedDiv}
            hoveredDiv={hoveredDiv}
            divisionColors={DIV_COLORS}
            divisionStatus={divisionStatus}
            reducedMotion={isReduced}
            onBuildingClick={onBuildingClick}
            onExplodeComplete={onExplodeComplete}
            onDivisionClick={onDivisionClick}
            onDivisionHover={onDivisionHover}
            className="absolute inset-0"
          />
        )}
      </div>

      {/* Header — z-30, semi-transparan di atas canvas */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-4 sm:px-10 py-4 sm:py-5 shrink-0 bg-[#070d18]/60 backdrop-blur-md border-b border-white/5">
        {/* Logo + Title + Status Online */}
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <img
            src="/abipraya_original.svg"
            alt="Brantas Abipraya"
            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0"
          />
          <div className="leading-tight min-w-0">
            <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-400 to-amber-300 bg-clip-text text-transparent truncate">
              Brantas Abipraya
            </p>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 truncate">
              Project Management Information System
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 ml-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold tracking-[0.18em] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e] animate-pulse" />
            SISTEM ONLINE
          </div>
        </div>

        {/* Actions */}
        <div className="relative flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Putar ulang intro 3D (hanya saat fase split/detail) */}
          {phase !== "hq" && (
            <button
              onClick={handleReplayIntro}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer font-['Orbitron',sans-serif]"
              title="Putar ulang intro gedung 3D (reset intro)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Putar Intro</span>
            </button>
          )}

          {/* Toggle tema */}
          <ThemeToggle />

          {/* Panduan pengguna (PDF) */}
          <a
            href="/Panduan-Input-Detail-Proyek.pdf"
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center justify-center gap-1.5 text-slate-400 hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/5 backdrop-blur border border-white/5 hover:border-yellow-500/30 group"
            title="Unduh Panduan Pengisian Detail Proyek (PDF)"
          >
            <BookOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
              Panduan
            </span>
          </a>

          {/* SSO User Profile */}
          {session?.user && (
            <div className="relative">
              <button
                onClick={() => setShowProfile((p) => !p)}
                className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl bg-white/5 backdrop-blur border border-white/5 hover:border-yellow-500/30 transition-all"
                title={session.user.name || "Profil"}
              >
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || ""}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-yellow-500/30"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-[11px] font-bold text-slate-900 shrink-0">
                    {session.user.name?.charAt(0)?.toUpperCase() || (
                      <User className="w-3.5 h-3.5" />
                    )}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-[11px] font-bold text-white leading-tight truncate max-w-[120px]">
                    {session.user.name}
                  </p>
                  <p className="text-[9px] text-slate-400 leading-tight truncate max-w-[120px]">
                    {session.user.email}
                  </p>
                </div>
              </button>

              <AnimatePresence>
                {showProfile && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowProfile(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[260px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden"
                    >
                      <div className="p-4 border-b border-white/10 flex items-center gap-3">
                        {session.user.image ? (
                          <img
                            src={session.user.image}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-sm font-bold text-slate-900 shrink-0">
                            {session.user.name?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {session.user.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {session.user.email}
                          </p>
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wider">
                            <ShieldAlert className="w-2.5 h-2.5" /> SSO
                          </span>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-sm font-semibold"
                        >
                          <LogOut className="w-4 h-4" />
                          Keluar / Logout
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Management (super-admin) */}
          {session?.user && isSuperAdmin && (
            <button
              onClick={() => setShowPinModal(true)}
              className="flex items-center justify-center gap-1.5 text-slate-400 hover:text-yellow-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/5 backdrop-blur border border-white/5 hover:border-yellow-500/30 group"
              title="Management"
            >
              <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
              <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
                Management
              </span>
            </button>
          )}

          {/* Logout untuk non-SSO (PIN viewer) */}
          {!session?.user && (
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 text-slate-400 hover:text-red-400 transition-all p-2 sm:px-4 sm:py-2.5 rounded-xl bg-white/5 backdrop-blur border border-white/5 hover:border-red-500/30 group"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
                Logout
              </span>
            </button>
          )}
        </div>
      </header>

      {/* ── Phase UI overlay (absolut atas canvas) ─────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {phase === "hq" ? (
          <motion.div
            key="hq-ui"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20, transition: { duration: 0.3 } }}
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center justify-end pb-[9vh] gap-2 pointer-events-auto text-center px-4"
            style={{ paddingBottom: "calc(9vh + env(safe-area-inset-bottom, 0px))" }}
          >
            <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-[0.14em] text-white drop-shadow-[0_0_24px_rgba(245,158,11,0.5)]">
              KANTOR PUSAT
            </h1>
            <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-slate-400">
              PT BRANTAS ABIPRAYA (PERSERO)
            </p>
            <button
              onClick={onBuildingClick}
              className="mt-3 px-6 sm:px-8 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.8)] active:scale-95 cursor-pointer"
              style={{
                clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
              }}
            >
              KLIK GEDUNG · MULAI ▶
            </button>
          </motion.div>
        ) : phase === "split" ? (
          <motion.div
            key="split-ui"
            initial={isReduced ? false : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.6 }}
            className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-3 sm:px-6 pb-4 sm:pb-6"
            style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Judul */}
            <motion.div
              initial={isReduced ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-center mb-1"
            >
              <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight">
                Pilih{" "}
                <span className="bg-gradient-to-r from-yellow-400 to-amber-300 bg-clip-text text-transparent">
                  Divisi
                </span>
              </h1>
              <p className="text-[10px] text-slate-500 tracking-wider">
                Klik model atau kartu untuk masuk
              </p>
            </motion.div>

            {/* Kartu 3 divisi (grid max-w-[1100px], min-h-[96px], persis spesifikasi V2) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-[1100px]">
              {ORDER.map((div, i) => {
                const t = DIVISION_THEME[div];
                const isHov = hoveredDiv === i;
                const divData = dbDivisions.find((d) => d.division === div);
                const pCount = divData?.projectCount ?? 0;
                const cCount = divData?.categories?.length ?? FALLBACK_LEVELS[div].length;
                const camTot = divData?.cameraTotal ?? 0;
                const camOn = divData?.cameraOnline ?? 0;
                const tier = statusTier(camTot, camOn);
                const tierColor = statusTierColor(tier, t.accentHex);

                return (
                  <motion.button
                    key={div}
                    onClick={() => onDivisionClick(i)}
                    onMouseEnter={() => setHoveredDiv(i)}
                    onMouseLeave={() => setHoveredDiv(-1)}
                    initial={isReduced ? false : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: isHov ? -8 : 0 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="group min-h-[96px] text-left p-3.5 sm:p-4 backdrop-blur-md border border-white/10 transition-all flex flex-col justify-between cursor-pointer"
                    style={{
                      background: "rgba(15,23,42,.78)",
                      borderTop: `3px solid ${t.accentHex}`,
                      clipPath: "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)",
                      boxShadow: isHov ? `0 0 28px -4px ${t.accentHex}` : undefined,
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] font-mono"
                          style={{ color: t.accentHex }}
                        >
                          {t.short}
                        </span>
                        <div
                          className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity font-mono uppercase"
                          style={{ color: t.accentHex }}
                        >
                          MASUK <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                      <h3 className="mt-1 text-sm md:text-base font-black uppercase tracking-tight text-white leading-tight">
                        {t.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 leading-snug hidden sm:block line-clamp-2">
                        {t.tagline}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/10 flex flex-col gap-1 text-[10px] sm:text-[11px] text-slate-300 font-mono font-medium">
                      <div className="flex items-center justify-between">
                        <span>
                          {pCount} proyek · {cCount} kategori
                        </span>
                        <span className="sm:hidden text-[10px] font-bold" style={{ color: t.accentHex }}>
                          MASUK ▶
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-slate-400">
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${tier === "good" && !isReduced ? "animate-pulse" : ""}`}
                          style={{ backgroundColor: tierColor }}
                        />
                        <span>
                          {camTot === 0 ? "Belum ada kamera" : `${camOn}/${camTot} kamera online`}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : phase === "detail" && selectedDiv >= 0 ? (
          (() => {
            const currentDivKey = ORDER[selectedDiv];
            const currentTheme = DIVISION_THEME[currentDivKey];
            const currentDivData = dbDivisions.find((d) => d.division === currentDivKey);
            const levelItems =
              currentDivData?.categories && currentDivData.categories.length > 0
                ? currentDivData.categories
                : FALLBACK_LEVELS[currentDivKey];

            // 1. Urutkan kategori berdasarkan jumlah proyek terbanyak menurun
            const sortedItems = [...levelItems].sort(
              (a, b) => (b.projectCount || 0) - (a.projectCount || 0)
            );
            const maxProjectCount = Math.max(
              1,
              ...sortedItems.map((c) => c.projectCount || 0)
            );
            const totalProjects =
              currentDivData?.projectCount ??
              sortedItems.reduce((acc, c) => acc + (c.projectCount || 0), 0);

            // 2. Filter pencarian bila query diisi
            const isSearching = searchQuery.trim().length > 0;
            const filteredItems = isSearching
              ? sortedItems.filter((c) =>
                  c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
                )
              : sortedItems;

            // 3. Tampilkan 5 teratas bila tidak mencari dan belum toggle 'lihat semua'
            const displayedItems =
              isSearching || showAllCategories
                ? filteredItems
                : filteredItems.slice(0, 5);
            const remainingCount = filteredItems.length - 5;

            return (
              <motion.div
                key="detail-ui"
                initial={isReduced ? false : { opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30, transition: { duration: 0.25 } }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="absolute z-20 bottom-0 sm:bottom-auto top-auto sm:top-20 left-0 sm:left-auto right-0 sm:right-8 w-full sm:w-[440px] max-w-[100vw] sm:max-w-[440px] max-h-[82vh] sm:max-h-[calc(100vh-100px)] flex flex-col p-4 sm:p-6 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-t-2xl sm:rounded-2xl"
                style={{
                  background: "rgba(15,23,42,0.92)",
                  borderLeft: `4px solid ${currentTheme.accentHex}`,
                  boxShadow: `0 0 35px -8px ${currentTheme.accentHex}50`,
                  paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                }}
              >
                {/* ── Area Atas Sticky / Fixed ──────────────────────────────── */}
                <div className="shrink-0">
                  {/* Handle indikator mobile sheet */}
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 sm:hidden" />

                  {/* Tombol Back */}
                  <button
                    onClick={handleBackToSplit}
                    className="flex items-center gap-2 px-3 py-1.5 mb-3 text-[11px] font-bold tracking-[0.18em] uppercase border border-white/20 text-slate-300 hover:text-white hover:border-white/50 bg-white/5 hover:bg-white/10 transition-all cursor-pointer font-['Orbitron',sans-serif]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    KEMBALI (ESC)
                  </button>

                  {/* Header: Kode Divisi, Judul & Subtitle proyek */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <small
                        className="font-bold text-[11px] uppercase tracking-[0.22em] font-['Orbitron',sans-serif]"
                        style={{ color: currentTheme.accentHex }}
                      >
                        {currentTheme.short}
                      </small>
                      {/* Lencana status CCTV divisi */}
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-slate-200">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusTier(currentDivData?.cameraTotal, currentDivData?.cameraOnline) === "good" && !isReduced ? "animate-pulse" : ""}`}
                          style={{
                            backgroundColor: statusTierColor(
                              statusTier(currentDivData?.cameraTotal, currentDivData?.cameraOnline),
                              currentTheme.accentHex
                            ),
                          }}
                        />
                        <span>
                          {(currentDivData?.cameraTotal ?? 0) === 0
                            ? "Belum ada kamera"
                            : `${currentDivData?.cameraOnline ?? 0}/${currentDivData?.cameraTotal} online`}
                        </span>
                      </div>
                    </div>
                    <h2 className="mt-0.5 text-lg sm:text-2xl font-black uppercase tracking-tight text-white font-['Orbitron',sans-serif]">
                      {currentTheme.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-300 font-['Rajdhani',sans-serif] flex items-center gap-1.5 font-medium">
                      <span className="font-mono font-bold text-white">{totalProjects} proyek</span>
                      <span className="text-slate-500">·</span>
                      <span>urut dari proyek terbanyak</span>
                    </p>
                  </div>

                  {/* Tombol Utama Paling Atas: SEMUA PROYEK DIVISI INI · N ▶ */}
                  <button
                    onClick={() => handleLevelClick(currentDivKey)}
                    className="w-full flex items-center justify-between px-4 py-3 mb-3.5 font-['Orbitron',sans-serif] font-black text-xs sm:text-sm tracking-wider uppercase transition-all shadow-lg hover:brightness-110 active:scale-[0.99] cursor-pointer"
                    style={{
                      background: currentTheme.accentHex,
                      color: "#070d18",
                      clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span>SEMUA PROYEK DIVISI INI</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-black/25 text-black font-bold rounded">
                        {totalProjects}
                      </span>
                    </span>
                    <span className="font-mono text-xs">MASUK ▶</span>
                  </button>

                  {/* Kolom Pencarian (Tampil bila kategori > 8) */}
                  {sortedItems.length > 8 && (
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari kategori..."
                        className="w-full pl-9 pr-8 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-white/30 transition-all font-['Rajdhani',sans-serif] font-medium"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          title="Hapus pencarian"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Bar Header Kategori */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 font-['Orbitron',sans-serif]">
                      {isSearching ? "HASIL PENCARIAN" : "PILIH LEVEL / KATEGORI"}
                    </span>
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 font-mono">
                      {filteredItems.length} Kategori
                    </span>
                  </div>
                </div>

                {/* ── Daftar Kategori (Area Scroll Mandiri) ────────────────── */}
                <div className="flex-1 overflow-y-auto overscroll-contain pr-1 space-y-2 min-h-0">
                  {displayedItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-['Rajdhani',sans-serif]">
                      Tidak ada kategori yang cocok dengan &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    displayedItems.map((cat, idx) => {
                      const pCount = cat.projectCount ?? 0;
                      const barPercent = Math.min(
                        100,
                        Math.max(4, Math.round((pCount / maxProjectCount) * 100))
                      );

                      return (
                        <button
                          key={cat.identifier || idx}
                          onClick={() => handleLevelClick(currentDivKey, cat.identifier)}
                          className="group relative overflow-hidden w-full flex items-center gap-3 px-3.5 py-2.5 sm:py-3 text-left bg-white/[0.04] hover:bg-white/[0.12] border border-white/10 transition-all cursor-pointer rounded-lg"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = currentTheme.accentHex;
                            e.currentTarget.style.transform = "translateX(-3px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                            e.currentTarget.style.transform = "none";
                          }}
                        >
                          {/* Nomor urut */}
                          <span
                            className="font-bold text-xs font-['Orbitron',sans-serif] shrink-0"
                            style={{ color: currentTheme.accentHex }}
                          >
                            {String(idx + 1).padStart(2, "0")}
                          </span>

                          {/* Nama & Jumlah Proyek + Chip CCTV */}
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-xs sm:text-sm font-bold text-white group-hover:text-yellow-300 transition-colors truncate font-['Rajdhani',sans-serif]">
                              {cat.name}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span>{pCount} proyek</span>
                              {(cat.cameraTotal ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-300">
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusTier(cat.cameraTotal, cat.cameraOnline) === "good" && !isReduced ? "animate-pulse" : ""}`}
                                    style={{
                                      backgroundColor: statusTierColor(
                                        statusTier(cat.cameraTotal, cat.cameraOnline),
                                        currentTheme.accentHex
                                      ),
                                    }}
                                  />
                                  <span>
                                    {cat.cameraOnline ?? 0}/{cat.cameraTotal}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Aksi Masuk */}
                          <span
                            className="ml-auto flex items-center gap-1 font-bold text-[10px] tracking-[0.15em] shrink-0 font-['Orbitron',sans-serif]"
                            style={{ color: currentTheme.accentHex }}
                          >
                            MASUK{" "}
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </span>

                          {/* Bar Tipis Proporsi Proyek di Dasar Baris */}
                          <div
                            className="absolute bottom-0 left-0 h-[2.5px] transition-all opacity-80 group-hover:opacity-100"
                            style={{
                              width: `${barPercent}%`,
                              backgroundColor: currentTheme.accentHex,
                            }}
                          />
                        </button>
                      );
                    })
                  )}

                  {/* Tombol Toggle "+N KATEGORI LAINNYA ▼" */}
                  {!isSearching && remainingCount > 0 && (
                    <button
                      onClick={() => setShowAllCategories((prev) => !prev)}
                      className="w-full py-2.5 px-3 mt-1 text-center text-[10px] sm:text-[11px] font-bold tracking-wider text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors flex items-center justify-center gap-1.5 font-['Orbitron',sans-serif] cursor-pointer"
                    >
                      {showAllCategories ? (
                        <>
                          TUTUP KATEGORI LAINNYA <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          +{remainingCount} KATEGORI LAINNYA{" "}
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* ── Area Bawah / Footer Note ──────────────────────────────── */}
                <div className="shrink-0 pt-3 border-t border-white/10 mt-3">
                  <p className="text-[10px] text-slate-400 leading-normal font-['Rajdhani',sans-serif]">
                    Daftar level bersumber dari kategori proyek Tengok. Klik level untuk membuka peta &amp; CCTV proyek.
                  </p>
                </div>
              </motion.div>
            );
          })()
        ) : null}
      </AnimatePresence>

      {/* Admin PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10"
          >
            <div
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
              onClick={() => setShowPinModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-8 sm:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
            >
              <button
                onClick={() => setShowPinModal(false)}
                className="absolute top-6 sm:top-10 right-6 sm:right-10 p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="p-6 sm:p-8 rounded-[2.5rem] bg-yellow-500/10 mb-8 sm:mb-10 shadow-2xl shadow-yellow-500/5">
                  <ShieldAlert className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-500 stroke-[2.5]" />
                </div>

                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight uppercase mb-3 px-4">
                  Admin Access
                </h2>
                <p className="text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider opacity-60 mb-10 sm:mb-12">
                  Masukkan PIN management rahasia
                </p>

                <div className="flex gap-2 sm:gap-4 justify-center mb-10 sm:mb-12">
                  {pin.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      className="w-10 h-14 sm:w-16 sm:h-20 bg-slate-950/50 border-2 border-white/10 rounded-2xl sm:rounded-3xl text-center text-2xl sm:text-4xl font-bold text-white focus:border-yellow-500/50 focus:outline-none transition-all shadow-2xl"
                    />
                  ))}
                </div>

                <p className="text-slate-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                  Unauthorized access is strictly prohibited
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}