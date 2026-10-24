import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShareLink from '@/models/ShareLink';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAdmin, getAuditActor } from '@/lib/apiAuth';

// DELETE — Remove a share link (admin only)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        await dbConnect();
        const { id } = await params;
        const actor = await getAuditActor(req);
        const link = await ShareLink.findByIdAndDelete(id);

        if (link) {
            logAudit({
                action: 'DELETE',
                entity: 'ShareLink',
                entityId: id,
                entityName: link.label || 'Share Link',
                by: actor,
                detail: `Menghapus link berbagi: "${link.label}"`,
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete share link:', error);
        return NextResponse.json({ error: 'Gagal menghapus share link' }, { status: 500 });
    }
}

// PATCH — Toggle isActive status (admin only)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    try {
        await dbConnect();
        const { id } = await params;
        const actor = await getAuditActor(req);
        const link = await ShareLink.findById(id);

        if (!link) {
            return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
        }

        link.isActive = !link.isActive;
        await link.save();

        logAudit({
            action: 'UPDATE',
            entity: 'ShareLink',
            entityId: id,
            entityName: link.label || 'Share Link',
            by: actor,
            detail: `${link.isActive ? 'Mengaktifkan' : 'Menonaktifkan'} link berbagi: "${link.label}"`,
        });

        return NextResponse.json({ success: true, data: link });
    } catch (error) {
        console.error('Failed to update share link:', error);
        return NextResponse.json({ error: 'Gagal memperbarui share link' }, { status: 500 });
    }
}
