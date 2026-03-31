import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IShareLinkData {
    _id?: string;
    token: string;
    label: string;
    locations: string[] | mongoose.Types.ObjectId[];
    duration: number; // in minutes: 30, 60, 120, 180
    expiresAt: Date;
    createdAt: Date | string;
    isActive: boolean;
    accessCount: number;
    lastAccessedAt?: Date | string | null;
}

export interface IShareLink extends Document, Omit<IShareLinkData, '_id' | 'locations'> {
    locations: mongoose.Types.ObjectId[];
}

const ShareLinkSchema: Schema = new Schema({
    token: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    locations: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
    duration: { type: Number, required: true, enum: [30, 60, 120, 180] },
    expiresAt: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    accessCount: { type: Number, default: 0 },
    lastAccessedAt: { type: Date, default: null },
});

const ShareLink: Model<IShareLink> = mongoose.models.ShareLink || mongoose.model<IShareLink>('ShareLink', ShareLinkSchema);

export default ShareLink;
