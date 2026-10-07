// ── Rate limiter in-memory bersama ──────────────────────────────────────────
//
// PENTING — batasan desain (baca sebelum memakai untuk hal kritis):
// Limiter ini menyimpan hitungan di Map pada memori proses (module-scope).
// Artinya:
//   • Per-instance / per-bundle: TIDAK dibagi antar replica/pod. Di belakang
//     load balancer dengan >1 instance, tiap instance punya hitungan sendiri,
//     jadi batas efektif = max × jumlah instance.
//   • Hilang saat proses restart/deploy (hitungan ter-reset).
//   • Hanya cocok untuk deployment satu server. Untuk skala horizontal,
//     ganti backing store ke Redis (atau store terdistribusi lain).
//
// Dipakai oleh /api/auth/verify (anti brute-force PIN) dan /api/streams/start.

interface Bucket {
    count: number;
    resetAt: number;
}

export interface RateLimitResult {
    limited: boolean;
    retryAfterMs?: number;
}

export interface RateLimiter {
    check(key: string): RateLimitResult;
}

/**
 * Buat limiter sliding fixed-window sederhana.
 * @param max       jumlah maksimum permintaan per window per key
 * @param windowMs  panjang window dalam milidetik
 */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }): RateLimiter {
    const buckets = new Map<string, Bucket>();

    // Bersihkan entri kedaluwarsa berkala agar tidak bocor memori.
    setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets.entries()) {
            if (now > bucket.resetAt) buckets.delete(key);
        }
    }, 60_000);

    return {
        check(key: string): RateLimitResult {
            const now = Date.now();
            const bucket = buckets.get(key);

            if (!bucket || now > bucket.resetAt) {
                buckets.set(key, { count: 1, resetAt: now + windowMs });
                return { limited: false };
            }

            bucket.count++;
            if (bucket.count > max) {
                return { limited: true, retryAfterMs: bucket.resetAt - now };
            }
            return { limited: false };
        },
    };
}
