import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import AppRole, { type AppRoleName, type DivisiName } from '@/models/AppRole';
import { requireSuperAdmin, getAuditActor, isBootstrapAdmin } from '@/lib/apiAuth';
import { getUsersBySubs } from '@/lib/ssoUsers';
import SsoIdentity from '@/models/SsoIdentity';
import { logAudit } from '@/lib/adminAuditLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_DIVISI: readonly DivisiName[] = ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'];

/** Daftar cognito_sub bootstrap dari env (implisit super-admin, tidak dapat dicabut). */
function bootstrapSubs(): string[] {
    return [...new Set(
        (process.env.TENGOK_BOOTSTRAP_ADMIN_SUBS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    )];
}

/**
 * GET /api/admin/roles  (super-admin only)
 * Daftar super-admin + admin divisi: entri AppRole + subs bootstrap env.
 */
export async function GET(req: NextRequest) {
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const rows = await AppRole.find({}).lean() as Array<{
            cognitoSub: string;
            role: AppRoleName;
            divisi?: DivisiName | null;
            createdBy?: string;
            createdAt?: Date | string;
        }>;

        const boots = bootstrapSubs();
        const bootSet = new Set(boots);

        type RoleRow = {
            cognitoSub: string;
            role: AppRoleName;
            divisi: DivisiName | null;
            username: string;
            fullName: string | null;
            jobTitle: string | null;
            isBootstrap: boolean;
            removable: boolean;
            createdBy?: string;
            createdAt?: Date | string;
        };

        const bySub = new Map<string, RoleRow>();

        for (const r of rows) {
            const isBoot = bootSet.has(r.cognitoSub);
            bySub.set(r.cognitoSub, {
                cognitoSub: r.cognitoSub,
                role: isBoot ? 'superadmin' : (r.role || 'superadmin'),
                divisi: isBoot ? null : (r.divisi ?? null),
                username: '',
                fullName: null,
                jobTitle: null,
                isBootstrap: isBoot,
                removable: !isBoot,
                createdBy: r.createdBy,
                createdAt: r.createdAt,
            });
        }

        for (const sub of boots) {
            if (!bySub.has(sub)) {
                bySub.set(sub, {
                    cognitoSub: sub,
                    role: 'superadmin',
                    divisi: null,
                    username: '',
                    fullName: null,
                    jobTitle: null,
                    isBootstrap: true,
                    removable: false,
                });
            }
        }

        const allSubs = [...bySub.keys()];

        // Resolve display name best-effort — Postgres mati → nama kosong (UI fallback ke sub).
        try {
            const users = await getUsersBySubs(allSubs);
            for (const u of users) {
                const row = bySub.get(u.cognitoSub);
                if (row) {
                    row.username = u.username;
                    row.fullName = u.fullName;
                    row.jobTitle = u.jobTitle;
                }
            }
        } catch (err) {
            console.warn('[Roles GET] Resolve nama dilewati: Postgres tidak tersedia:', (err as { message?: string })?.message);
        }

        // Fallback: sub yang belum ter-resolve (Postgres mati / user tak ada di direktori)
        // dicari di SsoIdentity — jejak yang direkam saat user login ke TENGOK.
        const unresolved = [...bySub.values()].filter((r) => !r.fullName && !r.username).map((r) => r.cognitoSub);
        if (unresolved.length > 0) {
            try {
                const idents = await SsoIdentity.find({ cognitoSub: { $in: unresolved } })
                    .select('cognitoSub username name')
                    .lean() as Array<{ cognitoSub: string; username?: string | null; name?: string | null }>;
                for (const i of idents) {
                    const row = bySub.get(i.cognitoSub);
                    if (row) {
                        row.username = i.username || row.username;
                        row.fullName = i.name || row.fullName;
                    }
                }
            } catch (err) {
                console.warn('[Roles GET] Fallback SsoIdentity gagal:', (err as { message?: string })?.message);
            }
        }

        const allRows = [...bySub.values()];
        const admins = allRows.filter((r) => r.role === 'superadmin');
        const divisiAdmins = allRows
            .filter((r) => r.role === 'divisi_admin')
            .sort((a, b) => (a.divisi || '').localeCompare(b.divisi || '') || (a.fullName || a.username).localeCompare(b.fullName || b.username));

        return NextResponse.json({ success: true, data: { admins, divisiAdmins } });
    } catch (error) {
        console.error('[Roles GET] Error:', (error as { message?: string })?.message);
        return NextResponse.json({ success: false, error: 'Gagal memuat daftar hak akses' }, { status: 500 });
    }
}

