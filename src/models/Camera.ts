import mongoose, { Schema, Document, Model } from 'mongoose';
import type { DivisiName } from '@/models/AppRole';

// Interface for raw data (frontend compatible)
export interface ICameraData {
    _id?: string;
    name: string;
    streamUrl: string;
    status: 'online' | 'offline';
    division?: DivisiName | null;
    lastCheckedAt?: Date | string;
    lastOnlineAt?: Date | string;
    createdAt: Date | string;
    location?: string;
    picName?: string;
    picPhone?: string;
}

// Mongoose Document Interface
export interface ICamera extends Document, Omit<ICameraData, '_id'> {
    // metrics?
}

const CameraSchema: Schema = new Schema({
    name: { type: String, required: true },
    streamUrl: { type: String, required: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    division: { type: String, enum: ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'], default: null, index: true },
    lastCheckedAt: { type: Date },
    lastOnlineAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
});

const Camera: Model<ICamera> = mongoose.models.Camera || mongoose.model<ICamera>('Camera', CameraSchema);

export default Camera;
