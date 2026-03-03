/**
 * Shared server-side types.
 *
 * The Message interface mirrors the one in src/app/interview/interview.types.ts
 * intentionally — keep them in sync if the shape changes.
 */

export interface Message {
  role: 'agent' | 'user';
  text: string;
}

export interface TranscriptEntry {
  role: 'agent' | 'user';
  text: string;
}

export interface SonicSession {
  audioContentName: string;
  sendAudio(pcmBuffer: Buffer): void;
  sendText(text: string): Promise<void>;
  close(): void;
}
