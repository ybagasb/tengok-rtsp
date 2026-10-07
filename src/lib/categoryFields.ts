// Allowlist field kategori + helper penyaring body. Dipisah dari route handler
// karena file route.ts hanya boleh mengekspor handler/konfig Next (bukan helper
// biasa). Dipakai oleh POST /api/categories dan PUT /api/categories/[id].

// Field kategori yang boleh ditulis lewat create/update. Hanya field schema
// Category; body mentah tidak boleh di-$set langsung.
export const CATEGORY_EDITABLE_FIELDS = [
    'name', 'identifier', 'description', 'icon', 'color', 'defaultLat', 'defaultLng', 'defaultZoom',
] as const;

/** Salin HANYA key allowlist dari body kategori. */
export function pickCategoryFields(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of CATEGORY_EDITABLE_FIELDS) {
        if (field in body) out[field] = body[field];
    }
    return out;
}
