// ── Penjaga keamanan URL (anti-SSRF) ───────────────────────────────────────
//
// Dipakai sebelum server melakukan permintaan keluar atas URL yang berasal dari
// klien (mis. /api/cameras/check-status, /api/cameras/test-stream). Tujuannya
// mencegah Server-Side Request Forgery: menolak URL yang mengarah ke host
// internal/loopback/link-local/metadata (mis. 169.254.169.254 — endpoint metadata
// cloud) sehingga server tidak bisa "dipinjam" untuk mengetuk jaringan privat.
//
// BATASAN (follow-up terdokumentasi): pengecekan ini hanya range-check bila host
// berupa IP literal, plus block best-effort nama internal yang jelas (localhost).
// Ia TIDAK melakukan DNS-resolve-lalu-cek, jadi nama domain yang resolve ke IP
// privat (DNS rebinding) belum tertangani. Penguatan penuh = resolve host ke IP
// lalu range-check hasilnya sebelum request — tambahkan nanti bila diperlukan.

/** Parse angka desimal/heksa/oktal dari satu oktet IPv4 ("0x7f", "0177", "127"). */
function parseOctet(part: string): number | null {
    if (/^0x[0-9a-f]+$/i.test(part)) return parseInt(part, 16);
    if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
    if (/^\d+$/.test(part)) return parseInt(part, 10);
    return null;
}

/** True bila string host adalah IPv4 literal dalam rentang privat/loopback/link-local/metadata. */
function isPrivateIPv4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4) return false;

    const octets: number[] = [];
    for (const p of parts) {
        const n = parseOctet(p);
        if (n === null || n < 0 || n > 255) return false;
        octets.push(n);
    }

    const [a, b] = octets;
    if (a === 0) return true;                         // 0.0.0.0/8 (termasuk 0.0.0.0)
    if (a === 127) return true;                       // 127.0.0.0/8 loopback
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 (incl 169.254.169.254)
    return false;
}

/** True bila string host adalah IPv6 literal loopback / ULA (fc00::/7). */
function isPrivateIPv6(rawHost: string): boolean {
    // URL.hostname untuk IPv6 datang dalam kurung siku; buang bila ada.
    let host = rawHost.trim().toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

    if (host === '::1' || host === '::') return true; // loopback / unspecified
    // ULA fc00::/7 → prefiks fc.. atau fd..
    if (/^f[cd][0-9a-f]*:/.test(host)) return true;
    // IPv4-mapped (::ffff:127.0.0.1) — cek bagian IPv4 di ekornya.
    const v4 = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4 && isPrivateIPv4(v4[1])) return true;
    return false;
}

/** Nama host internal yang jelas (bukan IP) — block best-effort. */
function isObviousInternalName(host: string): boolean {
    const h = host.trim().toLowerCase().replace(/\.$/, '');
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === 'localhost.localdomain') return true;
    return false;
}

/** True bila host (IP literal atau nama) tergolong internal → harus ditolak. */
function isForbiddenHost(host: string): boolean {
    if (!host) return true;
    if (host.includes(':') || /^\[.*\]$/.test(host)) {
        if (isPrivateIPv6(host)) return true;
    }
    if (isPrivateIPv4(host)) return true;
    if (isObviousInternalName(host)) return true;
    return false;
}

/**
 * True bila `raw` adalah URL http/https yang aman di-fetch server-side
 * (bukan ke host internal/loopback/link-local/metadata).
 */
export function isPublicHttpUrl(raw: unknown): boolean {
    if (typeof raw !== 'string' || !raw.trim()) return false;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !isForbiddenHost(url.hostname);
}

/**
 * True bila `raw` adalah URL rtsp yang aman di-probe server-side.
 * Scheme wajib rtsp:, dengan penolakan host privat yang sama.
 */
export function isRtspUrl(raw: unknown): boolean {
    if (typeof raw !== 'string' || !raw.trim()) return false;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return false;
    }
    if (url.protocol !== 'rtsp:') return false;
    return !isForbiddenHost(url.hostname);
}
