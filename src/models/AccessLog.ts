import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAccessLog extends Document {
    token: string;
    ipHash: string;
    userAgent: string;
    deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
    accessedAt: Date;
}

const AccessLogSchema: Schema = new Schema({
    token: { type: String, required: true, index: true },
    ipHash: { type: String, required: true },
    userAgent: { type: String, required: true },
    deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet', 'unknown'], default: 'unknown' },
    accessedAt: { type: Date, default: Date.now, index: true },
});

// TTL Index to automatically delete logs older than 30 days (optional but good for privacy)
AccessLogSchema.index({ accessedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const AccessLog: Model<IAccessLog> = mongoose.models.AccessLog || mongoose.model<IAccessLog>('AccessLog', AccessLogSchema);

export default AccessLog;
