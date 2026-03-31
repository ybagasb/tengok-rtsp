import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShareLink from '@/models/ShareLink';

// DELETE — Remove a share link
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect();
        const { id } = await params;
        await ShareLink.findByIdAndDelete(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Failed to delete share link:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH — Toggle isActive status (revoke/reactivate)
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect();
        const { id } = await params;
        const link = await ShareLink.findById(id);

        if (!link) {
            return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
        }

        link.isActive = !link.isActive;
        await link.save();

        return NextResponse.json({ success: true, data: link });
    } catch (error: any) {
        console.error('Failed to update share link:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
