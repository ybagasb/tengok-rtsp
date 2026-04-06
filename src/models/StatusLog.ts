import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStatusLog extends Document {
    cameraId: mongoose.Types.ObjectId;
    status: 'online' | 'offline';
    timestamp: Date;
    checkedBy: 'auto' | 'probe' | 'stream';
}

const StatusLogSchema: Schema = new Schema({
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, index: true },
    status: { type: String, enum: ['online', 'offline'], required: true },
    timestamp: { type: Date, default: Date.now, index: true },
    checkedBy: { type: String, enum: ['auto', 'probe', 'stream'], default: 'auto' },
});

// Compound index for efficient queries
StatusLogSchema.index({ cameraId: 1, timestamp: -1 });

const StatusLog: Model<IStatusLog> = mongoose.models.StatusLog || mongoose.model<IStatusLog>('StatusLog', StatusLogSchema);

export default StatusLog;
