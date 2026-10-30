import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

/**
 * Object storage layer backed by MinIO (S3-compatible).
 *
 * Required env:
 *   MINIO_ENDPOINT    e.g. http://localhost:9000 or https://minio.example.com
 *   MINIO_REGION      e.g. us-east-1 (MinIO still needs a formal region)
 *   MINIO_ACCESS_KEY
 *   MINIO_SECRET_KEY
 *   MINIO_BUCKET      e.g. tengok-projects
 *
 * Files are private in the bucket; read access is granted via short-lived
 * presigned URLs.
 */

const RAW_ENDPOINT = process.env.MINIO_ENDPOINT ?? '';
const REGION       = process.env.MINIO_REGION      || 'us-east-1';
const ACCESS_KEY   = process.env.MINIO_ACCESS_KEY;
const SECRET_KEY   = process.env.MINIO_SECRET_KEY;
export const BUCKET = process.env.MINIO_BUCKET     || 'tengok-projects';
const USE_SSL       = process.env.MINIO_USE_SSL !== 'false'; // default true
const PORT          = process.env.MINIO_PORT ? `:${process.env.MINIO_PORT}` : '';

/**
 * Normalise endpoint: ensure it always has a protocol so AWS SDK can parse it.
 * e.g.  "bucket.brantas-abipraya.co.id"  →  "https://bucket.brantas-abipraya.co.id"
 *       "http://localhost:9000"           →  kept as-is
 */
function normaliseEndpoint(raw: string): string {
    if (!raw) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        // Already has protocol — just append port if supplied separately
        return PORT ? raw.replace(/\/?$/, PORT) : raw;
    }
    const protocol = USE_SSL ? 'https://' : 'http://';
    return `${protocol}${raw}${PORT}`;
}

const ENDPOINT = normaliseEndpoint(RAW_ENDPOINT);

let _client: S3Client | null = null;

/** Whether storage is configured (env present). Lets callers fail gracefully. */
export function isStorageConfigured(): boolean {
    return Boolean(RAW_ENDPOINT && ACCESS_KEY && SECRET_KEY);
}

function client(): S3Client {
    if (!isStorageConfigured()) {
        throw new Error('MinIO storage is not configured (missing MINIO_* env vars)');
    }
    if (!_client) {
        _client = new S3Client({
            endpoint: ENDPOINT,
            region: REGION,
            credentials: { accessKeyId: ACCESS_KEY!, secretAccessKey: SECRET_KEY! },
            // Required for MinIO / non-AWS S3 so the bucket goes in the path, not the host.
            forcePathStyle: true,
        });
    }
    return _client;
}

/** Build a namespaced object key: projects/<projectId>/<kind>/<random>.<ext> */
export function buildKey(projectId: string, kind: 'gallery' | 'documents' | 'contract', filename: string): string {
    const safeExt = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const rand = crypto.randomBytes(8).toString('hex');
    return `projects/${projectId}/${kind}/${Date.now()}-${rand}.${safeExt}`;
}

/** Build a key under an arbitrary prefix, e.g. "location-images". */
export function buildKeyUnder(prefix: string, filename: string): string {
    const safeExt = (filename.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const rand = crypto.randomBytes(8).toString('hex');
    const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '') || 'misc';
    return `${safePrefix}/${Date.now()}-${rand}.${safeExt}`;
}

/** Upload a buffer. Returns the object key. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await client().send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    }));
    return key;
}

/**
 * Upload a buffer with public-read ACL and return a STABLE public URL.
 * Use for non-sensitive assets (e.g. project cover photos) that are stored as a
 * plain URL in the DB and rendered directly in <img src>. Unlike presigned
 * URLs, this link does not expire.
 * NOTE: the MinIO bucket policy must allow public read for this to be viewable.
 */
export async function putPublicObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await client().send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
    }));
    return publicUrl(key);
}

/** Build a stable public URL for an object (endpoint/bucket/key). */
export function publicUrl(key: string): string {
    const base = (ENDPOINT || '').replace(/\/+$/, '');
    return `${base}/${BUCKET}/${key}`;
}

/** Short-lived presigned GET url for reading a private object. */
export async function getPresignedUrl(key: string, expiresInSec = 3600, opts?: { downloadName?: string }): Promise<string> {
    // downloadName: paksa unduh (attachment) dengan nama asli, sehingga file unggahan tidak pernah dirender di origin storage.
    const disposition = opts?.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
        : undefined;
    return getSignedUrl(
        client(),
        new GetObjectCommand({ Bucket: BUCKET, Key: key, ResponseContentDisposition: disposition }),
        { expiresIn: expiresInSec },
    );
}

/** Delete an object. Best-effort. */
export async function deleteObject(key: string): Promise<void> {
    await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
