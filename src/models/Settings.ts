import mongoose, { Schema, Document, Model } from 'mongoose';

// A single notice shown in the CCTV notices stack (map + shared view).
export interface INotice {
    id: string;                                // stable client id
    type: 'info' | 'tip' | 'warning';          // controls icon/accent color
    title: string;
    message: string;
    enabled: boolean;
}

// Notification settings are stored as ONE singleton document, identified by
// `key: 'cctv-notices'`. This keeps config in the DB (editable by admins)
// without a full settings subsystem.
export interface INotificationSettings {
    key: string;
    enabled: boolean;          // master on/off for the whole notices stack
    autoDismissSec: number;    // seconds before a notice auto-closes (0 = never)
    notices: INotice[];
}

export interface INotificationSettingsDoc
    extends Document, Omit<INotificationSettings, 'key'> {
    key: string;
}

const NoticeSchema = new Schema<INotice>({
    id: { type: String, required: true },
    type: { type: String, enum: ['info', 'tip', 'warning'], default: 'info' },
    title: { type: String, default: '' },
    message: { type: String, required: true },
    enabled: { type: Boolean, default: true },
}, { _id: false });

const SettingsSchema: Schema = new Schema({
    key: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true },
    autoDismissSec: { type: Number, default: 8 },
    notices: { type: [NoticeSchema], default: [] },
}, { timestamps: true });

const Settings: Model<INotificationSettingsDoc> =
    mongoose.models.Settings || mongoose.model<INotificationSettingsDoc>('Settings', SettingsSchema);

export default Settings;

// Default notices used when no config exists yet — mirrors the original
// hard-coded map notices so behavior is unchanged until an admin edits them.
export const DEFAULT_NOTIFICATION_SETTINGS: INotificationSettings = {
    key: 'cctv-notices',
    enabled: true,
    autoDismissSec: 8,
    notices: [
        {
            id: 'info-streaming',
            type: 'info',
            title: 'Informasi Streaming',
            message: 'Proses memuat video CCTV membutuhkan waktu beberapa saat. Kecepatan bergantung pada stabilitas jaringan di masing-masing lokasi.',
            enabled: true,
        },
        {
            id: 'auto-check',
            type: 'tip',
            title: 'Pengecekan Otomatis',
            message: 'Sistem memeriksa status kamera secara berkala dan bertahap untuk memastikan data selalu terbaru.',
            enabled: true,
        },
        {
            id: 'disclaimer',
            type: 'warning',
            title: 'Perlu Diketahui',
            message: 'Status online / offline yang tertera dapat berubah sewaktu-waktu karena kondisi jaringan. Mohon maaf jika terdapat perbedaan status.',
            enabled: true,
        },
    ],
};
