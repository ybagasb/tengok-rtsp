import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for raw data (frontend compatible)
export interface ICameraData {
    _id?: string;
    name: string;
    streamUrl: string;
    status: 'online' | 'offline';
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
    lastCheckedAt: { type: Date },
    lastOnlineAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
});

const Camera: Model<ICamera> = mongoose.models.Camera || mongoose.model<ICamera>('Camera', CameraSchema);

export default Camera;
