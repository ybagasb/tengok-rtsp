import mongoose, { Schema, Document, Model } from 'mongoose';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditEntity = 'Camera' | 'Location' | 'Category' | 'ShareLink';

export interface IAuditLogData {
    _id?: string;
    action: AuditAction;
    entity: AuditEntity;
    entityId: string;
    entityName: string;
    by: string;       // username / SSO identifier
    detail?: string;  // human-readable change summary
    timestamp: Date | string;
}

export interface IAuditLog extends Document, Omit<IAuditLogData, '_id'> {}

const AuditLogSchema: Schema = new Schema({
    action:     { type: String, enum: ['CREATE', 'UPDATE', 'DELETE'], required: true },
    entity:     { type: String, enum: ['Camera', 'Location', 'Category', 'ShareLink'], required: true },
    entityId:   { type: String, required: true },
    entityName: { type: String, required: true },
    by:         { type: String, required: true },
    detail:     { type: String },
    timestamp:  { type: Date, default: Date.now },
});

// Auto-expire logs after 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
// Index for common query patterns
AuditLogSchema.index({ entity: 1, timestamp: -1 });

const AuditLog: Model<IAuditLog> =
    mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
