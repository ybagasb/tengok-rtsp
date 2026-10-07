import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Sesi login PIN (viewer). Menggantikan nilai konstanta 'authenticated' yang
 * lama: tiap login PIN sukses membuat satu record dengan token acak opaque.
 * requireAuth hanya lolos bila ada record yang masih hidup (belum expired),
 * dan logout menghapus record sehingga sesi benar-benar dicabut server-side.
 */
export interface IPinSession extends Document {
    token: string;          // token acak opaque (crypto.randomBytes hex)
    createdAt: Date;
    expiresAt: Date;        // batas kedaluwarsa; dipakai TTL index untuk auto-hapus
    ipHash: string | null;  // sha256 IP klien (opsional, untuk audit ringan)
}

const PinSessionSchema: Schema = new Schema({
    token: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    ipHash: { type: String, default: null },
});

// TTL Index: auto-hapus sesi setelah lewat expiresAt.
PinSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PinSession: Model<IPinSession> = mongoose.models.PinSession || mongoose.model<IPinSession>('PinSession', PinSessionSchema);

export default PinSession;
