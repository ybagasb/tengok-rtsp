import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';
import { logAudit } from '@/lib/adminAuditLog';
import { requireAdmin, getAuditActor } from '@/lib/apiAuth';
import { pickCategoryFields } from '@/lib/categoryFields';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    // Only admin can update categories
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const body = await req.json();
        const actor = await getAuditActor(req);

        // Prevent duplicate identifier if changing it
        if (body.identifier) {
            const existingCategory = await Category.findOne({
                identifier: body.identifier,
                _id: { $ne: id }
            });
            if (existingCategory) {
                return NextResponse.json({ error: 'Another category with this identifier already exists' }, { status: 400 });
            }
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            pickCategoryFields(body),
            { new: true, runValidators: true }
        );

        if (!updatedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        await logAudit({
            action: 'UPDATE',
            entity: 'Category',
            entityId: id,
            entityName: updatedCategory.name,
            by: actor,
            detail: `Memperbarui kategori: ${updatedCategory.name}`,
        });

        return NextResponse.json({ success: true, category: updatedCategory });
    } catch (error) {
        console.error('Error updating category:', error);
        return NextResponse.json(
            { error: 'Gagal memperbarui kategori' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    // Only admin can delete categories
    const authError = await requireAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const actor = await getAuditActor(req);
        const deletedCategory = await Category.findByIdAndDelete(id);

        if (!deletedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        await logAudit({
            action: 'DELETE',
            entity: 'Category',
            entityId: id,
            entityName: deletedCategory.name,
            by: actor,
            detail: `Menghapus kategori: ${deletedCategory.name}`,
        });

        return NextResponse.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        return NextResponse.json(
            { error: 'Gagal menghapus kategori' },
            { status: 500 }
        );
    }
}
