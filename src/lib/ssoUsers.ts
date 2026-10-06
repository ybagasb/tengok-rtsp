// ── Lapisan akses read-only ke PostgreSQL direktori user SSO (tabel sso_users) ──
//
// Dipakai HANYA untuk MENAMPILKAN kandidat user di UI admin (cari/ resolve nama).
// Ia TIDAK PERNAH menjadi sumber kebenaran otorisasi — jalur otorisasi
// (src/lib/apiAuth.ts) TIDAK boleh meng-import/memanggil modul ini. Dengan begitu
// outage Postgres tidak pernah membuka maupun memblokir akses tulis proyek.
//
// Asumsi nama kolom (snake_case Postgres) — bila skema berbeda, sesuaikan daftar
// SELECT & mapping di SATU tempat ini saja:
//   cognito_sub, username, full_name, email, job_title, branch_name, status
// Kolom `role` SENGAJA tidak di-SELECT: itu role aplikasi lain, bukan untuk authz TENGOK.

import { Pool } from 'pg';

declare global {
    var __tengokSsoPool: Pool | undefined;
}

export interface SsoUser {
    cognitoSub: string;        // kolom cognito_sub — satu-satunya kunci yang disimpan/dicocokkan
    username: string;
    fullName: string | null;
    email: string | null;      // display-only
    jobTitle: string | null;
    branchName: string | null;
    status: string;            // 'active' | ...
}

/** Buat/baca pool singleton di global (HMR-safe). Throw bila env wajib kosong. */
function getPool(): Pool {
    if (global.__tengokSsoPool) return global.__tengokSsoPool;

    const host = process.env.SSO_PG_HOST;
    const database = process.env.SSO_PG_DATABASE;
    const user = process.env.SSO_PG_USER;
    const password = process.env.SSO_PG_PASSWORD;

    if (!host || !database || !user || !password) {
        throw new Error('SSO Postgres belum dikonfigurasi');
    }

    const pool = new Pool({
        host,
        port: Number(process.env.SSO_PG_PORT) || 5432,
        database,
        user,
        password,
        // Host internal (10.10.56.96) tanpa SSL kecuali SSO_PG_SSL=require.
        ssl: process.env.SSO_PG_SSL === 'require' ? { rejectUnauthorized: false } : false,
        max: 4,
        connectionTimeoutMillis: 8000,
        statement_timeout: 8000,
        query_timeout: 8000,
        idleTimeoutMillis: 10000,
    });

    // Jangan sampai error pool yang tak tertangani meng-crash proses (NFR fail-safe).
    pool.on('error', (err) => {
        console.warn('[ssoUsers] Pool error:', err?.message);
    });

    global.__tengokSsoPool = pool;
    return pool;
}

/** Escape karakter wildcard LIKE agar input user tidak menjadi pola liar. */
function escapeLike(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Cari user SSO berdasarkan username/full_name/email (ILIKE).
 * Parameterized penuh. Lempar error apa adanya bila Postgres gagal/tak dikonfigurasi
 * (ditangkap oleh route pemanggil → 503).
 */
export async function searchUsers(
    query: string,
    opts?: { activeOnly?: boolean; limit?: number },
): Promise<SsoUser[]> {
    const activeOnly = opts?.activeOnly ?? true;
    const rawLimit = Number(opts?.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.round(rawLimit))) : 20;
    const pattern = '%' + escapeLike((query || '').trim()) + '%';

    const pool = getPool();
    const res = await pool.query(
        `SELECT cognito_sub, username, full_name, email, job_title, branch_name, status
         FROM sso_users
         WHERE ($2::boolean IS FALSE OR status = 'active')
           AND (username ILIKE $1 OR full_name ILIKE $1 OR email ILIKE $1)
         ORDER BY username ASC
         LIMIT $3`,
        [pattern, activeOnly, limit],
    );

    return res.rows
        .filter((r) => r.cognito_sub)                 // buang baris tanpa cognito_sub
        .map(mapRow);
}

/**
 * Resolve display user berdasarkan daftar cognito_sub. TANPA filter status
 * (PIC lama yang sudah non-active tetap bisa ditampilkan). subs kosong → [].
 */
export async function getUsersBySubs(subs: string[]): Promise<SsoUser[]> {
    const clean = [...new Set((subs || []).map((s) => String(s).trim()).filter(Boolean))];
    if (clean.length === 0) return [];

    const pool = getPool();
    const res = await pool.query(
        `SELECT cognito_sub, username, full_name, email, job_title, branch_name, status
         FROM sso_users
         WHERE cognito_sub = ANY($1::text[])`,
        [clean],
    );

    return res.rows
        .filter((r) => r.cognito_sub)
        .map(mapRow);
}

/** Map baris snake_case Postgres ke SsoUser. */
function mapRow(r: Record<string, unknown>): SsoUser {
    return {
        cognitoSub: String(r.cognito_sub),
        username: r.username != null ? String(r.username) : '',
        fullName: r.full_name != null ? String(r.full_name) : null,
        email: r.email != null ? String(r.email) : null,
        jobTitle: r.job_title != null ? String(r.job_title) : null,
        branchName: r.branch_name != null ? String(r.branch_name) : null,
        status: r.status != null ? String(r.status) : '',
    };
}
