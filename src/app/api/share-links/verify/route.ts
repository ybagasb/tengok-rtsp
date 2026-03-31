import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ShareLink from '@/models/ShareLink';

// POST — Verify a share link token
export async function POST(req: Request) {
    try {
        await dbConnect();
        const { token } = await req.json();

        if (!token) {
            return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 });
        }

        const link = await ShareLink.findOne({ token })
            .populate({
                path: 'locations',
                populate: {
                    path: 'cameras',
                    model: 'Camera',
                }
            })
            .lean();

        if (!link) {
            return NextResponse.json({ valid: false, error: 'invalid' }, { status: 404 });
        }

        if (!link.isActive) {
            return NextResponse.json({ valid: false, error: 'revoked' }, { status: 403 });
        }

        if (new Date(link.expiresAt) < new Date()) {
            return NextResponse.json({ valid: false, error: 'expired' }, { status: 410 });
        }

        // Update access stats (fire-and-forget)
        ShareLink.updateOne(
            { _id: link._id },
            { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } }
        ).catch(() => {});

        return NextResponse.json({
            valid: true,
            data: {
                label: link.label,
                locations: link.locations,
                expiresAt: link.expiresAt,
                duration: link.duration,
            }
        });
    } catch (error: any) {
        console.error('Failed to verify share link:', error);
        return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
    }
}
