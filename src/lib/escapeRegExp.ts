/**
 * Escape karakter khusus regex pada input mentah agar aman dipakai sebagai
 * pola $regex MongoDB. Mencegah ReDoS + regex-injection ketika string dari
 * klien diinterpolasi ke dalam query (mis. pencarian audit-log).
 */
export function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
