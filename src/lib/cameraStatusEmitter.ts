import { EventEmitter } from 'events';

/**
 * CameraStatusEmitter
 * 
 * Singleton EventEmitter that bridges CameraStatusChecker (server-side)
 * with SSE clients (browser). Each probe result is emitted here so that
 * all connected clients receive the update immediately.
 */
class CameraStatusEmitter extends EventEmitter {}

const globalForEmitter = global as unknown as { cameraStatusEmitter?: CameraStatusEmitter };

if (!globalForEmitter.cameraStatusEmitter) {
    globalForEmitter.cameraStatusEmitter = new CameraStatusEmitter();
    globalForEmitter.cameraStatusEmitter.setMaxListeners(200); // support up to 200 concurrent SSE clients
}

export const cameraStatusEmitter = globalForEmitter.cameraStatusEmitter;
