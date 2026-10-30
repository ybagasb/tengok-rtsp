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

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import {
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
  Menu,
  Sun,
  Moon,
  School,
  GraduationCap,
  Hospital,
  Building,
  Building2,
  Waves,
  Droplets,
  Route as RouteIcon,
  TrafficCone,
  Factory,
  House,
  Warehouse,
  Store,
  Hotel,
  Landmark,
  Mountain,
  Zap,
  Construction,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import useSWR from "swr";
import { usePageTracking } from "@/hooks/usePageTracking";
import ThemeToggle from "@/components/ThemeToggle";
import { useIsPhone } from "@/lib/phoneMode";
import { useTheme } from "@/components/ThemeProvider";
import { DIVISION_THEME, getDivisionCssVars, type DivisionKey } from "@/lib/divisionTheme";
import type { IntroScene3DProps } from "@/components/intro/IntroScene3D";

// Lazy-load IntroScene3D (Three.js tidak boleh SSR, loader tunggal via overlay HUD)
// Ikon per kategori (menggantikan nomor urut). Dicocokkan lewat kata kunci pada
// nama/identifier karena kategori dikelola admin; yang tak dikenal memakai ikon umum.
const CATEGORY_ICON_RULES: Array<[RegExp, LucideIcon]> = [
  [/sekolah\s*rakyat|rakyat/i, School],
  [/rumah\s*sakit|\brs\b|rsud|klinik|kesehatan|puskesmas/i, Hospital],
  [/universitas|kampus|politeknik|pendidikan|sekolah|madrasah|pesantren/i, GraduationCap],
  [/perkantoran|kantor|gedung\s*negara/i, Building2],
  [/rusun|apartemen|hunian|asrama|perumahan/i, Building],
  [/rumah|hunian|rusunawa/i, House],
  [/hotel|penginapan|wisata/i, Hotel],
  [/pasar|mall|pertokoan|niaga/i, Store],
  [/gudang|logistik|pelabuhan|bandara|terminal/i, Warehouse],
  [/pabrik|industri|kawasan/i, Factory],
  [/bendungan|waduk|dam\b/i, Mountain],
  [/irigasi|embung|air\s*baku|drainase|saluran/i, Droplets],
  [/pantai|sungai|banjir|normalisasi|pengendali|laut|sabo/i, Waves],
  [/tol/i, TrafficCone],
  [/jalan|jembatan|flyover|underpass|ruas/i, RouteIcon],
  [/listrik|energi|pltmh|pembangkit/i, Zap],
  [/ibadah|masjid|gereja|museum|monumen|budaya/i, Landmark],
  [/konstruksi|infrastruktur/i, Construction],
];
function categoryIcon(name?: string, identifier?: string): LucideIcon {
  const text = `${name ?? ""} ${identifier ?? ""}`;
  for (const [re, Icon] of CATEGORY_ICON_RULES) if (re.test(text)) return Icon;
  return Shapes;
}

const IntroScene3D = dynamic<IntroScene3DProps>(
  () => import("@/components/intro/IntroScene3D"),
  {
    ssr: false,
    loading: () => null,
  }
);

const ORDER: DivisionKey[] = ["DIVISI 1", "DIVISI 2", "DIVISI 3"];
const DIV_COLORS = ORDER.map((d) => DIVISION_THEME[d].accentHex);
const INTRO_KEY = "tengok_intro_seen_v1";
// Petunjuk geser divisi (mode fokus phone) hanya ditampilkan sekali per sesi.
const SWIPE_HINT_KEY = "tengok_swipe_hint_v1";
/**
 * Tuning bottom sheet fase detail (phone). Tinggi sebagai pecahan dari tinggi layar.
 * `sheetFrac` yang sama dikirim ke kamera 3D agar model terpilih tampil di atas sheet.
 */
const MOBILE_SHEET = {
  midVh: 0.44, // titik berhenti tengah (~40%)
  fullVh: 0.9, // titik berhenti penuh (~90%)
  minVh: 0.3, // batas bawah saat ditarik
  dragSlopPx: 6, // gerak minimal agar dianggap tarik (bukan tap)
  flingVelocity: 0.4, // px/ms; lebih cepat dari ini = lompat ke titik berikutnya
  transition: "height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;
type SheetStop = "mid" | "full";
const sheetCss = (stop: SheetStop) => `${(stop === "full" ? MOBILE_SHEET.fullVh : MOBILE_SHEET.midVh) * 100}dvh`;

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
  const [mounted, setMounted] = useState(false);
  const [phaseReady, setPhaseReady] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);

  // ── Sekuens 3D & Navigasi ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<"hq" | "explode" | "split" | "detail">("hq");
  const [selectedDiv, setSelectedDiv] = useState(-1);
  const [pointerDiv, setPointerDiv] = useState(-1);
  const [focusDiv, setFocusDiv] = useState(-1);
  const activeHoveredDiv = pointerDiv >= 0 ? pointerDiv : focusDiv;
  // Mode fokus satu divisi (phone: lebar < 640 DAN aspect < 0.85). Ambang ada di src/lib/phoneMode.ts
  // dan dipakai bersama oleh kamera 3D, kartu, dan judul. Tablet/landscape tidak terpengaruh.
  const isPhone = useIsPhone();
  const focusMode = isPhone && phase === "split";
  // Satu sumber kebenaran fokus: focusDiv. Di mode fokus tanpa pilihan eksplisit, default divisi pertama.
  const phoneFocus = focusMode ? (focusDiv >= 0 && focusDiv <= 2 ? focusDiv : 0) : -1;
  // Bottom sheet fase detail (phone): titik berhenti saat ini. Reset ke "mid" tiap masuk detail.
  const [sheetStop, setSheetStop] = useState<SheetStop>("mid");
  const [focusRowIndex, setFocusRowIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const explodeDoneRef = useRef(false);

  const resetNavFocus = useCallback(() => {
    setFocusDiv(-1);
    setFocusRowIndex(0);
    setPointerDiv(-1);
  }, []);

  const startButtonRef = useRef<HTMLButtonElement>(null);
  const divisionCardsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const allProjectsButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isKeyRepeatRef = useRef(false);
  const pendingFocusRowRef = useRef<number | null>(null);

  const [flash, setFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneMounted, setSceneMounted] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onSceneMounted = useCallback(() => setSceneMounted(true), []);
  const onSceneError = useCallback(() => {
    console.error("[Intro3D] Error inisialisasi dilaporkan dari IntroScene3D");
    setSceneError(true);
  }, []);

  // Cleanup timeout flash putih saat unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  // Inisialisasi fase: cek sessionStorage (intro sekali per sesi) & ?div= dari URL (SSR-safe)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flag mounted untuk hidrasi SSR-safe; harus di effect
    setMounted(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      // Mode hemat gerak: parameter URL ATAU pengaturan "kurangi gerakan" di sistem operasi.
      // ?motion=1 memaksa gerak penuh meski OS meminta dikurangi.
      const osPrefersReduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (
        params.get("reduced") === "1" ||
        params.get("motion") === "0" ||
        (osPrefersReduced && params.get("motion") !== "1")
      ) {
        setForceReduced(true);
        console.debug("[Intro3D] Mode reduced-motion diaktifkan (URL atau preferensi sistem).");
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
      resetNavFocus();
      setPhaseReady(true);
    }
  }, [resetNavFocus]);

  const isReduced = mounted ? forceReduced : false;
  // ── Mode fokus phone: carousel kartu <-> fokus 3D (dua arah, tanpa loop) ──
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const phoneFocusRef = useRef(-1);
  const programmaticScrollRef = useRef(false); // true selama scroll hasil kode (abaikan event scroll-nya)
  const programmaticTimerRef = useRef(0);
  const fromCarouselRef = useRef(-1); // fokus yang BARU diset oleh carousel (jangan di-scroll ulang)
  const scrollRafRef = useRef(0);
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(SWIPE_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      sessionStorage.setItem(SWIPE_HINT_KEY, "1");
    } catch {
      /* abaikan */
    }
  }, []);
  // Dipakai 3D (geser/tap tetangga), titik indikator, dan tap kartu tetangga.
  const focusFromUser = useCallback(
    (i: number) => {
      dismissHint();
      setPointerDiv(-1);
      setFocusDiv(i);
      setAnnouncement(`Fokus: ${ORDER[i]}`);
    },
    [dismissHint]
  );
  const syncCarousel = useCallback((behavior: ScrollBehavior) => {
    const el = carouselRef.current;
    const card = el?.children[phoneFocusRef.current] as HTMLElement | undefined;
    if (!el || !card) return;
    const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    if (Math.abs(el.scrollLeft - left) < 2) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ left, behavior });
    window.clearTimeout(programmaticTimerRef.current);
    // Cadangan bila `scrollend` tidak didukung peramban
    programmaticTimerRef.current = window.setTimeout(
      () => {
        programmaticScrollRef.current = false;
      },
      behavior === "smooth" ? 700 : 150
    );
  }, []);
  const setCarouselEl = useCallback(
    (el: HTMLDivElement | null) => {
      carouselRef.current = el;
      if (el) requestAnimationFrame(() => syncCarousel("auto")); // posisi awal tanpa animasi
    },
    [syncCarousel]
  );
  useEffect(() => {
    phoneFocusRef.current = phoneFocus;
    if (!focusMode) return;
    if (fromCarouselRef.current === phoneFocus) {
      fromCarouselRef.current = -1; // fokus ini berasal dari geseran carousel, sudah di posisi
      return;
    }
    syncCarousel(isReduced ? "auto" : "smooth");
  }, [focusMode, phoneFocus, isReduced, syncCarousel]);
  const onCarouselScroll = useCallback(() => {
    if (programmaticScrollRef.current || scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const el = carouselRef.current;
      if (!el || programmaticScrollRef.current) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const h = c as HTMLElement;
        const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      if (best !== phoneFocusRef.current) {
        fromCarouselRef.current = best;
        focusFromUser(best);
      }
    });
  }, [focusFromUser]);
  useEffect(
    () => () => {
      window.clearTimeout(programmaticTimerRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    },
    []
  );
  // ── Bottom sheet detail (phone): tarik handle / tap untuk pindah titik berhenti ──
  // Selama tarikan, tinggi ditulis LANGSUNG ke DOM (tanpa render React per frame); state hanya
  // diubah saat lepas. Handle memakai touch-action: none (hanya handle, bukan seluruh sheet).
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetDragRef = useRef<{ id: number; y0: number; h0: number; t0: number; moved: boolean } | null>(null);
  const sheetSuppressClickRef = useRef(false);
  const settleSheet = useCallback(
    (stop: SheetStop) => {
      const el = sheetRef.current;
      if (el) {
        el.style.transition = isReduced ? "none" : MOBILE_SHEET.transition;
        el.style.height = sheetCss(stop);
      }
      setSheetStop(stop);
    },
    [isReduced]
  );
  const onSheetHandleDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = sheetRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetDragRef.current = { id: e.pointerId, y0: e.clientY, h0: el.getBoundingClientRect().height, t0: performance.now(), moved: false };
  }, []);
  const onSheetHandleMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = sheetDragRef.current;
    const el = sheetRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dy) < MOBILE_SHEET.dragSlopPx) return;
      d.moved = true;
      el.style.transition = "none";
    }
    const vh = window.innerHeight;
    el.style.height = `${Math.min(vh * MOBILE_SHEET.fullVh, Math.max(vh * MOBILE_SHEET.minVh, d.h0 - dy))}px`;
  }, []);
  const onSheetHandleUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = sheetDragRef.current;
      const el = sheetRef.current;
      sheetDragRef.current = null;
      if (!d || !el || d.id !== e.pointerId || !d.moved) return; // tap murni ditangani onClick
      sheetSuppressClickRef.current = true; // cegah klik susulan (mouse) menggeser lagi
      const vh = window.innerHeight;
      const velocity = -(e.clientY - d.y0) / Math.max(1, performance.now() - d.t0); // px/ms, + = ke atas
      const mid = vh * MOBILE_SHEET.midVh;
      const full = vh * MOBILE_SHEET.fullVh;
      const h = el.getBoundingClientRect().height;
      settleSheet(
        velocity > MOBILE_SHEET.flingVelocity ? "full" : velocity < -MOBILE_SHEET.flingVelocity ? "mid" : h > (mid + full) / 2 ? "full" : "mid"
      );
    },
    [settleSheet]
  );
  const onSheetHandleCancel = useCallback(() => {
    if (sheetDragRef.current?.moved) settleSheet(sheetStop);
    sheetDragRef.current = null;
  }, [settleSheet, sheetStop]);
  const onSheetHandleClick = useCallback(() => {
    if (sheetSuppressClickRef.current) {
      sheetSuppressClickRef.current = false;
      return;
    }
    settleSheet(sheetStop === "full" ? "mid" : "full");
  }, [settleSheet, sheetStop]);
  const { data: session } = useSession();
  usePageTracking("categories");
  const { theme, toggle: toggleTheme } = useTheme();
  const [cardsEntered, setCardsEntered] = useState(false);
  // Warna teks aksen divisi yang tetap terbaca: digelapkan di tema terang,
  // dicerahkan di tema gelap (hex mentah kontrasnya rendah, mis. amber/teal di putih).
  const accentText = (hex: string) =>
    theme === "light"
      ? `color-mix(in srgb, ${hex} 58%, #000)`
      : `color-mix(in srgb, ${hex} 72%, #fff)`;

  // Gating UI tombol Management: hanya super-admin.
  const accessFetcher = (url: string) => fetch(url).then((r) => r.json());
  const { data: accessData } = useSWR(
    session?.user ? "/api/me/access" : null,
    accessFetcher
  );
  const isSuperAdmin = accessData?.isSuperAdmin === true;

  // Data divisi & kategori dari DB (di-cache oleh SWR, polling tiap 30 detik untuk update status kamera)
  const { data: divisionsRes, error: divisionsError } = useSWR<{ success: boolean; data: DivisionData[] }>(
    "/api/divisions",
    accessFetcher,
    { refreshInterval: 30000, refreshWhenHidden: false }
  );
  const dbDivisions = divisionsRes?.data || [];
  const isDivisionsLoading = !divisionsRes && !divisionsError;

  // Status CCTV per divisi (urutan sesuai ORDER) untuk dikirim ke scene 3D
  // Di-memoize dengan dependency divisionsRes?.data agar tidak membuat array baru di setiap render
  const divisionStatus = useMemo(() => {
    const list = divisionsRes?.data || [];
    return ORDER.map((divKey) => {
      const d = list.find((x) => x.division === divKey);
      return {
        total: d?.cameraTotal ?? 0,
        online: d?.cameraOnline ?? 0,
      };
    });
  }, [divisionsRes?.data]);



  // Efek fokus keyboard kartu divisi di fase split (side effect dipisahkan dari updater)
  useEffect(() => {
    // Mode phone: sinkronisasi carousel memakai scrollTo (efek di bawah); focus() akan menggulir sendiri & memunculkan ring.
    if (isPhone) return;
    if (phase === "split" && focusDiv >= 0 && focusDiv <= 2) {
      divisionCardsRef.current[focusDiv]?.focus();
    }
  }, [focusDiv, phase, isPhone]);

  // Timer 1 (10 detik): dimulai SETELAH IntroScene3D ter-mount (sceneMounted === true).
  // Bila belum ada onReady saat timer habis, tandai sceneError.
  useEffect(() => {
    if (!sceneMounted || sceneReady || sceneError) return;
    const timer = setTimeout(() => {
      if (!sceneReady) {
        console.warn("[Intro3D] Safety timeout 10 detik terlewati sebelum onReady terpanggil.");
        setSceneError(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [sceneMounted, sceneReady, sceneError]);

  // Timer 2 (30 detik): dimulai saat phaseReady === true (chunk download guard).
  // Bila sceneMounted masih false saat timer habis, tandai sceneError.
  useEffect(() => {
    if (!phaseReady || sceneMounted || sceneReady || sceneError) return;
    const timer = setTimeout(() => {
      if (!sceneMounted) {
        console.warn("[Intro3D] Chunk timeout 30 detik terlewati sebelum IntroScene3D ter-mount.");
        setSceneError(true);
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [phaseReady, sceneMounted, sceneReady, sceneError]);

  // Data divisi & kategori aktif di fase detail (di-memoize di level komponen)
  const currentDivKey = selectedDiv >= 0 && selectedDiv < ORDER.length ? ORDER[selectedDiv] : null;
  const currentTheme = currentDivKey ? DIVISION_THEME[currentDivKey] : null;
  const currentDivData = useMemo(() => {
    if (!currentDivKey) return null;
    return divisionsRes?.data?.find((d) => d.division === currentDivKey) || null;
  }, [currentDivKey, divisionsRes?.data]);

  const levelItems = useMemo(() => {
    if (!currentDivKey) return [];
    if (currentDivData?.categories && currentDivData.categories.length > 0) {
      return currentDivData.categories;
    }
    // FALLBACK hanya bila request gagal (divisionsError). Jangan pakai saat masih loading.
    if (divisionsError) {
      return FALLBACK_LEVELS[currentDivKey] || [];
    }
    return [];
  }, [currentDivKey, currentDivData, divisionsError]);

  const sortedItems = useMemo(() => {
    return [...levelItems].sort(
      (a, b) => (b.projectCount || 0) - (a.projectCount || 0)
    );
  }, [levelItems]);

  const maxProjectCount = useMemo(() => {
    return Math.max(1, ...sortedItems.map((c) => c.projectCount || 0));
  }, [sortedItems]);

  const totalProjects = useMemo(() => {
    if (isDivisionsLoading) return "…";
    return (
      currentDivData?.projectCount ??
      sortedItems.reduce((acc, c) => acc + (c.projectCount || 0), 0)
    );
  }, [currentDivData, sortedItems, isDivisionsLoading]);

  const isSearching = searchQuery.trim().length > 0;
  const filteredItems = useMemo(() => {
    return isSearching
      ? sortedItems.filter((c) =>
          c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
        )
      : sortedItems;
  }, [isSearching, sortedItems, searchQuery]);

  const displayedItems = useMemo(() => {
    return isSearching || showAllCategories
      ? filteredItems
      : filteredItems.slice(0, 5);
  }, [isSearching, showAllCategories, filteredItems]);

  const remainingCount = filteredItems.length - 5;



  // Clamp focusRowIndex & penuhi pendingFocusRow saat daftar kategori berubah (pencarian, expand/collapse)
  useEffect(() => {
    if (pendingFocusRowRef.current !== null) {
      const target = Math.min(displayedItems.length, pendingFocusRowRef.current);
      pendingFocusRowRef.current = null;
      setFocusRowIndex(target);
      return;
    }
    setFocusRowIndex((prev) => {
      const max = displayedItems.length;
      if (prev > max) return max;
      return prev;
    });
  }, [displayedItems.length]);

  // Efek fokus dan scroll baris kategori di fase detail via data-row-index (side effect dipisahkan dari updater)
  useEffect(() => {
    if (phase !== "detail") return;

    const scrollBehavior: ScrollBehavior = isReduced || isKeyRepeatRef.current ? "auto" : "smooth";

    if (focusRowIndex === 0) {
      allProjectsButtonRef.current?.focus({ preventScroll: true });
      if (listRef.current) {
        listRef.current.scrollTop = 0;
      }
      return;
    }

    if (focusRowIndex > 0 && listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-row-index="${focusRowIndex}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest", behavior: scrollBehavior });
      }
    }
  }, [focusRowIndex, phase, displayedItems.length, isReduced]);

  const onBuildingClick = useCallback(() => {
    if (phase !== "hq") return;
    setFlash(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setFlash(false);
      flashTimeoutRef.current = null;
    }, 90);
    // Jalankan fase explode (IntroScene3D)
    setPhase("explode");
    resetNavFocus();
    setAnnouncement("Gedung terbuka");
  }, [phase, resetNavFocus]);

  const onExplodeComplete = useCallback(() => {
    if (explodeDoneRef.current) return;
    explodeDoneRef.current = true;
    console.debug("[Intro3D] onExplodeComplete dipanggil -> beralih ke fase 'split'");
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(INTRO_KEY, "true");
      } catch {
        // ignore
      }
    }
    setPhase("split");
    resetNavFocus();
    setAnnouncement("Pilihan divisi terbuka");
  }, [resetNavFocus]);

  const handleSkipIntro = useCallback(() => {
    if (phase === "hq" || phase === "explode") {
      onExplodeComplete();
    }
  }, [phase, onExplodeComplete]);

  const onDivisionClick = useCallback(
    (i: number) => {
      if (phase !== "split") return;
      const divKey = ORDER[i];
      console.debug(`[Intro3D] onDivisionClick dipanggil: ${divKey} (index ${i}) -> beralih ke fase 'detail'`);
      setSearchQuery("");
      setShowAllCategories(false);
      setSelectedDiv(i);
      setPhase("detail");
      setSheetStop("mid");
      resetNavFocus();
      setAnnouncement(`Divisi ${i + 1} dipilih. Masuk ke panel level.`);
      router.replace(`/categories?div=${encodeURIComponent(divKey)}`);
    },
    [phase, router, resetNavFocus]
  );

  const handleBackToSplit = useCallback(() => {
    setSearchQuery("");
    setShowAllCategories(false);
    setPhase("split");
    setSelectedDiv(-1);
    resetNavFocus();
    if (isPhone && selectedDiv >= 0) setFocusDiv(selectedDiv); // phone: fokus kembali ke divisi yang baru dibuka
    setAnnouncement("Kembali ke pilihan divisi");
    router.replace("/categories");
  }, [router, resetNavFocus, isPhone, selectedDiv]);

  const handleReplayIntro = useCallback(() => {
    explodeDoneRef.current = false;
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
    resetNavFocus();
    setAnnouncement("Memutar ulang intro gedung");
    router.replace("/categories");
  }, [router, resetNavFocus]);

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

  const onDivisionHover = useCallback(
    (i: number) => {
      if (i >= 0) {
        if (
          document.activeElement &&
          divisionCardsRef.current.includes(document.activeElement as HTMLButtonElement)
        ) {
          (document.activeElement as HTMLElement).blur();
        }
        setFocusDiv(-1);
      }
      setPointerDiv(i);
    },
    []
  );

  // ── SATU handler keydown di page.tsx (Navigasi Keyboard) ─────────────
  useEffect(() => {
    const handleKeyUp = () => {
      isKeyRepeatRef.current = false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Abaikan bila modifier Ctrl/Alt/Meta aktif (jangan bajak shortcut browser)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // 2. Abaikan bila modal PIN terbuka
      if (showPinModal) return;

      const targetEl = e.target as HTMLElement | null;
      const isInput =
        targetEl &&
        (targetEl.tagName === "INPUT" ||
          targetEl.tagName === "TEXTAREA" ||
          targetEl.tagName === "SELECT" ||
          targetEl.isContentEditable);

      // Bila fokus ada di dalam input (mis. pencarian):
      if (isInput) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (searchQuery) {
            setSearchQuery("");
          } else {
            targetEl.blur();
          }
          return;
        }

        if (e.key === "ArrowDown") {
          if (displayedItems.length > 0) {
            e.preventDefault();
            targetEl.blur();
            const firstRowEl = listRef.current?.querySelector<HTMLElement>('[data-row-index="1"]');
            firstRowEl?.focus({ preventScroll: true });
            setFocusRowIndex(1);
            firstRowEl?.scrollIntoView({ block: "nearest" });
          }
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          if (isDivisionsLoading) {
            return;
          }
          const isSearchingQuery = searchQuery.trim() !== "";
          if (isSearchingQuery && displayedItems.length === 1 && currentDivKey) {
            handleLevelClick(currentDivKey, displayedItems[0].identifier);
          } else if (isSearchingQuery && displayedItems.length > 1) {
            targetEl.blur();
            const firstRowEl = listRef.current?.querySelector<HTMLElement>('[data-row-index="1"]');
            firstRowEl?.focus({ preventScroll: true });
            setFocusRowIndex(1);
            firstRowEl?.scrollIntoView({ block: "nearest" });
          }
          // Bila query kosong, Enter tidak membuka apa pun
          return;
        }

        return;
      }

      // 2b. Handler keydown global jangan membajak elemen interaktif lain.
      // Untuk Enter dan Space: bila e.target adalah <button>, <a>, [role=button], <summary>
      // yang BUKAN elemen yang dikelola handler, langsung return tanpa preventDefault.
      if (e.key === "Enter" || e.key === " ") {
        const isInteractive = Boolean(
          targetEl &&
          (targetEl.tagName === "BUTTON" ||
            targetEl.tagName === "A" ||
            targetEl.getAttribute("role") === "button" ||
            targetEl.tagName === "SUMMARY")
        );

        const isManagedElement = Boolean(
          targetEl &&
          (targetEl === startButtonRef.current ||
            divisionCardsRef.current.includes(targetEl as HTMLButtonElement) ||
            targetEl === allProjectsButtonRef.current ||
            Boolean(targetEl.closest?.("[data-row-index]")))
        );

        if (isInteractive && !isManagedElement) {
          return;
        }
      }

      // 3. Navigasi per fase
      if (phase === "hq") {
        if (e.key === "Enter" || e.key === " ") {
          const isTargetBodyOrStart =
            targetEl === document.body ||
            targetEl === document.documentElement ||
            targetEl === startButtonRef.current;
          if (!isTargetBodyOrStart) return;
          e.preventDefault();
          onBuildingClick();
        } else if (e.key === "Escape") {
          e.preventDefault();
          handleSkipIntro();
        }
      } else if (phase === "explode") {
        if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
          e.preventDefault();
          handleSkipIntro();
        }
      } else if (phase === "split") {
        if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          e.preventDefault();
          setPointerDiv(-1);
          const current = focusDiv >= 0 ? focusDiv : (pointerDiv >= 0 ? pointerDiv : -1);
          const next = current < 0 ? 0 : (current + 1) % 3;
          setAnnouncement(`Fokus: ${ORDER[next]}`);
          setFocusDiv(next);
        } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          e.preventDefault();
          setPointerDiv(-1);
          const current = focusDiv >= 0 ? focusDiv : (pointerDiv >= 0 ? pointerDiv : -1);
          const next = current <= 0 ? 2 : current - 1;
          setAnnouncement(`Fokus: ${ORDER[next]}`);
          setFocusDiv(next);
        } else if (e.key === "1") {
          e.preventDefault();
          resetNavFocus();
          onDivisionClick(0);
        } else if (e.key === "2") {
          e.preventDefault();
          resetNavFocus();
          onDivisionClick(1);
        } else if (e.key === "3") {
          e.preventDefault();
          resetNavFocus();
          onDivisionClick(2);
        } else if (e.key === "Enter" || e.key === " ") {
          const target = focusDiv >= 0 ? focusDiv : pointerDiv;
          if (target >= 0 && target <= 2) {
            e.preventDefault();
            onDivisionClick(target);
          } else {
            e.preventDefault();
            setPointerDiv(-1);
            setAnnouncement(`Fokus: ${ORDER[0]}`);
            setFocusDiv(0);
          }
        }
      } else if (phase === "detail") {
        if (e.key === "Escape") {
          e.preventDefault();
          handleBackToSplit();
        } else if (e.key === "/") {
          e.preventDefault();
          searchInputRef.current?.focus();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          isKeyRepeatRef.current = e.repeat;
          const isCompactLast =
            !isSearching && !showAllCategories && remainingCount > 0 && focusRowIndex === displayedItems.length;
          if (isCompactLast) {
            setShowAllCategories(true);
            pendingFocusRowRef.current = focusRowIndex + 1;
          } else {
            const totalRows = 1 + displayedItems.length;
            const next = Math.min(totalRows - 1, focusRowIndex + 1);
            setFocusRowIndex(next);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          isKeyRepeatRef.current = e.repeat;
          const next = Math.max(0, focusRowIndex - 1);
          setFocusRowIndex(next);
        } else if (e.key === "Home") {
          e.preventDefault();
          isKeyRepeatRef.current = false;
          setFocusRowIndex(0);
          if (listRef.current) {
            listRef.current.scrollTo({ top: 0 });
          }
        } else if (e.key === "End") {
          e.preventDefault();
          isKeyRepeatRef.current = false;
          if (!isSearching && !showAllCategories && remainingCount > 0) {
            setShowAllCategories(true);
            pendingFocusRowRef.current = filteredItems.length;
          } else {
            setFocusRowIndex(displayedItems.length);
          }
        } else if (e.key === "Enter") {
          if (isDivisionsLoading) {
            e.preventDefault();
            return; // Abaikan Enter sampai data tiba
          }
          if (currentDivKey) {
            e.preventDefault();
            if (focusRowIndex === 0) {
              handleLevelClick(currentDivKey);
            } else {
              const cat = displayedItems[focusRowIndex - 1];
              if (cat) {
                handleLevelClick(currentDivKey, cat.identifier);
              }
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    phase,
    focusDiv,
    pointerDiv,
    focusRowIndex,
    showPinModal,
    searchQuery,
    displayedItems,
    remainingCount,
    isSearching,
    showAllCategories,
    filteredItems,
    currentDivKey,
    isDivisionsLoading,
    onBuildingClick,
    handleSkipIntro,
    onDivisionClick,
    handleBackToSplit,
    handleLevelClick,
    resetNavFocus,
  ]);

  // ── Profil / Logout / PIN management ──────────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  // Menu burger header (hanya mobile): menampung semua aksi agar baris header tidak penuh.
  const [showMenu, setShowMenu] = useState(false);
  useEffect(() => {
    if (!showMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showMenu]);
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogout = async () => {
    resetNavFocus();
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
      // Navigasi penuh disengaja: endpoint API (bukan halaman Next) yang mengalihkan ke logout Cognito.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/auth/federated-logout";
    } catch {
      // Muat ulang penuh disengaja agar status sesi/cookie benar-benar bersih.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- penanda verifikasi PIN otomatis saat 6 digit terisi; memindahkan ke handler mengubah perilaku
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

  // ── Panel bawah mode fokus (phone): judul, carousel kartu, petunjuk geser, titik indikator ──
  const phoneSplitPanel = isPhone ? (
    <div
      className="mx-auto w-full max-w-[640px] rounded-t-3xl border-x border-t border-black/10 bg-white/95 pt-3 shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-950/95"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="px-4">
        <h1 className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">
          Pilih{" "}
          <span className="bg-gradient-to-r from-amber-600 to-yellow-600 dark:from-yellow-400 dark:to-amber-300 bg-clip-text text-transparent">
            Divisi
          </span>
        </h1>
      </div>
      <div
        ref={setCarouselEl}
        role="group"
        aria-roledescription="carousel"
        aria-label="Pilih divisi"
        onScroll={onCarouselScroll}
        onScrollEnd={() => {
          programmaticScrollRef.current = false;
        }}
        onPointerDown={() => {
          programmaticScrollRef.current = false; // sentuhan pengguna selalu menang atas scroll kode
        }}
        className="mt-3 flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden before:w-[calc(6%-8px)] before:shrink-0 before:content-[''] after:w-[calc(6%-8px)] after:shrink-0 after:content-['']"
      >
        {ORDER.map((div, i) => {
          const t = DIVISION_THEME[div];
          const divData = dbDivisions.find((d) => d.division === div);
          const pCount = divData?.projectCount ?? 0;
          const cCount = divData?.categories?.length ?? FALLBACK_LEVELS[div].length;
          const camTot = divData?.cameraTotal ?? 0;
          const camOn = divData?.cameraOnline ?? 0;
          const tier = statusTier(camTot, camOn);
          const tierColor = statusTierColor(tier, t.accentHex);
          const isFocus = i === phoneFocus;
          return (
            <div
              key={div}
              onClick={() => {
                if (!isFocus) focusFromUser(i); // tap kartu tetangga = jadikan fokus
              }}
              className={`w-[88%] shrink-0 snap-center rounded-2xl border border-black/10 bg-white p-4 transition-[opacity,transform] duration-200 dark:border-white/10 dark:bg-slate-900 ${
                isFocus ? "opacity-100" : "opacity-70 scale-[0.97]"
              }`}
              style={{ borderTop: `3px solid ${t.accentHex}` }}
            >
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]" style={{ color: accentText(t.accentHex) }}>
                {t.short}
              </span>
              <h2 className="mt-1 text-base font-black uppercase leading-tight tracking-tight text-slate-900 dark:text-white">
                {t.title}
              </h2>
              <div className="mt-2 flex items-center justify-between gap-2 font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="truncate">
                  {pCount} proyek · {cCount} kategori
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: tierColor }} />
                  {camTot === 0 ? "0 kamera" : `${camOn}/${camTot} online`}
                </span>
              </div>
              <button
                ref={(el) => {
                  divisionCardsRef.current[i] = el;
                }}
                type="button"
                onClick={() => onDivisionClick(i)}
                aria-label={`Masuk ${t.title}`}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black uppercase tracking-wider text-slate-950 transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                style={{ background: t.accentHex }}
              >
                MASUK <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {!hintDismissed && (
        <motion.p
          initial={false}
          animate={isReduced ? undefined : { x: [0, -6, 6, 0] }}
          transition={{ duration: 1.6, repeat: 2, ease: "easeInOut" }}
          className="mt-2 flex items-center justify-center gap-2 px-4 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Geser untuk ganti divisi
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </motion.p>
      )}
      <div role="group" aria-label="Indikator divisi" className="flex items-center justify-center gap-2">
        {ORDER.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => focusFromUser(i)}
            aria-label={`Divisi ${i + 1} dari ${ORDER.length}`}
            aria-current={i === phoneFocus ? "true" : undefined}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className={`block h-2 rounded-full transition-all duration-200 ${i === phoneFocus ? "w-6" : "w-2 bg-slate-400/70 dark:bg-slate-500/70"}`}
              style={i === phoneFocus ? { backgroundColor: DIVISION_THEME[d].accentHex } : undefined}
            />
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative h-dvh overflow-hidden bg-slate-100 text-slate-900 dark:bg-[#070d18] dark:text-white">
      {/* Scanline overlay & HUD corner brackets (persis prototipe) */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 select-none ${focusMode ? "opacity-30" : ""}`}
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px)",
        }}
      />
      <span aria-hidden="true" className="pointer-events-none select-none absolute top-2.5 left-2.5 w-6 h-6 border-t-2 border-l-2 border-amber-600/30 dark:border-amber-500/70 z-20" />
      <span aria-hidden="true" className="pointer-events-none select-none absolute top-2.5 right-2.5 w-6 h-6 border-t-2 border-r-2 border-amber-600/30 dark:border-amber-500/70 z-20" />
      <span aria-hidden="true" className="pointer-events-none select-none absolute bottom-2.5 left-2.5 w-6 h-6 border-b-2 border-l-2 border-amber-600/30 dark:border-amber-500/70 z-20" />
      <span aria-hidden="true" className="pointer-events-none select-none absolute bottom-2.5 right-2.5 w-6 h-6 border-b-2 border-r-2 border-amber-600/30 dark:border-amber-500/70 z-20" />

      {/* Flash putih singkat saat gedung pecah (persis prototipe) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 bg-white transition-opacity duration-150"
        style={{ opacity: flash ? 0.7 : 0 }}
      />

      {/* Canvas Three.js — absolut penuh layar, di belakang semua UI */}
      <div className="absolute inset-0 z-0 select-none bg-[#e9eef5] dark:bg-[#070d18]">
        {/* Watermark logo besar beranimasi: di belakang canvas 3D (canvas transparan) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden pb-[24dvh]"
        >
          <div className={`watermark-float ${focusMode ? "opacity-[0.05] dark:opacity-[0.08] [animation:none]" : "opacity-[0.13] dark:opacity-[0.22]"}`}>
            <div className={`watermark-logo relative w-[min(62vw,62dvh)] sm:w-[min(46vw,54dvh)] aspect-[463/372] ${focusMode ? "[animation:none] after:hidden" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/abipraya_mark.svg" alt="" draggable={false} className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
        {phaseReady && (
          <IntroScene3D
            phase={phase}
            selectedDiv={selectedDiv}
            hoveredDiv={focusMode ? phoneFocus : activeHoveredDiv}
            focusDiv={phoneFocus}
            sheetFrac={isPhone && phase === "detail" ? (sheetStop === "full" ? MOBILE_SHEET.fullVh : MOBILE_SHEET.midVh) : 0}
            onFocusChange={focusFromUser}
            divisionColors={DIV_COLORS}
            divisionStatus={divisionStatus}
            theme={theme}
            reducedMotion={isReduced}
            onBuildingClick={onBuildingClick}
            onExplodeComplete={onExplodeComplete}
            onDivisionClick={onDivisionClick}
            onDivisionHover={onDivisionHover}
            onReady={onSceneReady}
            onError={onSceneError}
            onMounted={onSceneMounted}
            className="absolute inset-0"
          />
        )}
      </div>

      {/* ── Overlay Loading / Error Scene (HUD style di bawah header z-30) ── */}
      <AnimatePresence>
        {!sceneReady && (
          <motion.div
            key="scene-loader-overlay"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className={`absolute inset-0 z-[25] flex flex-col items-center justify-center bg-white/90 dark:bg-[#070d18]/90 backdrop-blur-sm select-none ${
              sceneError ? "pointer-events-auto px-4 max-md:overflow-y-auto max-md:py-20" : "pointer-events-none"
            }`}
          >
            {sceneError ? (
              <div className="flex flex-col items-center gap-4 text-center max-w-md max-md:my-auto">
                <div className="p-3.5 rounded-full bg-amber-500/10 border border-amber-600/30 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                  <ShieldAlert className="w-8 h-8" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm sm:text-base font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
                    Scene 3D Belum Siap
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 tracking-wider">
                    Scene 3D belum siap. Muat ulang atau masuk langsung ke peta.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.reload();
                    }
                  }}
                  className="mt-1 flex items-center gap-2 px-6 py-2.5 min-h-12 md:min-h-11 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.5)] active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Muat ulang
                </button>

                {/* 3 Tombol Akses Peta Langsung bila WebGL tidak tersedia */}
                <div className="w-full pt-3 mt-1 border-t border-black/10 dark:border-white/10 flex flex-col gap-2">
                  <p className="text-xs uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400">
                    Masuk Langsung ke Peta Divisi:
                  </p>
                  <div className="grid grid-cols-3 gap-2 w-full">
                    {ORDER.map((div) => {
                      const t = DIVISION_THEME[div];
                      return (
                        <a
                          key={div}
                          href={`/map?division=${encodeURIComponent(div)}`}
                          className="flex items-center justify-center min-h-12 md:min-h-11 px-2.5 py-2 rounded-lg bg-white/70 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/15 border border-black/10 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold uppercase tracking-wider text-center transition-all hover:border-amber-500/50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                          style={{ borderLeft: `3px solid ${t.accentHex}` }}
                        >
                          {t.short}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.25em] text-amber-700 dark:text-amber-400 dark:drop-shadow-[0_0_14px_rgba(245,158,11,0.5)]">
                  MEMUAT SCENE…
                </span>
                {/* Bar tipis beranimasi gaya HUD */}
                <div className="w-48 sm:w-64 h-[2px] bg-black/10 dark:bg-white/10 rounded-full overflow-hidden relative">
                  {isReduced ? (
                    <div className="w-full h-full bg-amber-400" />
                  ) : (
                    <motion.div
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header — z-30, semi-transparan di atas canvas */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-3 sm:px-10 py-2 max-sm:pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:py-5 shrink-0 bg-white/80 dark:bg-[#070d18]/60 backdrop-blur-md border-b border-black/10 dark:border-white/5">
        {/* Logo + Title + Status Online */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Logo biru untuk tema terang, logo putih/kuning untuk tema gelap */}
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image */}
          <img
            src="/abipraya_blue.svg"
            alt=""
            aria-hidden="true"
            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 object-contain block dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- logo statis lokal (SVG), tidak perlu optimasi next/image */}
          <img
            src="/abipraya_original.svg"
            alt=""
            aria-hidden="true"
            className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 hidden dark:block"
          />
          <div className="leading-tight min-w-0">
            {/* Mobile: aksi header dilipat ke menu burger, jadi nama brand punya ruang penuh. */}
            <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] bg-gradient-to-r from-yellow-700 to-amber-600 dark:from-yellow-400 dark:to-amber-300 bg-clip-text text-transparent truncate">
              Brantas Abipraya
            </p>
            <p className="hidden sm:block text-[11px] font-bold uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 truncate">
              Project Management Information System
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="relative hidden sm:flex items-center gap-1 sm:gap-3 shrink-0">
          {/* Putar ulang intro 3D (hanya saat fase split/detail) */}
          {phase !== "hq" && (
            <button
              onClick={handleReplayIntro}
              className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 min-h-11 min-w-11 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
              title="Putar ulang intro gedung 3D (reset intro)"
              aria-label="Putar ulang intro gedung 3D"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:block">Putar Intro</span>
            </button>
          )}

          {/* Toggle tema — halaman ini sekarang adaptif terang/gelap. */}
          <ThemeToggle />

          {/* Panduan pengguna (PDF) */}
          <a
            href="/Panduan-Input-Detail-Proyek.pdf?v=20261030"
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-yellow-400 transition-all p-2 min-h-11 min-w-11 sm:px-4 sm:py-2.5 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/5 hover:border-yellow-500/30 group focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            title="Unduh Panduan Pengisian Detail Proyek (PDF)"
            aria-label="Unduh panduan pengisian detail proyek (PDF)"
          >
            <BookOpen className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
            <span className="text-[11px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
              Panduan
            </span>
          </a>

          {/* SSO User Profile */}
          {session?.user && (
            <div className="relative">
              <button
                onClick={() => setShowProfile((p) => !p)}
                className="flex items-center gap-2 px-2 sm:px-3 py-2 min-h-11 min-w-11 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/5 hover:border-yellow-500/30 transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                title={session.user.name || "Profil"}
                aria-label={`Menu profil ${session.user.name || ""}`.trim()}
                aria-expanded={showProfile}
                aria-haspopup="menu"
              >
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar dari URL eksternal (SSO), domain tidak dapat dipastikan untuk next/image
                  <img
                    src={session.user.image}
                    alt=""
                    aria-hidden="true"
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-yellow-500/30"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-[11px] font-bold text-slate-900 shrink-0">
                    {session.user.name?.charAt(0)?.toUpperCase() || (
                      <User className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">
                    {session.user.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight truncate max-w-[120px]">
                    {session.user.email}
                  </p>
                </div>
              </button>

              <AnimatePresence>
                {showProfile && (
                  <>
                    <div
                      aria-hidden="true"
                      className="fixed inset-0 z-40"
                      onClick={() => setShowProfile(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[260px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-2xl z-[100] overflow-hidden select-text"
                      role="menu"
                      aria-label="Menu profil"
                    >
                      <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
                        {session.user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- avatar dari URL eksternal (SSO), domain tidak dapat dipastikan untuk next/image
                          <img
                            src={session.user.image}
                            alt=""
                            aria-hidden="true"
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-yellow-500/20 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-sm font-bold text-slate-900 shrink-0">
                            {session.user.name?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {session.user.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {session.user.email}
                          </p>
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-600/30 dark:border-blue-500/20 text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                            <ShieldAlert className="w-2.5 h-2.5" aria-hidden="true" /> SSO
                          </span>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={handleLogout}
                          role="menuitem"
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-11 rounded-xl text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 transition-colors text-sm font-semibold cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                        >
                          <LogOut className="w-4 h-4" aria-hidden="true" />
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
              className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-700 dark:hover:text-yellow-400 transition-all p-2 min-h-11 min-w-11 sm:px-4 sm:py-2.5 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/5 hover:border-yellow-500/30 group focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
              title="Management"
              aria-label="Management"
            >
              <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" aria-hidden="true" />
              <span className="text-[11px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
                Management
              </span>
            </button>
          )}

          {/* Logout untuk non-SSO (PIN viewer) */}
          {!session?.user && (
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 transition-all p-2 min-h-11 min-w-11 sm:px-4 sm:py-2.5 rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/5 hover:border-red-500/30 group focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="text-[11px] sm:text-sm font-bold uppercase tracking-wider hidden sm:block">
                Logout
              </span>
            </button>
          )}
        </div>

        {/* Burger (mobile): semua aksi header dikumpulkan dalam satu menu */}
        <div className="relative sm:hidden shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            aria-label={showMenu ? "Tutup menu" : "Buka menu"}
            aria-expanded={showMenu}
            aria-haspopup="menu"
            aria-controls="header-menu"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/70 dark:bg-white/5 border border-black/10 dark:border-white/10 text-slate-700 dark:text-slate-200 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
          >
            {showMenu ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
          <AnimatePresence>
            {showMenu && (
              <>
                <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div
                  id="header-menu"
                  role="menu"
                  aria-label="Menu utama"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1.5rem))] z-[100] overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl shadow-slate-900/15 dark:shadow-2xl select-text"
                >
                  {session?.user && (
                    <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center text-sm font-bold text-slate-900 shrink-0">
                        {session.user.name?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" aria-hidden="true" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{session.user.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{session.user.email}</p>
                      </div>
                    </div>
                  )}
                  <div className="p-2 flex flex-col gap-1">
                    {phase !== "hq" && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowMenu(false);
                          handleReplayIntro();
                        }}
                        className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                      >
                        <RotateCcw className="w-4 h-4" aria-hidden="true" /> Putar Intro
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        toggleTheme();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                      {theme === "dark" ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
                      {theme === "dark" ? "Tema Terang" : "Tema Gelap"}
                    </button>
                    <a
                      role="menuitem"
                      href="/Panduan-Input-Detail-Proyek.pdf?v=20261030"
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      onClick={() => setShowMenu(false)}
                      className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                      <BookOpen className="w-4 h-4" aria-hidden="true" /> Panduan (PDF)
                    </a>
                    {session?.user && isSuperAdmin && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setShowMenu(false);
                          setShowPinModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                      >
                        <Settings className="w-4 h-4" aria-hidden="true" /> Management
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        setShowMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" /> {session?.user ? "Keluar / Logout" : "Logout"}
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center justify-end pb-[9dvh] gap-2 pointer-events-auto text-center px-4"
            style={{ paddingBottom: isPhone ? "calc(5.75rem + env(safe-area-inset-bottom, 0px))" : "calc(9dvh + env(safe-area-inset-bottom, 0px))" }}
          >
            <h1 className="text-2xl max-[360px]:text-xl sm:text-4xl font-black uppercase tracking-[0.14em] text-slate-900 dark:text-white drop-shadow-[0_1px_6px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] dark:drop-shadow-[0_0_24px_rgba(245,158,11,0.5)]">
              KANTOR PUSAT
            </h1>
            <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] text-slate-700 dark:text-slate-300 drop-shadow-[0_1px_4px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              PT BRANTAS ABIPRAYA (PERSERO)
            </p>
            <button
              ref={startButtonRef}
              onClick={onBuildingClick}
              className="mt-3 px-6 sm:px-8 py-3 min-h-12 md:min-h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-[0.2em] transition-all shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_rgba(245,158,11,0.8)] active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              style={{
                clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
              }}
            >
              KLIK GEDUNG · MULAI ▶
            </button>
          </motion.div>
        ) : phase === "split" ? (
          <>
            {/* Judul Fase Split dinaikkan ke atas di bawah header agar tidak menimpa cincin platform 3D.
                Mode phone: judul pindah ke panel bawah (phoneSplitPanel). */}
            {!isPhone && (
            <motion.div
              initial={isReduced ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="absolute inset-x-0 top-20 sm:top-24 z-10 flex flex-col items-center text-center pointer-events-none px-4"
            >
              <div className="px-5 py-2 rounded-2xl bg-white/85 dark:bg-slate-950/80 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-lg shadow-slate-900/10 dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  Pilih{" "}
                  <span className="bg-gradient-to-r from-amber-600 to-yellow-600 dark:from-yellow-400 dark:to-amber-300 bg-clip-text text-transparent">
                    Divisi
                  </span>
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 tracking-wider font-medium dark:drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                  <span className="sm:hidden">Pilih kartu untuk masuk</span>
                  <span className="hidden sm:inline">Klik model 3D atau kartu untuk masuk</span>
                </p>
              </div>
            </motion.div>
            )}

            <motion.div
              key="split-ui"
              initial={isReduced ? false : { opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 0.6 }}
              className={isPhone ? "absolute inset-x-0 bottom-0 z-10" : "absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-3 sm:px-6 pb-16 sm:pb-16"}
              style={isPhone ? undefined : { paddingBottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {isPhone ? (
                phoneSplitPanel
              ) : (
              <>
              {/* Kartu 3 divisi (grid max-w-[1100px], min-h-[96px], persis spesifikasi V2) */}
              {/* Mobile: kartu digeser horizontal (snap) supaya model 3D di atasnya tetap terlihat. */}
              <div
                role="group"
                aria-label="Pilih divisi"
                className="flex sm:grid sm:grid-cols-3 gap-3 w-full max-w-[1100px] overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none px-3 sm:px-0 -mx-3 sm:mx-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {ORDER.map((div, i) => {
                  const t = DIVISION_THEME[div];
                  const isHov = activeHoveredDiv === i;
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
                      ref={(el) => { divisionCardsRef.current[i] = el; }}
                      tabIndex={0}
                      aria-label={`${div} - ${t.title}. ${camTot === 0 ? "Belum ada kamera" : `${camOn} dari ${camTot} kamera online`}`}
                      onClick={() => onDivisionClick(i)}
                      onMouseEnter={() => {
                        if (
                          document.activeElement &&
                          divisionCardsRef.current.includes(document.activeElement as HTMLButtonElement)
                        ) {
                          (document.activeElement as HTMLElement).blur();
                        }
                        setFocusDiv(-1);
                        setPointerDiv(i);
                      }}
                      onMouseLeave={() => setPointerDiv(-1)}
                      onFocus={() => {
                        setPointerDiv(-1);
                        setFocusDiv(i);
                      }}
                      initial={isReduced ? false : { opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: isHov ? -8 : 0 }}
                      transition={{
                        opacity: { delay: 0.3 + i * 0.1, duration: 0.5 },
                        y: { type: "spring", stiffness: 520, damping: 34, mass: 0.6, delay: cardsEntered ? 0 : 0.3 + i * 0.1 },
                      }}
                      onAnimationComplete={() => { if (i === ORDER.length - 1) setCardsEntered(true); }}
                      className="group relative overflow-hidden rounded-2xl min-h-[96px] shrink-0 w-[78vw] max-w-[320px] snap-center sm:w-auto sm:max-w-none sm:snap-align-none text-left p-3.5 sm:p-4 border border-white/60 dark:border-white/15 bg-gradient-to-br from-white/65 to-white/30 dark:from-slate-900/60 dark:to-slate-950/35 backdrop-blur-xl backdrop-saturate-200 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] transition-[box-shadow] duration-200 flex flex-col justify-between cursor-pointer select-text focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                      style={{
                        boxShadow: isHov
                          ? `0 0 28px -4px ${t.accentHex}, inset 0 1px 0 rgba(255,255,255,0.55)`
                          : undefined,
                      }}
                    >
                    {/* Garis aksen divisi di tepi atas (pengganti border-top + sudut terpotong) */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-5 top-0 h-[3px] rounded-b-full"
                      style={{ backgroundColor: t.accentHex, boxShadow: `0 0 12px 1px ${t.accentHex}` }}
                    />
                    <div>
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] font-mono"
                          style={{ color: accentText(t.accentHex) }}
                        >
                          {t.short}
                        </span>
                        <div
                          className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity font-mono uppercase"
                          style={{ color: accentText(t.accentHex) }}
                        >
                          MASUK <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </div>
                      </div>
                      <h3 className="mt-1 text-sm md:text-base font-black uppercase tracking-tight text-slate-900 dark:text-white leading-tight">
                        {t.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-snug hidden sm:block line-clamp-2">
                        {t.tagline}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10 flex flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-mono font-medium">
                      <div className="flex items-center justify-between">
                        <span>
                          {pCount} proyek · {cCount} kategori
                        </span>
                        <span className="sm:hidden text-[11px] font-bold" style={{ color: accentText(t.accentHex) }}>
                          MASUK ▶
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span
                          aria-hidden="true"
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
              </>
              )}
          </motion.div>
        </>
        ) : phase === "detail" && currentDivKey && currentTheme ? (
          (
            <motion.div
                key="detail-ui"
                ref={sheetRef}
                initial={isReduced ? false : isPhone ? { opacity: 0, y: 60 } : { opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={isPhone ? { opacity: 0, y: 60, transition: { duration: 0.25 } } : { opacity: 0, x: 30, transition: { duration: 0.25 } }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={isPhone ? "absolute inset-x-0 bottom-0 z-20 flex w-full flex-col overscroll-contain rounded-t-3xl border-x border-t border-white/60 bg-white/95 px-4 shadow-[0_-16px_48px_-12px_rgba(15,23,42,0.4)] select-text dark:border-white/15 dark:bg-slate-950/95" : "absolute z-20 bottom-0 sm:bottom-auto top-auto sm:top-28 left-0 sm:left-auto right-0 sm:right-8 w-full sm:w-[440px] max-w-[100vw] sm:max-w-[440px] max-h-[82dvh] sm:max-h-[calc(100dvh-148px)] flex flex-col p-4 sm:p-5 border border-white/60 dark:border-white/15 bg-white/95 dark:bg-slate-950/95 sm:bg-transparent sm:bg-gradient-to-br sm:from-white/60 sm:to-white/30 sm:dark:from-slate-900/55 sm:dark:to-slate-950/35 backdrop-blur-xl backdrop-saturate-200 shadow-[0_20px_60px_-12px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] rounded-t-2xl sm:rounded-2xl select-text"}
                role="dialog"
                aria-label={`Level dan kategori ${currentTheme.title}`}
                style={
                  {
                    ...getDivisionCssVars(currentDivKey),
                    paddingBottom: isPhone ? "calc(8px + env(safe-area-inset-bottom, 0px))" : "calc(16px + env(safe-area-inset-bottom, 0px))",
                    ...(isPhone ? { height: sheetCss(sheetStop), transition: isReduced ? "none" : MOBILE_SHEET.transition } : {}),
                  } as React.CSSProperties
                }
              >
                {/* Cahaya ambient aksen divisi (sama seperti sidebar peta) */}
                <div aria-hidden="true" className="absolute -top-20 -right-16 -z-10 w-64 h-64 rounded-full bg-[rgba(var(--div-accent-rgb),0.14)] blur-[80px] pointer-events-none" />
                {/* ── Area Atas Sticky / Fixed ──────────────────────────────── */}
                <div className="shrink-0">
                  {isPhone ? (
                    <>
                      {/* Handle bottom sheet (phone): tarik atau tap untuk pindah titik berhenti 44%/90% */}
                      <button
                        type="button"
                        onPointerDown={onSheetHandleDown}
                        onPointerMove={onSheetHandleMove}
                        onPointerUp={onSheetHandleUp}
                        onPointerCancel={onSheetHandleCancel}
                        onClick={onSheetHandleClick}
                        aria-label={sheetStop === "full" ? "Perkecil panel kategori" : "Perluas panel kategori"}
                        aria-expanded={sheetStop === "full"}
                        className="flex h-11 w-full touch-none items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                      >
                        <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-black/25 dark:bg-white/25" />
                      </button>
                      {/* Header ringkas: kembali (44 px), kode + judul, status CCTV */}
                      <div className="mt-2 mb-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleBackToSplit}
                          aria-label="Kembali ke pilihan divisi"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/[0.06] bg-black/[0.04] text-slate-700 focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none dark:border-white/[0.06] dark:bg-white/[0.05] dark:text-slate-200"
                        >
                          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-bold uppercase tracking-[0.18em] div-accent-text">
                            {currentTheme.short} · {totalProjects} proyek
                          </p>
                          <h2 className="line-clamp-2 text-sm font-black uppercase leading-tight tracking-tight text-slate-900 dark:text-white">
                            {currentTheme.title}
                          </h2>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-black/[0.03] px-2 py-1 font-mono text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-200">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: statusTierColor(
                                statusTier(currentDivData?.cameraTotal, currentDivData?.cameraOnline),
                                currentTheme.accentHex
                              ),
                            }}
                          />
                          {(currentDivData?.cameraTotal ?? 0) === 0
                            ? "0 kamera"
                            : `${currentDivData?.cameraOnline ?? 0}/${currentDivData?.cameraTotal}`}
                        </div>
                      </div>
                    </>
                  ) : (
                  <>
                  {/* Handle indikator mobile sheet (non-phone <sm: panel bawah lama) */}
                  <div aria-hidden="true" className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full mx-auto mb-3 sm:hidden" />

                  {/* Tombol Back */}
                  <button
                    onClick={handleBackToSplit}
                    className="flex items-center gap-2 px-3 py-1.5 min-h-11 mb-3 rounded-xl text-[11px] font-bold tracking-[0.18em] uppercase border border-black/[0.06] dark:border-white/[0.06] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/10 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    KEMBALI
                  </button>

                  {/* Header: Kode Divisi, Judul & Subtitle proyek */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <small
                        className="font-bold text-[11px] uppercase tracking-[0.22em] div-accent-text"
                      >
                        {currentTheme.short}
                      </small>
                      {/* Lencana status CCTV divisi */}
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[11px] font-mono text-slate-700 dark:text-slate-200">
                        <span
                          aria-hidden="true"
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
                    <h2 className="mt-0.5 text-lg sm:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                      {currentTheme.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 font-medium">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{totalProjects} proyek</span>
                      <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">·</span>
                      <span>urut dari proyek terbanyak</span>
                    </p>
                  </div>
                  </>
                  )}

                  {/* Tombol Utama Paling Atas: SEMUA PROYEK DIVISI INI · N ▶ */}
                  <button
                    ref={allProjectsButtonRef}
                    data-row-index="0"
                    disabled={isDivisionsLoading}
                    onClick={() => {
                      if (isDivisionsLoading) return;
                      handleLevelClick(currentDivKey);
                    }}
                    onFocus={() => setFocusRowIndex(0)}
                    className={`w-full flex items-center justify-between px-4 py-3 min-h-12 md:min-h-11 mb-3.5 rounded-xl bg-[rgba(var(--div-accent-rgb),0.15)] hover:bg-[rgba(var(--div-accent-rgb),0.25)] border border-[rgba(var(--div-accent-rgb),0.3)] div-accent-text font-black text-xs sm:text-sm tracking-wider uppercase transition-all active:scale-[0.99] cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none ${
                      isDivisionsLoading ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                    } ${
                      focusRowIndex === 0 ? "ring-2 ring-[rgba(var(--div-accent-rgb),0.7)]" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>SEMUA PROYEK DIVISI INI</span>
                      <span className="px-1.5 py-0.5 text-[11px] font-mono bg-[rgba(var(--div-accent-rgb),0.2)] font-bold rounded-md">
                        {totalProjects}
                      </span>
                    </span>
                    <span className="font-mono text-xs">MASUK ▶</span>
                  </button>

                  {/* Kolom Pencarian (Tampil bila kategori > 8) */}
                  {sortedItems.length > 8 && (
                    <div className="relative mb-3">
                      <Search aria-hidden="true" className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => {
                          if (isPhone && sheetStop !== "full") settleSheet("full"); // keyboard virtual: beri ruang hasil
                        }}
                        placeholder="Cari kategori... (tekan / untuk fokus)"
                        aria-label="Cari kategori"
                        className="w-full pl-9 pr-10 py-2 min-h-11 text-base md:text-xs bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] rounded-xl text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 transition-all font-medium focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                          title="Hapus pencarian"
                          aria-label="Hapus pencarian"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Bar Header Kategori */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-black/10 dark:border-white/10">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      {isSearching ? "HASIL PENCARIAN" : "PILIH LEVEL / KATEGORI"}
                    </span>
                    <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                      {isDivisionsLoading ? "…" : `${filteredItems.length} Kategori`}
                    </span>
                  </div>
                </div>

                {/* ── Daftar Kategori (Area Scroll Mandiri) ────────────────── */}
                <div
                  ref={listRef}
                  className="flex-1 overflow-y-auto overscroll-contain px-1.5 py-1 space-y-2 min-h-0 select-text"
                >
                  {isDivisionsLoading ? (
                    <div className="space-y-2 py-1">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="w-full h-12 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 animate-pulse flex items-center px-3.5 gap-3 pointer-events-none"
                        >
                          <div className="w-5 h-4 bg-black/10 dark:bg-white/10 rounded" />
                          <div className="flex-1 space-y-1.5">
                            <div className="w-3/4 h-3 bg-black/10 dark:bg-white/10 rounded" />
                            <div className="w-1/3 h-2 bg-black/5 dark:bg-white/5 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : displayedItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
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
                          data-row-index={idx + 1}
                          tabIndex={0}
                          aria-label={`${cat.name}, ${pCount} proyek, ${cat.cameraOnline ?? 0} dari ${cat.cameraTotal ?? 0} CCTV online`}
                          onClick={() => handleLevelClick(currentDivKey, cat.identifier)}
                          onFocus={() => setFocusRowIndex(idx + 1)}
                          className={`group relative overflow-hidden w-full flex items-center gap-3 px-3.5 py-2.5 sm:py-3 min-h-11 text-left rounded-xl bg-white/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900/80 hover:border-[rgba(var(--div-accent-rgb),0.5)] border transition-all cursor-pointer scroll-my-1 focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none ${
                            focusRowIndex === idx + 1
                              ? "border-[rgba(var(--div-accent-rgb),0.6)] ring-1 ring-[rgba(var(--div-accent-rgb),0.4)]"
                              : "border-black/[0.06] dark:border-white/[0.06]"
                          }`}
                        >
                          {/* Ikon kategori */}
                          {(() => {
                            const CatIcon = categoryIcon(cat.name, cat.identifier);
                            return (
                              <span
                                aria-hidden="true"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(var(--div-accent-rgb),0.12)] div-accent-text"
                              >
                                <CatIcon className="h-4 w-4" />
                              </span>
                            );
                          })()}

                          {/* Nama & Jumlah Proyek + Chip CCTV */}
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {cat.name}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              <span>{pCount} proyek</span>
                              {(cat.cameraTotal ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[11px] text-slate-700 dark:text-slate-300">
                                  <span
                                    aria-hidden="true"
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
                            className="ml-auto flex items-center gap-1 font-bold text-[11px] tracking-[0.15em] shrink-0 div-accent-text"
                          >
                            MASUK{" "}
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                          </span>

                          {/* Bar Tipis Proporsi Proyek di Dasar Baris */}
                          <div
                            aria-hidden="true"
                            className="absolute bottom-0 left-0 h-[2.5px] transition-all opacity-70 group-hover:opacity-100 bg-[rgba(var(--div-accent-rgb),1)]"
                            style={{ width: `${barPercent}%` }}
                          />
                        </button>
                      );
                    })
                  )}

                  {/* Tombol Toggle "+N KATEGORI LAINNYA ▼" */}
                  {!isSearching && remainingCount > 0 && (
                    <button
                      onClick={() => setShowAllCategories((prev) => !prev)}
                      className="w-full py-2.5 px-3 mt-1 min-h-11 text-center text-[11px] font-bold tracking-wider text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/10 border border-black/[0.06] dark:border-white/[0.06] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgba(var(--div-accent-rgb),0.7)] focus-visible:outline-none"
                    >
                      {showAllCategories ? (
                        <>
                          TUTUP KATEGORI LAINNYA <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </>
                      ) : (
                        <>
                          +{remainingCount} KATEGORI LAINNYA{" "}
                          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* ── Area Bawah / Footer Note ──────────────────────────────── */}
                {!isPhone && (
                <div className="shrink-0 pt-3 border-t border-black/10 dark:border-white/10 mt-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                    Daftar level bersumber dari kategori proyek Tengok. Klik level atau tekan Enter untuk membuka peta &amp; CCTV proyek.
                  </p>
                </div>
                )}
              </motion.div>
          )
        ) : null}
      </AnimatePresence>

      {/* ── Tombol "LEWATI ▶" di pojok kanan bawah selama fase hq dan explode ── */}
      {(phase === "hq" || phase === "explode") && (
        <button
          onClick={handleSkipIntro}
          className="absolute bottom-6 right-6 max-md:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-md:right-[calc(1.5rem+env(safe-area-inset-right,0px))] z-30 px-3.5 py-2 min-h-12 md:min-h-11 rounded-xl bg-white/80 hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 border border-black/10 dark:border-white/20 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-[11px] font-bold uppercase tracking-wider backdrop-blur-md transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
          title="Lewati intro gedung ke pilihan divisi (Esc/Enter)"
        >
          <span>LEWATI</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        </button>
      )}

      {/* ── Petunjuk Tombol Keyboard di Bawah Layar (Hanya Desktop / Non-Sentuh) ── */}
      <div className="pointer-events-none fixed bottom-3 inset-x-0 z-20 hidden md:flex [@media(hover:none)]:hidden items-center justify-center">
        <div className="px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-slate-950/75 border border-black/10 dark:border-white/10 backdrop-blur-md text-[11px] text-slate-600 dark:text-slate-400 font-mono tracking-wider flex items-center gap-2 shadow-xl shadow-slate-900/15 dark:shadow-xl">
          {phase === "hq" && (
            <>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Space</kbd> / <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Enter</kbd> mulai</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Esc</kbd> lewati</span>
            </>
          )}
          {phase === "explode" && (
            <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Enter</kbd> / <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Esc</kbd> lewati</span>
          )}
          {phase === "split" && (
            <>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">←</kbd> <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">→</kbd> pilih</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">1</kbd> <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">2</kbd> <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">3</kbd> pintasan</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Enter</kbd> masuk</span>
            </>
          )}
          {phase === "detail" && (
            <>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">↓</kbd> pilih</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">/</kbd> cari</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Enter</kbd> masuk</span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span><kbd className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-slate-900 dark:text-white font-bold">Esc</kbd> kembali</span>
            </>
          )}
        </div>
      </div>

      {/* ── Region Aksesibilitas Screen Reader (Visually Hidden) ── */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Admin PIN Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Akses Admin"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-2xl"
              onClick={() => setShowPinModal(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white/95 dark:bg-slate-900/60 backdrop-blur-3xl border border-black/10 dark:border-white/10 rounded-[3rem] p-6 sm:p-12 shadow-xl shadow-slate-900/15 dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]"
            >
              <button
                onClick={() => setShowPinModal(false)}
                aria-label="Tutup"
                className="absolute top-4 sm:top-10 right-4 sm:right-10 p-3 min-h-11 min-w-11 flex items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="p-6 sm:p-8 rounded-[2.5rem] bg-yellow-500/10 mb-8 sm:mb-10 shadow-2xl shadow-yellow-500/5">
                  <ShieldAlert aria-hidden="true" className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-700 dark:text-yellow-500 stroke-[2.5]" />
                </div>

                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight uppercase mb-3 px-4">
                  Admin Access
                </h2>
                <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-bold uppercase tracking-wider dark:opacity-60 mb-10 sm:mb-12">
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
                      aria-label={`Digit PIN ${index + 1}`}
                      className="w-10 h-14 sm:w-16 sm:h-20 bg-slate-100 dark:bg-slate-950/50 border-2 border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl text-center text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white focus:border-yellow-600/70 dark:focus:border-yellow-500/50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none transition-all shadow-xl shadow-slate-900/10 dark:shadow-2xl"
                    />
                  ))}
                </div>

                <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
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