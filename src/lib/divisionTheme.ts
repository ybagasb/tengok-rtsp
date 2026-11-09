/**
 * divisionTheme.ts — sumber tunggal identitas visual + penjelasan tiap Divisi.
 * Dipakai di halaman kategori per-divisi, hero 3D, kartu, dan aksen warna.
 */

export type DivisionKey = 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';

/**
 * Tile hub "Rehab, Rekon & Bencana" di halaman /categories.
 * BUKAN divisi DB (Location.division hanya DIVISI 1/2/3). RRB adalah program
 * lintas divisi: tiap Divisi 1/2/3 punya data RRB-nya sendiri. Saat dipilih,
 * panel detailnya menampilkan 3 tombol (Divisi 1/2/3) -> sub-panel RRB divisi itu.
 */
export type HubKey = 'REHAB';

/** Semua tile di landing /categories: 3 divisi nyata + 1 hub RRB. */
export type CategoryTileKey = DivisionKey | HubKey;

// Kunci model 3D (porting dari generator prosedural).
export type DivisionModelKey = 'gedung' | 'bendungan' | 'tol';

/** Kunci model 3D untuk tile landing (termasuk model gunung 'rehab' untuk hub RRB). */
export type TileModelKey = DivisionModelKey | 'rehab';

export interface DivisionTheme {
    key: CategoryTileKey;
    short: string;            // label kode kecil, mis. "Divisi 1" (hub: label program)
    title: string;            // judul lengkap
    tagline: string;          // satu kalimat fokus
    description: string;      // penjelasan lebih panjang
    model: TileModelKey;      // objek 3D khas
    // Kelas Tailwind aksen (gradient) + warna hex untuk 3D/aksen non-Tailwind.
    gradient: string;         // "from-... to-..."
    accentHex: string;        // warna aksen utama (hex)
    glow: string;             // rgba untuk glow
    chipClass: string;        // badge kecil
    /** true untuk tile hub (RRB): panel detail = tombol divisi, bukan kategori. */
    isHub?: boolean;
}

export const DIVISION_THEME: Record<DivisionKey, DivisionTheme> = {
    'DIVISI 1': {
        key: 'DIVISI 1',
        short: 'Divisi 1',
        title: 'Gedung & Bangunan',
        tagline: 'Gedung, bangunan & fasilitas publik',
        description:
            'Membangun gedung pemerintahan, rumah sakit, sekolah, hunian vertikal, bandara, dan fasilitas publik di berbagai wilayah Indonesia maupun luar negeri.',
        model: 'gedung',
        gradient: 'from-indigo-500 to-blue-500',
        accentHex: '#3b82f6',
        glow: 'rgba(59,130,246,0.45)',
        chipClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    },
    'DIVISI 2': {
        key: 'DIVISI 2',
        short: 'Divisi 2',
        title: 'Sumber Daya Air',
        tagline: 'Bendungan, air & sumber daya air',
        description:
            'Membangun bendungan, embung, jaringan irigasi, pengendalian banjir, PLTM, serta infrastruktur sumber daya air untuk mendukung ketahanan air dan pangan.',
        model: 'bendungan',
        gradient: 'from-cyan-500 to-teal-500',
        accentHex: '#14b8a6',
        glow: 'rgba(20,184,166,0.45)',
        chipClass: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
    },
    'DIVISI 3': {
        key: 'DIVISI 3',
        short: 'Divisi 3',
        title: 'Jalan, Tol & Infrastruktur',
        tagline: 'Jalan, tol & infrastruktur transportasi',
        description:
            'Membangun jalan tol, jembatan, Bus Rapid Transit (BRT), serta jaringan perpipaan air dan gas untuk konektivitas dan infrastruktur transportasi nasional.',
        model: 'tol',
        gradient: 'from-amber-500 to-orange-500',
        accentHex: '#f59e0b',
        glow: 'rgba(245,158,11,0.45)',
        chipClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    },
};

/**
 * Tema tile hub "Rehab, Rekon & Bencana" (RRB). Bukan divisi DB — program lintas
 * divisi. Model 3D gunung berapi; aksen merah. `short` sengaja bukan "Divisi 4".
 */
export const HUB_THEME: Record<HubKey, DivisionTheme> = {
    REHAB: {
        key: 'REHAB',
        short: 'Program',
        title: 'Rehab, Rekon & Bencana',
        tagline: 'Rehabilitasi, rekonstruksi & tanggap bencana',
        description:
            'Program lintas divisi untuk rehabilitasi dan rekonstruksi infrastruktur pascabencana serta tanggap darurat. Pilih divisi untuk melihat data RRB-nya.',
        model: 'rehab',
        gradient: 'from-yellow-500 to-amber-500',
        accentHex: '#eab308',
        glow: 'rgba(234,179,8,0.45)',
        chipClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        isHub: true,
    },
};

/** Gabungan tema divisi nyata + hub RRB, dipakai halaman landing /categories. */
export const TILE_THEME: Record<CategoryTileKey, DivisionTheme> = {
    ...DIVISION_THEME,
    ...HUB_THEME,
};

export function getDivisionTheme(div?: string | null): DivisionTheme | null {
    if (!div) return null;
    return TILE_THEME[div as CategoryTileKey] ?? null;
}

/**
 * Konversi warna hex (#rrggbb atau #rgb) ke triplet string "r, g, b"
 * untuk digunakan dalam ekspresi rgba(var(--div-accent-rgb), <opacity>).
 */
export function hexToRgb(hex: string): string {
    const cleanHex = hex.replace('#', '').trim();
    const fullHex = cleanHex.length === 3
        ? cleanHex.split('').map(c => c + c).join('')
        : cleanHex;
    const num = parseInt(fullHex, 16);
    if (isNaN(num) || fullHex.length !== 6) {
        return '234, 179, 8'; // Fallback brand yellow (rgb)
    }
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r}, ${g}, ${b}`;
}

export const BRAND_THEME = {
    accentHex: '#eab308',
    accentRgb: '234, 179, 8',
    glow: 'rgba(234, 179, 8, 0.45)',
} as const;

export function getDivisionCssVars(div?: string | null): Record<string, string> {
    const theme = getDivisionTheme(div);
    if (!theme) {
        return {
            '--div-accent': BRAND_THEME.accentHex,
            '--div-accent-rgb': BRAND_THEME.accentRgb,
            '--div-glow': BRAND_THEME.glow,
        };
    }
    return {
        '--div-accent': theme.accentHex,
        '--div-accent-rgb': hexToRgb(theme.accentHex),
        '--div-glow': theme.glow,
    };
}
