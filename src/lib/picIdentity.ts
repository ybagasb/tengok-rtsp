// Utilitas identitas PIC — menstabilkan nilai Location.picSubs.
//
// Direktori SSO eksternal (sso_users / Postgres) menyimpan cognito_sub berformat
// placeholder `ldap_<username>` untuk user yang BELUM pernah login ke aplikasi
// yang menuliskan sub Cognito asli. Nilai itu bisa masuk ke picSubs saat admin
// menetapkan PIC. Modul ini menukar placeholder → UUID asli begitu UUID itu
// diketahui (direkam di SsoIdentity saat user login ke TENGOK), sehingga picSubs
// konvergen ke bentuk stabil (UUID) dan otorisasi via sub langsung selalu cocok.
//
// Tidak menyentuh Postgres: sumber data hanya SsoIdentity (Mongo). Fail-safe:
// bila lookup gagal, nilai dikembalikan apa adanya (tidak pernah menghapus PIC).
import dbConnect from '@/lib/db';
import SsoIdentity from '@/models/SsoIdentity';

const LDAP_RE = /^ldap_(.+)$/;

/**
 * Tukar tiap `ldap_<username>` dengan UUID asli bila SsoIdentity mengenal username
 * itu. Nilai non-placeholder (UUID) dilewatkan apa adanya. Hasil di-dedup &
 * mempertahankan urutan. Aman dipanggil berkali-kali (idempoten).
 */
export async function normalizePicSubs(subs: string[]): Promise<string[]> {
    const input = [...new Set((subs || []).map((s) => String(s).trim()).filter(Boolean))];
    if (input.length === 0) return [];

    // Kumpulkan username dari placeholder untuk satu kali query.
    const usernames = input
        .map((s) => LDAP_RE.exec(s)?.[1])
        .filter((u): u is string => !!u);

    if (usernames.length === 0) return input;

    let mapByUsername = new Map<string, string>(); // username → cognito_sub asli (UUID)
    try {
        await dbConnect();
        const idents = await SsoIdentity.find({ username: { $in: usernames } })
            .select('cognitoSub username')
            .lean() as Array<{ cognitoSub: string; username?: string | null }>;
        for (const it of idents) {
            // Hanya petakan ke sub yang BUKAN placeholder (UUID asli).
            if (it.username && it.cognitoSub && !LDAP_RE.test(it.cognitoSub)) {
                mapByUsername.set(it.username, it.cognitoSub);
            }
        }
    } catch (err) {
        console.warn('[normalizePicSubs] lookup SsoIdentity gagal:', (err as { message?: string })?.message);
        mapByUsername = new Map();
    }

    const out = input.map((s) => {
        const m = LDAP_RE.exec(s);
        if (!m) return s;
        const real = mapByUsername.get(m[1]);
        return real || s; // belum login ke TENGOK → biarkan placeholder (akan ter-heal nanti)
    });

    return [...new Set(out)];
}

/**
 * Self-heal preventif saat user login: ganti placeholder `ldap_<username>` di
 * SEMUA proyek dengan UUID asli user ini. Dengan begitu PIC bisa langsung edit
 * tanpa harus membuka tiap proyek lebih dulu. Best-effort; error tak dilempar.
 */
export async function healPicSubsForUser(cognitoSub: string, username: string | null | undefined): Promise<void> {
    if (!cognitoSub || !username || LDAP_RE.test(cognitoSub)) return;
    const placeholder = `ldap_${username}`;
    try {
        await dbConnect();
        const Location = (await import('@/models/Location')).default;
        // Ganti placeholder → sub asli di semua Location yang memuatnya.
        // $addToSet lalu $pull menjaga tidak ada duplikat bila sub asli sudah ada.
        await Location.updateMany(
            { picSubs: placeholder },
            { $addToSet: { picSubs: cognitoSub } },
        );
        await Location.updateMany(
            { picSubs: placeholder },
            { $pull: { picSubs: placeholder } },
        );
    } catch (err) {
        console.warn('[healPicSubsForUser] gagal:', (err as { message?: string })?.message);
    }
}
