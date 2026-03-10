import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> | any }) {
    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const body = await request.json();

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
            body,
            { new: true, runValidators: true }
        );

        if (!updatedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, category: updatedCategory });
    } catch (error: any) {
        console.error('Error updating category:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update category' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> | any }) {
    await dbConnect();
    try {
        const { id } = await context.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid Category ID' }, { status: 400 });
        }

        const deletedCategory = await Category.findByIdAndDelete(id);

        if (!deletedCategory) {
            return NextResponse.json({ error: 'Category not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Category deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting category:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete category' },
            { status: 500 }
        );
    }
}
