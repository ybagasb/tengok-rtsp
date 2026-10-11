import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Location from '@/models/Location';
import { requireSuperAdmin, getAuditActor } from '@/lib/apiAuth';
import { getUsersBySubs } from '@/lib/ssoUsers';
import SsoIdentity from '@/models/SsoIdentity';
import { normalizePicSubs } from '@/lib/picIdentity';
import { logAudit } from '@/lib/adminAuditLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PIC = 50;

/**
 * GET /api/projects/[id]/pic  (super-admin only)
 * Kembalikan picSubs + display name (via sso_users). Postgres mati → pics: [].
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    const { id } = await props.params;
    await dbConnect();

    try {
        const loc = await Location.findById(id).select('_id picSubs').lean() as
            | { _id: unknown; picSubs?: string[] }
            | null;
        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        const picSubs = Array.isArray(loc.picSubs) ? loc.picSubs : [];

        // Resolve nama best-effort — Postgres mati tidak boleh menggagalkan panel.
        type Pic = { cognitoSub: string; username: string; fullName: string | null; jobTitle: string | null; email: string | null };
        const bySub = new Map<string, Pic>();

        try {
            const users = await getUsersBySubs(picSubs);
            for (const u of users) {
                bySub.set(u.cognitoSub, {
                    cognitoSub: u.cognitoSub,
                    username: u.username,
                    fullName: u.fullName,
                    jobTitle: u.jobTitle,
                    email: u.email,
                });
            }
        } catch (err) {
            console.warn('[PIC GET] Resolve nama PIC dari Postgres dilewati:', (err as { message?: string })?.message);
        }

        // Fallback 1: untuk sub yang tak ditemukan di sso_users (mis. UUID asli
        // hasil self-heal yang belum ter-update di direktori eksternal), pakai
        // jejak SsoIdentity (direkam saat user login ke TENGOK).
        const unresolved = picSubs.filter((s) => !bySub.has(s));
        if (unresolved.length > 0) {
            try {
                const idents = await SsoIdentity.find({ cognitoSub: { $in: unresolved } })
                    .select('cognitoSub username name email')
                    .lean() as Array<{ cognitoSub: string; username?: string | null; name?: string | null; email?: string | null }>;
                for (const it of idents) {
                    bySub.set(it.cognitoSub, {
                        cognitoSub: it.cognitoSub,
                        username: it.username || '',
                        fullName: it.name || null,
                        jobTitle: null,
                        email: it.email || null,
                    });
                }
            } catch (err) {
                console.warn('[PIC GET] Fallback SsoIdentity gagal:', (err as { message?: string })?.message);
            }
        }

        // Fallback 2 (jaring pengaman tampilan): JANGAN pernah biarkan chip
        // menampilkan sub mentah. Untuk sub yang masih buntu:
        //  - placeholder `ldap_<username>` → tampilkan username-nya.
        //  - UUID tak dikenal → label pendek yang ramah.
        for (const sub of picSubs) {
            if (bySub.has(sub)) continue;
            const m = /^ldap_(.+)$/.exec(sub);
            if (m) {
                bySub.set(sub, { cognitoSub: sub, username: m[1], fullName: null, jobTitle: null, email: null });
            } else {
                bySub.set(sub, { cognitoSub: sub, username: '', fullName: 'User (belum login)', jobTitle: null, email: null });
            }
        }

        const pics = Array.from(bySub.values());

        return NextResponse.json({ success: true, data: { picSubs, pics } });
    } catch (error) {
        if ((error as { name?: string })?.name === 'CastError') {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }
        console.error('[PIC GET] Error:', (error as { message?: string })?.message);
        return NextResponse.json({ success: false, error: 'Gagal memuat PIC proyek' }, { status: 500 });
    }
}

/**
 * PATCH /api/projects/[id]/pic  (super-admin only)
 * Body: { picSubs: string[] } — set daftar PIC proyek.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    const { id } = await props.params;
    await dbConnect();

    try {
        const body = await req.json();
        if (!Array.isArray(body?.picSubs)) {
            return NextResponse.json({ success: false, error: 'picSubs harus berupa array' }, { status: 400 });
        }

        // Normalisasi STRUKTURAL ("tervalidasi" = validasi struktural, bukan
        // eksistensi): trim, buang kosong, dedup, cap maks MAX_PIC.
        const clean = [...new Set(
            body.picSubs.map((s: unknown) => String(s).trim()).filter(Boolean),
        )] as string[];

        if (clean.length > MAX_PIC) {
            return NextResponse.json(
                { success: false, error: `Jumlah PIC melebihi batas maksimum (${MAX_PIC}).` },
                { status: 400 },
            );
        }

        // NORMALISASI sub → UUID asli bila diketahui. Direktori SSO eksternal
        // memberi `ldap_<username>` untuk user yang belum pernah login ke aplikasi
        // penulis sub asli; bila user itu PERNAH login ke TENGOK, SsoIdentity sudah
        // menyimpan UUID aslinya. Tukar sedini mungkin agar picSubs stabil (UUID).
        const normalized = await normalizePicSubs(clean);

        // Pengecekan eksistensi di sso_users BEST-EFFORT saja — tidak boleh memblokir
        // bila Postgres mati (NFR fail-safe). Hanya untuk warning di log.
        try {
            const found = await getUsersBySubs(normalized);
            const foundSet = new Set(found.map((u) => u.cognitoSub));
            const missing = normalized.filter((s) => !foundSet.has(s));
            if (missing.length > 0) {
                console.warn('[PIC PATCH] Sub PIC tidak ditemukan di sso_users (tetap diterima):', missing.join(', '));
            }
        } catch (err) {
            console.warn('[PIC PATCH] Verifikasi kandidat PIC dilewati: Postgres tidak tersedia:', (err as { message?: string })?.message);
        }

        const loc = await Location.findByIdAndUpdate(
            id,
            { $set: { picSubs: normalized } },
            { new: true },
        ).lean() as { _id: unknown; name: string } | null;

        if (!loc) {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }

        await logAudit({
            action: 'UPDATE',
            entity: 'Project',
            entityId: id,
            entityName: loc.name,
            by: await getAuditActor(req),
            detail: 'Memperbarui PIC proyek',
        });

        return NextResponse.json({ success: true, data: { picSubs: normalized } });
    } catch (error) {
        if ((error as { name?: string })?.name === 'CastError') {
            return NextResponse.json({ success: false, error: 'Proyek tidak ditemukan' }, { status: 404 });
        }
        console.error('[PIC PATCH] Error:', (error as { message?: string })?.message);
        return NextResponse.json({ success: false, error: 'Gagal memperbarui PIC proyek' }, { status: 400 });
    }
}
