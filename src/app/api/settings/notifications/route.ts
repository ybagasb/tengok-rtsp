import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Settings, { DEFAULT_NOTIFICATION_SETTINGS, INotice } from '@/models/Settings';
import { requireAdmin, getAuditActor } from '@/lib/apiAuth';
import { logAudit } from '@/lib/adminAuditLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SETTINGS_KEY = 'cctv-notices';
const VALID_TYPES = ['info', 'tip', 'warning'] as const;

// Bentuk mentah notice dari klien (tidak dipercaya, divalidasi di bawah).
interface RawNotice {
    id?: unknown;
    type?: unknown;
    title?: unknown;
    message?: unknown;
    enabled?: unknown;
}

/**
 * GET /api/settings/notifications  (PUBLIC)
 * Read the CCTV notices config. Public so the shared/public map view can render
 * it. Returns the built-in defaults when nothing has been saved yet.
 */
export async function GET() {
    try {
        await dbConnect();
        const doc = await Settings.findOne({ key: SETTINGS_KEY }).lean();
        if (!doc) {
            return NextResponse.json({ success: true, data: DEFAULT_NOTIFICATION_SETTINGS });
        }
        return NextResponse.json({
            success: true,
            data: {
                key: SETTINGS_KEY,
                enabled: doc.enabled ?? true,
                autoDismissSec: doc.autoDismissSec ?? 8,
                notices: doc.notices ?? [],
            },
        });
    } catch {
        // On failure, fall back to defaults so the UI still shows something.
        return NextResponse.json({ success: true, data: DEFAULT_NOTIFICATION_SETTINGS });
    }
}

/**
 * PUT /api/settings/notifications  (ADMIN / SSO only)
 * Replace the whole notices config.
 */
export async function PUT(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const body = await req.json();
        const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
        const autoDismissSec = Number.isFinite(body.autoDismissSec)
            ? Math.max(0, Math.min(120, Math.round(body.autoDismissSec)))
            : 8;

        // Sanitize the notices array — never trust the client shape.
        const rawNotices = Array.isArray(body.notices) ? body.notices : [];
        const notices: INotice[] = rawNotices
            .filter((n: RawNotice): n is RawNotice & { message: string } => !!n && typeof n.message === 'string' && n.message.trim().length > 0)
            .slice(0, 20) // hard cap
            .map((n: RawNotice & { message: string }, i: number): INotice => ({
                id: typeof n.id === 'string' && n.id.trim() ? n.id : `notice-${Date.now()}-${i}`,
                type: (VALID_TYPES as readonly unknown[]).includes(n.type) ? (n.type as INotice['type']) : 'info',
                title: typeof n.title === 'string' ? n.title.slice(0, 120) : '',
                message: n.message.slice(0, 600),
                enabled: n.enabled !== false,
            }));

        const updated = await Settings.findOneAndUpdate(
            { key: SETTINGS_KEY },
            { key: SETTINGS_KEY, enabled, autoDismissSec, notices },
            { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
        ).lean();

        const actor = await getAuditActor(req);
        logAudit({
            action: 'UPDATE',
            entity: 'Settings',
            entityId: SETTINGS_KEY,
            entityName: 'Notifikasi CCTV',
            by: actor,
            detail: `Memperbarui notifikasi CCTV (${notices.length} notice, master ${enabled ? 'ON' : 'OFF'})`,
        });

        return NextResponse.json({ success: true, data: updated });
    } catch {
        return NextResponse.json(
            { success: false, error: 'Gagal menyimpan pengaturan notifikasi' },
            { status: 400 }
        );
    }
}
