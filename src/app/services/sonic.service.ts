import { Injectable, OnDestroy, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface TranscriptChunk {
  role: 'agent' | 'user';
  text: string;
  final: boolean;
}

export interface SonicTranscriptEntry {
  role: 'agent' | 'user';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class SonicService implements OnDestroy {

  connected = signal<boolean>(false);
  sessionReady = signal<boolean>(false);
  listening = signal<boolean>(false);
  agentSpeaking = signal<boolean>(false);
  error = signal<string>('');
  latestChunk = signal<TranscriptChunk | null>(null);
  fullTranscript = signal<SonicTranscriptEntry[]>([]);
  conversationComplete = signal<boolean>(false);

  private socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackQueue: ArrayBuffer[] = [];
  private isPlaying = false;

  connect(): Promise<void> {
    if (this.socket?.connected) return Promise.resolve();

    this.socket = io(environment.apiUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 3,
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.error.set('');
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
      this.sessionReady.set(false);
      this.listening.set(false);
    });

    this.socket.on('sonic:ready', () => {
      this.sessionReady.set(true);
    });

    this.socket.on('sonic:stopped', () => {
      this.sessionReady.set(false);
      this.listening.set(false);
    });

    this.socket.on('sonic:audio-out', (base64Pcm: string) => {
      this.agentSpeaking.set(true);
      this.enqueueAudio(base64Pcm);
    });

    this.socket.on('sonic:transcript-chunk', (chunk: TranscriptChunk) => {
      this.latestChunk.set(chunk);

      this.fullTranscript.update(transcript => {
        const last = transcript[transcript.length - 1];

        if (last && last.role === chunk.role) {
          // Same speaker — check if this chunk is a replay.
          // Bedrock replays complete block text verbatim, so if the current
          // accumulated text already contains this chunk, skip it.
          if (last.text.includes(chunk.text)) {
            return transcript; // duplicate — discard
          }
          return [
            ...transcript.slice(0, -1),
            { role: last.role, text: last.text + chunk.text },
          ];
        } else {
          // New speaker — but first check if this is a replay of an older entry.
          // If any existing entry with this role already contains this text, skip it.
          const alreadySeen = transcript.some(
            entry => entry.role === chunk.role && entry.text.includes(chunk.text)
          );
          if (alreadySeen) return transcript;
          return [...transcript, { role: chunk.role, text: chunk.text }];
        }
      });
    });

    this.socket.on('sonic:complete', (_data: { transcript: SonicTranscriptEntry[] }) => {
      // The live transcript is already accurate from the chunk accumulation above.
      // We do NOT replace it here — that caused every message to appear twice.
      // Just signal completion so the interview component transitions to processing.
      this.conversationComplete.set(true);
      void this.stopListening();
    });

    this.socket.on('sonic:error', (data: { message: string }) => {
      this.error.set(data.message);
      this.sessionReady.set(false);
      this.listening.set(false);
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      this.socket!.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.once('connect_error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  disconnect(): void {
    void this.stopListening();
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    this.sessionReady.set(false);
  }

  startSession(systemPrompt: string, cvText?: string): void {
    if (!this.socket?.connected) {
      this.error.set('Not connected to server');
      return;
    }
    this.conversationComplete.set(false);
    this.fullTranscript.set([]);
    this.latestChunk.set(null);
    this.socket.emit('sonic:start', { systemPrompt, cvText: cvText ?? '' });
  }

  stopSession(): void {
    void this.stopListening();
    this.socket?.emit('sonic:stop');
    this.sessionReady.set(false);
  }

  async startListening(): Promise<void> {
    if (this.listening()) return;
    if (!this.sessionReady()) {
      this.error.set('Session not ready');
      return;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');

      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');

      this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!this.socket?.connected || !this.sessionReady()) return;
        this.socket.emit('sonic:audio', new Uint8Array(event.data));
      };

      source.connect(this.workletNode);
      this.listening.set(true);
      this.error.set('');

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone error';
      this.error.set(message);
    }
  }

  async stopListening(): Promise<void> {
    if (!this.listening()) return;
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.workletNode = null;
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    this.listening.set(false);
  }

  sendText(text: string): void {
    if (!this.socket?.connected || !this.sessionReady()) return;
    this.socket.emit('sonic:text', { text });
  }

  private enqueueAudio(base64Pcm: string): void {
    const binary = atob(base64Pcm);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    this.playbackQueue.push(buffer);
    if (!this.isPlaying) void this.drainPlaybackQueue();
  }

  private async drainPlaybackQueue(): Promise<void> {
    this.isPlaying = true;
    while (this.playbackQueue.length > 0) {
      const rawPcm = this.playbackQueue.shift()!;
      try {
        if (!this.playbackContext || this.playbackContext.state === 'closed') {
          this.playbackContext = new AudioContext({ sampleRate: 24000 });
        }
        const int16 = new Int16Array(rawPcm);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);
        await new Promise<void>((resolve) => {
          const source = this.playbackContext!.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.playbackContext!.destination);
          source.onended = () => resolve();
          source.start();
        });
      } catch (err) {
        console.error('Playback error:', err);
      }
    }
    this.isPlaying = false;
    this.agentSpeaking.set(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
    void this.stopListening();
    this.playbackContext?.close();
  }
}
