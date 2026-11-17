/**
 * Pengelompokan kategori di panel /categories — MURNI (tanpa mongoose/React).
 *
 * Satu grup tampil sebagai SATU baris di daftar kategori divisi; saat diklik panel
 * membuka daftar sub-kategori (kategori aslinya). Data proyek TIDAK berubah:
 * proyek tetap memakai Category.identifier masing-masing, grup hanya tampilan.
 *
 * Menambah grup = tambah satu entri di CATEGORY_GROUPS. `id` grup harus unik dan
 * TIDAK boleh sama dengan Category.identifier mana pun.
 */

export interface CategoryGroup {
    /** Id grup (bukan Category.identifier). */
    id: string;
    /** Nama baris induk di panel. */
    name: string;
    /** Divisi pemilik grup (nilai Location.division). */
    division: string;
    /** Category.identifier anggota grup, urutan = urutan sub-kategori. */
    children: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
    { id: 'grup-sekolah', name: 'Sekolah', division: 'DIVISI 1', children: ['sekolah-rakyat', 'sekolah'] },
];

export function groupById(id: string | null | undefined): CategoryGroup | undefined {
    return id ? CATEGORY_GROUPS.find((g) => g.id === id) : undefined;
}

/**
 * Baris kategori yang cakupannya LEBIH LUAS dari satu Category.identifier: jumlah proyek/kamera
 * baris itu dan peta yang dibuka mencakup kategori tambahan (`include`). Kategori tambahan
 * tetap punya barisnya sendiri. Dipakai agar "PL Irigasi & JIAT" = Irigasi PL + JIAT,
 * sama dengan isi dashboard-nya (lib/categoryDashboards.ts).
 */
export interface CategoryUnion {
    division: string;
    /** Category.identifier baris ini. */
    identifier: string;
    /** Category.identifier lain yang ikut dihitung dan ikut tampil di peta. */
    include: string[];
}

export const CATEGORY_UNIONS: CategoryUnion[] = [
    { division: 'DIVISI 2', identifier: 'jiat', include: ['irigasi-pl'] },
];

/** Daftar Category.identifier untuk peta saat baris `identifier` dibuka (urutan: baris itu dulu). */
export function mapCategoriesFor(division: string, identifier: string): string[] {
    const u = CATEGORY_UNIONS.find((x) => x.division === division && x.identifier === identifier);
    return u ? [identifier, ...u.include] : [identifier];
}

export interface CategoryLike {
    identifier: string;
    name: string;
    projectCount?: number;
    filledCount?: number;
    cameraTotal?: number;
    cameraOnline?: number;
}

export type GroupedCategory<T extends CategoryLike> = T & { children?: T[] };

/** Jumlahkan angka baris dengan kategori tambahannya (lihat CATEGORY_UNIONS). Kategori lain tak berubah. */
export function applyCategoryUnions<T extends CategoryLike>(division: string, items: T[]): T[] {
    const unions = CATEGORY_UNIONS.filter((u) => u.division === division);
    if (unions.length === 0) return items;
    return items.map((item) => {
        const u = unions.find((x) => x.identifier === item.identifier);
        if (!u) return item;
        const extra = items.filter((i) => u.include.includes(i.identifier));
        if (extra.length === 0) return item;
        const add = (pick: (c: T) => number | undefined) => extra.reduce((acc, c) => acc + (pick(c) ?? 0), 0);
        return {
            ...item,
            projectCount: (item.projectCount ?? 0) + add((c) => c.projectCount),
            filledCount: (item.filledCount ?? 0) + add((c) => c.filledCount),
            cameraTotal: (item.cameraTotal ?? 0) + add((c) => c.cameraTotal),
            cameraOnline: (item.cameraOnline ?? 0) + add((c) => c.cameraOnline),
        };
    });
}

/**
 * Lipat kategori anggota grup menjadi satu item induk (jumlah proyek, data terisi, dan
 * kamera dijumlahkan). Kategori lain dibiarkan. Grup yang tak punya anggota di divisi
 * ini tidak dibuat. Posisi item induk = posisi anggota pertama yang ditemui.
 */
export function groupCategories<T extends CategoryLike>(division: string, items: T[]): GroupedCategory<T>[] {
    const groups = CATEGORY_GROUPS.filter((g) => g.division === division);
    if (groups.length === 0) return items;

    const out: GroupedCategory<T>[] = [];
    const emitted = new Set<string>();
    for (const item of items) {
        const g = groups.find((x) => x.children.includes(item.identifier));
        if (!g) { out.push(item); continue; }
        if (emitted.has(g.id)) continue;
        emitted.add(g.id);

        const kids = g.children
            .map((id) => items.find((i) => i.identifier === id))
            .filter((i): i is T => !!i);
        const sum = (pick: (c: T) => number | undefined) => kids.reduce((acc, c) => acc + (pick(c) ?? 0), 0);
        out.push({
            identifier: g.id,
            name: g.name,
            projectCount: sum((c) => c.projectCount),
            filledCount: sum((c) => c.filledCount),
            cameraTotal: sum((c) => c.cameraTotal),
            cameraOnline: sum((c) => c.cameraOnline),
            children: kids,
        } as unknown as GroupedCategory<T>);
    }
    return out;
}
