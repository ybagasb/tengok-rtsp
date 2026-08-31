import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import dbConnect from '@/lib/db';
import ShareLink from '@/models/ShareLink';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAdmin, getAuditActor } from '@/lib/apiAuth';

// GET — List all share links (admin only)
export async function GET(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        await dbConnect();
        const links = await ShareLink.find()
            .populate('locations', 'name category')
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json({ success: true, data: links });
    } catch (error: any) {
        console.error('Failed to fetch share links:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST — Create a new share link (admin only)
export async function POST(req: NextRequest) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        await dbConnect();
        const { label, locationIds, duration } = await req.json();

        if (!label || !locationIds?.length || !duration) {
            return NextResponse.json(
                { error: 'Missing required fields: label, locationIds, duration' },
                { status: 400 }
            );
        }

        const allowedDurations = [30, 60, 120, 180];
        if (!allowedDurations.includes(duration)) {
            return NextResponse.json(
                { error: 'Invalid duration. Allowed: 30, 60, 120, 180 minutes' },
                { status: 400 }
            );
        }

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + duration * 60 * 1000);

        const shareLink = await ShareLink.create({
            token,
            label,
            locations: locationIds,
            duration,
            expiresAt,
            isActive: true,
        });

        const actor = await getAuditActor(req);
        logAudit({
            action: 'CREATE',
            entity: 'ShareLink',
            entityId: shareLink._id.toString(),
            entityName: label,
            by: actor,
            detail: `Membuat link berbagi: "${label}" (${duration} menit)`,
        });

        const populated = await ShareLink.findById(shareLink._id)
            .populate('locations', 'name category')
            .lean();

        return NextResponse.json({ success: true, data: populated }, { status: 201 });
    } catch (error: any) {
        console.error('Failed to create share link:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
