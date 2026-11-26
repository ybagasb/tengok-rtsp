import mongoose, { Schema, Document, Model } from 'mongoose';

// Role aplikasi TENGOK — SUMBER KEBENARAN otorisasi ada di sini
// (MongoDB), bukan di kolom `role` tabel sso_users (itu role aplikasi lain).
export type AppRoleName = 'superadmin' | 'divisi_admin';
export type DivisiName = 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3';

export interface IAppRoleData {
    _id?: string;
    cognitoSub: string;          // cognito_sub user (= session.user.id)
    role: AppRoleName;
    divisi?: DivisiName | null;  // wajib jika role = 'divisi_admin', null untuk superadmin
    createdBy?: string;          // actor (nama/email) dari getAuditActor saat dibuat
    createdAt?: Date | string;
}

export interface IAppRole extends Document, Omit<IAppRoleData, '_id'> {}

const AppRoleSchema: Schema = new Schema({
    cognitoSub: { type: String, required: true, unique: true, index: true },
    role:       { type: String, enum: ['superadmin', 'divisi_admin'], default: 'superadmin' },
    divisi:     { type: String, enum: ['DIVISI 1', 'DIVISI 2', 'DIVISI 3'], default: null },
    createdBy:  { type: String },
    createdAt:  { type: Date, default: Date.now },
});

const AppRole: Model<IAppRole> =
    mongoose.models.AppRole || mongoose.model<IAppRole>('AppRole', AppRoleSchema);

export default AppRole;
