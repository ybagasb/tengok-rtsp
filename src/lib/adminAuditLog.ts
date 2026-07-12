/**
 * adminAuditLog.ts
 *
 * Server-side utility for recording admin actions to the AuditLog collection.
 * Call this after any successful CREATE / UPDATE / DELETE operation.
 */

import dbConnect from './db';
import AuditLog, { AuditAction, AuditEntity } from '@/models/AuditLog';

interface LogAuditOptions {
    action: AuditAction;
    entity: AuditEntity;
    entityId: string;
    entityName: string;
    by?: string;       // defaults to 'admin' if not provided
    detail?: string;
}

/**
 * Persist an admin audit log entry.
 * Silently catches errors so it never blocks the main request.
 */
export async function logAudit(opts: LogAuditOptions): Promise<void> {
    try {
        await dbConnect();
        await AuditLog.create({
            action:     opts.action,
            entity:     opts.entity,
            entityId:   opts.entityId,
            entityName: opts.entityName,
            by:         opts.by || 'admin',
            detail:     opts.detail,
            timestamp:  new Date(),
        });
    } catch (err: any) {
        // Non-blocking — audit failure should never break the admin operation
        console.warn('[AuditLog] Failed to write audit log:', err.message);
    }
}