/**
 * POST /api/admin/roles  (super-admin only)
 * Body: { cognitoSub, role?: 'superadmin' | 'divisi_admin', divisi?: DivisiName }
 * Tambah atau perbarui hak akses (upsert).
 */
export async function POST(req: NextRequest) {
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const body = await req.json();
        const cognitoSub = typeof body?.cognitoSub === 'string' ? body.cognitoSub.trim() : '';
        if (!cognitoSub) {
            return NextResponse.json({ success: false, error: 'cognitoSub wajib diisi' }, { status: 400 });
        }

        const role: AppRoleName = body?.role === 'divisi_admin' ? 'divisi_admin' : 'superadmin';
        const divisi: DivisiName | null =
            role === 'divisi_admin' ? (VALID_DIVISI.includes(body?.divisi) ? body.divisi : null) : null;

        if (role === 'divisi_admin' && !divisi) {
            return NextResponse.json(
                { success: false, error: 'Divisi wajib dipilih untuk Admin Divisi (DIVISI 1 / 2 / 3)' },
                { status: 400 },
            );
        }

        if (isBootstrapAdmin(cognitoSub) && role !== 'superadmin') {
            return NextResponse.json(
                { success: false, error: 'Admin bootstrap tidak dapat diturunkan ke Admin Divisi.' },
                { status: 400 },
            );
        }

        const actor = await getAuditActor(req);
        await AppRole.updateOne(
            { cognitoSub },
            { $set: { role, divisi, createdBy: actor, createdAt: new Date() } },
            { upsert: true },
        );

        await logAudit({
            action: 'CREATE',
            entity: 'Settings',
            entityId: cognitoSub,
            entityName: cognitoSub,
            by: actor,
            detail: role === 'divisi_admin' ? `Menetapkan Admin ${divisi}` : 'Menambah super-admin',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Roles POST] Error:', (error as { message?: string })?.message);
        return NextResponse.json({ success: false, error: 'Gagal menyimpan hak akses' }, { status: 400 });
    }
}

/**
 * DELETE /api/admin/roles?sub=<cognito_sub>  (super-admin only)
 * Cabut hak akses (super-admin atau admin divisi). Sub bootstrap tidak dapat dicabut.
 */
export async function DELETE(req: NextRequest) {
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    await dbConnect();

    try {
        const sub = (req.nextUrl.searchParams.get('sub') || '').trim();
        if (!sub) {
            return NextResponse.json({ success: false, error: 'Parameter sub wajib diisi' }, { status: 400 });
        }
        if (isBootstrapAdmin(sub)) {
            return NextResponse.json(
                { success: false, error: 'Admin bootstrap tidak dapat dicabut via API.' },
                { status: 400 },
            );
        }

        const removed = await AppRole.findOneAndDelete({ cognitoSub: sub }).lean<{ role?: string; divisi?: string }>();

        await logAudit({
            action: 'DELETE',
            entity: 'Settings',
            entityId: sub,
            entityName: sub,
            by: await getAuditActor(req),
            detail: removed?.role === 'divisi_admin'
                ? `Mencabut Admin ${removed.divisi || 'Divisi'}`
                : 'Mencabut super-admin',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Roles DELETE] Error:', (error as { message?: string })?.message);
        return NextResponse.json({ success: false, error: 'Gagal mencabut hak akses' }, { status: 400 });
    }
}
