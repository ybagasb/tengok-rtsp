/**
 * Samarkan kata sandi pada URL stream (mis. RTSP) untuk TAMPILAN di layar.
 * Contoh: rtsp://admin:rahasia@10.0.0.5:554/ch1 -> rtsp://admin:••••@10.0.0.5:554/ch1
 *
 * Kata sandi boleh mengandung '@', jadi pemisah userinfo/host adalah '@' TERAKHIR
 * di bagian authority. URL tanpa kredensial dikembalikan apa adanya.
 * Hanya untuk tampilan: jangan dipakai untuk data yang dikirim/disimpan.
 */
export function maskStreamUrl(url?: string | null): string {
    if (!url) return '';
    const m = url.match(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#\s]*)(.*)$/i);
    if (!m) return url;
    const [, scheme, authority, rest] = m;
    const at = authority.lastIndexOf('@');
    if (at < 0) return url;
    const user = authority.slice(0, at).split(':')[0];
    const host = authority.slice(at + 1);
    return `${scheme}${user}:••••@${host}${rest}`;
}
