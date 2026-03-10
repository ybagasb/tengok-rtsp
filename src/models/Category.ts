import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for raw data (frontend compatible)
export interface ICategoryData {
    _id?: string;
    name: string;
    identifier: string; // Used for URL params and strict matching (e.g. 'sekolah')
    description: string;
    icon: string; // Name of Lucide icon (e.g. 'School', 'Building2')
    color: string; // Tailwind gradient class (e.g. 'from-blue-500 to-cyan-400')
    createdAt?: Date | string;
}

// Mongoose Document Interface
export interface ICategory extends Document, Omit<ICategoryData, '_id'> { }

const CategorySchema: Schema = new Schema({
    name: { type: String, required: true },
    identifier: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    color: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

// Avoid OverwriteModelError in Next.js HMR
const Category: Model<ICategory> = mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);

export default Category;
