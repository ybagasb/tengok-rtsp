
// Manages active HLS video streams across the entire app
// Ensures max 4 videos are playing at any given time to save CPU/Network.

type PlaybackAction = () => void;
type PauseAction = () => void;

interface StreamInfo {
    play: PlaybackAction;
    pause: PauseAction;
    lastActivated: number;
}

export class StreamManager {
    static MAX_STREAMS = 12; // Increased from 6 to 12 for better MultiView experience
    private activeStreams: Map<string, StreamInfo> = new Map();

    register(id: string, play: PlaybackAction, pause: PauseAction) {
        // If already playing, just update callbacks
        if (this.activeStreams.has(id)) {
            const stream = this.activeStreams.get(id)!;
            stream.play = play;
            stream.pause = pause;
            play(); // Re-trigger play to ensure the current component instance initializes
            return;
        }

        // Check if we hit the limit
        if (this.activeStreams.size >= StreamManager.MAX_STREAMS) {
            // Find oldest stream
            let oldestId: string | null = null;
            let oldestTime = Infinity;

            for (const [sid, info] of this.activeStreams.entries()) {
                if (info.lastActivated < oldestTime) {
                    oldestTime = info.lastActivated;
                    oldestId = sid;
                }
            }

            // Pause oldest
            if (oldestId) {
                const oldest = this.activeStreams.get(oldestId)!;
                oldest.pause();
                this.activeStreams.delete(oldestId);
            }
        }

        // Add new stream
        this.activeStreams.set(id, {
            play,
            pause,
            lastActivated: Date.now()
        });

        // Execute play
        play();
    }

    unregister(id: string) {
        if (this.activeStreams.has(id)) {
            const stream = this.activeStreams.get(id)!;
            stream.pause(); // Just to be safe
            this.activeStreams.delete(id);
        }
    }
}

// React hook to get a stable instance
const globalStreamManager = new StreamManager();
export const useStreamManager = () => globalStreamManager;
