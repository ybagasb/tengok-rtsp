// Allowlist field kamera + helper penyaring body. Dipisah dari route handler
// karena file route.ts hanya boleh mengekspor handler/konfig Next (bukan helper
// biasa). Dipakai oleh POST /api/cameras dan PUT /api/cameras/[id].

// Field kamera yang boleh ditulis lewat create/update. Hanya field yang ada di
// schema Camera; body mentah tidak boleh di-$set langsung agar tidak ada field
// tak terduga yang tersisip.
export const CAMERA_EDITABLE_FIELDS = [
    'name', 'streamUrl', 'status', 'lastCheckedAt', 'lastOnlineAt',
] as const;

/** Salin HANYA key allowlist dari body kamera. */
export function pickCameraFields(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of CAMERA_EDITABLE_FIELDS) {
        if (field in body) out[field] = body[field];
    }
    return out;
}
