import mongoose, { Schema, Document, Model } from 'mongoose';

// Interface for raw data (frontend compatible)
export interface ILocationData {
    _id?: string;
    name: string;
    category: string;
    description?: string;
    image?: string;
    lat: number;
    lng: number;
    pmName?: string;
    pmPhone?: string;
    cameras: string[] | mongoose.Types.ObjectId[];
    createdAt: Date | string;
}

// Mongoose Document Interface
export interface ILocation extends Document, Omit<ILocationData, '_id' | 'cameras'> {
    cameras: mongoose.Types.ObjectId[];
}

const LocationSchema: Schema = new Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String },
    image: { type: String },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    pmName: { type: String },
    pmPhone: { type: String },
    cameras: [{ type: Schema.Types.ObjectId, ref: 'Camera' }],
    createdAt: { type: Date, default: Date.now },
});

const Location: Model<ILocation> = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);

export default Location;
