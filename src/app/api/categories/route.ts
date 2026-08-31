import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAuth, requireAdmin, getAuditActor } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Require authentication
    const authError = await requireAuth(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        return NextResponse.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    // Only admin can create categories
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const body = await req.json();
        const actor = await getAuditActor(req);

        // Check if identifier already exists
        const existingCategory = await Category.findOne({ identifier: body.identifier });
        if (existingCategory) {
            return NextResponse.json({ error: 'Category with this identifier already exists' }, { status: 400 });
        }

        const newCategory = new Category(body);
        const savedCategory = await newCategory.save();

        logAudit({
            action: 'CREATE',
            entity: 'Category',
            entityId: savedCategory._id.toString(),
            entityName: savedCategory.name,
            by: actor,
            detail: `Membuat kategori baru: ${savedCategory.name} (${savedCategory.identifier})`,
        });

        return NextResponse.json({ success: true, category: savedCategory }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating category:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create category' },
            { status: 500 }
        );
    }
}
