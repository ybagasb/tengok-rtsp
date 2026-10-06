import mongoose, { Schema, Document, Model } from 'mongoose';

// Role aplikasi TENGOK — SUMBER KEBENARAN otorisasi super-admin ada di sini
// (MongoDB), bukan di kolom `role` tabel sso_users (itu role aplikasi lain).
export type AppRoleName = 'superadmin';

export interface IAppRoleData {
    _id?: string;
    cognitoSub: string;          // cognito_sub user (= session.user.id)
    role: AppRoleName;
    createdBy?: string;          // actor (nama/email) dari getAuditActor saat dibuat
    createdAt?: Date | string;
}

export interface IAppRole extends Document, Omit<IAppRoleData, '_id'> {}

const AppRoleSchema: Schema = new Schema({
    cognitoSub: { type: String, required: true, unique: true, index: true },
    role:       { type: String, enum: ['superadmin'], default: 'superadmin' },
    createdBy:  { type: String },
    createdAt:  { type: Date, default: Date.now },
});

const AppRole: Model<IAppRole> =
    mongoose.models.AppRole || mongoose.model<IAppRole>('AppRole', AppRoleSchema);

export default AppRole;
