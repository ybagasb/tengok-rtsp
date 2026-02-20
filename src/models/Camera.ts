import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for raw data (frontend compatible)
export interface ICameraData {
    _id?: string;
    name: string;
    streamUrl: string;
    location?: string;
    picName?: string;
    picPhone?: string;
    status: 'online' | 'offline';
    createdAt: Date | string;
}

// Mongoose Document Interface
export interface ICamera extends Document, Omit<ICameraData, '_id'> {
    // metrics?
}

const CameraSchema: Schema = new Schema({
    name: { type: String, required: true },
    streamUrl: { type: String, required: true },
    location: { type: String },
    picName: { type: String },
    picPhone: { type: String },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    createdAt: { type: Date, default: Date.now },
});

const Camera: Model<ICamera> = mongoose.models.Camera || mongoose.model<ICamera>('Camera', CameraSchema);

export default Camera;
