import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';
import Location from '@/models/Location';
import { logAudit } from '@/lib/adminAuditLog';
import { requireSuperAdmin, getAuditActor } from '@/lib/apiAuth';
import { pickCategoryFields } from '@/lib/categoryFields';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    // Only super-admin can update categories
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const body = await req.json();
        const actor = await getAuditActor(req);

        const existing = await Category.findById(id).lean<{ identifier: string; name: string }>();
        if (!existing) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        // Prevent duplicate identifier if changing it
        if (body.identifier) {
            const duplicateCategory = await Category.findOne({
                identifier: body.identifier,
                _id: { $ne: id }
            });
            if (duplicateCategory) {
                return NextResponse.json({ error: 'Another category with this identifier already exists' }, { status: 400 });
            }
        }

        const fields = pickCategoryFields(body);
        const $set: Record<string, unknown> = {};
        const $unset: Record<string, ''> = {};
        for (const [k, v] of Object.entries(fields)) {
            if (v === null || v === undefined || v === '') {
                if (k === 'defaultLat' || k === 'defaultLng' || k === 'defaultZoom') {
                    $unset[k] = '';
                }
            } else {
                $set[k] = v;
            }
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
            { new: true, runValidators: true }
        );

        if (!updatedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        // Bila identifier berubah, ikut migrasikan semua Location.category agar proyek tidak terputus
        if (typeof fields.identifier === 'string' && fields.identifier && fields.identifier !== existing.identifier) {
            await Location.updateMany(
                { category: existing.identifier },
                { $set: { category: fields.identifier } },
            );
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
    // Only super-admin can delete categories
    const authError = await requireSuperAdmin(req);
    if (authError) return authError;

    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const existing = await Category.findById(id).lean<{ identifier: string; name: string }>();
        if (!existing) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        const usedCount = await Location.countDocuments({ category: existing.identifier });
        if (usedCount > 0) {
            return NextResponse.json(
                { error: `Kategori "${existing.name}" masih digunakan oleh ${usedCount} proyek. Pindahkan atau hapus proyek terkait terlebih dahulu.` },
                { status: 400 },
            );
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
