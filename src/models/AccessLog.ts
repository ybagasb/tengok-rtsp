import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAccessLog extends Document {
    token: string | null;    // null for direct app visits (non-shared)
    page: string;            // e.g. 'shared', 'categories', 'map'
    ipHash: string;
    userAgent: string;
    deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
    accessedAt: Date;
}

const AccessLogSchema: Schema = new Schema({
    token: { type: String, default: null, index: true },
    page: { type: String, default: 'app', index: true },
    ipHash: { type: String, required: true },
    userAgent: { type: String, required: true },
    deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet', 'unknown'], default: 'unknown' },
    accessedAt: { type: Date, default: Date.now, index: true },
});

// Compound index for efficient queries
AccessLogSchema.index({ accessedAt: 1, page: 1 });

// TTL Index: auto-delete logs older than 90 days
AccessLogSchema.index({ accessedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AccessLog: Model<IAccessLog> = mongoose.models.AccessLog || mongoose.model<IAccessLog>('AccessLog', AccessLogSchema);

export default AccessLog;
