import mongoose, { Schema, Document, Model } from 'mongoose';

// Jejak identitas SSO yang direkam SAAT user login ke TENGOK via Cognito.
//
// Guna utama: menangkap cognito_sub ASLI (UUID dari token Cognito) berikut
// username-nya. Direktori SSO eksternal (sso_users / Postgres) kadang masih
// menyimpan cognito_sub placeholder berformat `ldap_<username>` untuk user yang
// BELUM pernah login ke aplikasi yang menuliskan sub asli. Dengan merekam sub
// asli di sini begitu user login ke TENGOK, kita bisa:
//   1. Resolve/upgrade Location.picSubs dari `ldap_<username>` → sub asli.
//   2. Menautkan username ↔ sub tanpa bergantung pada DB aplikasi sebelah.
//
// Ini BUKAN sumber kebenaran otorisasi; hanya tabel bantu pemetaan identitas.
export interface ISsoIdentityData {
    _id?: string;
    cognitoSub: string;          // sub asli dari token Cognito (= session.user.id)
    username?: string | null;    // cognito:username / preferred_username bila ada
    email?: string | null;
    name?: string | null;
    firstLoginAt?: Date | string;
    lastLoginAt?: Date | string;
}

export interface ISsoIdentity extends Document, Omit<ISsoIdentityData, '_id'> {}

const SsoIdentitySchema: Schema = new Schema({
    cognitoSub:   { type: String, required: true, unique: true, index: true },
    username:     { type: String, index: true, default: null },
    email:        { type: String, default: null },
    name:         { type: String, default: null },
    firstLoginAt: { type: Date, default: Date.now },
    lastLoginAt:  { type: Date, default: Date.now },
});

const SsoIdentity: Model<ISsoIdentity> =
    mongoose.models.SsoIdentity || mongoose.model<ISsoIdentity>('SsoIdentity', SsoIdentitySchema);

export default SsoIdentity;
