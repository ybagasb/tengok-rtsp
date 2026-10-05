import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for raw data (frontend compatible)
export interface ICategoryData {
    _id?: string;
    name: string;
    identifier: string; // Used for URL params and strict matching (e.g. 'sekolah')
    description: string;
    icon: string; // Name of Lucide icon (e.g. 'School', 'Building2')
    color: string; // Tailwind gradient class (e.g. 'from-blue-500 to-cyan-400')
    defaultLat?: number;  // Default map center latitude
    defaultLng?: number;  // Default map center longitude
    defaultZoom?: number; // Default map zoom level (1-18)
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
    defaultLat: { type: Number, min: -90, max: 90 },
    defaultLng: { type: Number, min: -180, max: 180 },
    defaultZoom: { type: Number, min: 1, max: 22 },
    createdAt: { type: Date, default: Date.now },
});

// Avoid OverwriteModelError in Next.js HMR
const Category: Model<ICategory> = mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);

export default Category;
