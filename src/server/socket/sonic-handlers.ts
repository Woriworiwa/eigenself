/**
 * registerSonicHandlers
 *
 * Wires all sonic:* Socket.IO events for a single connected socket.
 * Called once per connection from server.ts.
 *
 * Events handled:
 *   sonic:start  — open a Bedrock Sonic session
 *   sonic:audio  — forward a PCM16 audio chunk
 *   sonic:text   — inject a typed message
 *   sonic:stop   — close the session cleanly
 *   disconnect   — auto-close on socket drop
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { createSonicSession } from './sonic-session';
import type { SonicSession } from '../types';

// Active sessions keyed by socket.id
const sessions = new Map<string, SonicSession>();

export function registerSonicHandlers(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('sonic:start', async (data: { systemPrompt?: string; cvText?: string }) => {
      const { systemPrompt = '', cvText = '' } = data ?? {};

      if (sessions.has(socket.id)) {
        console.log(`Replacing existing session for ${socket.id}`);
        await closeSession(socket.id);
      }

      console.log(`Starting Sonic session for ${socket.id}`);

      try {
        const session = await createSonicSession(socket, systemPrompt, cvText);
        sessions.set(socket.id, session);
        socket.emit('sonic:ready');
        console.log(`Sonic session ready for ${socket.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Session start failed';
        console.error(`Sonic session start error for ${socket.id}:`, message);
        socket.emit('sonic:error', { message });
      }
    });

    socket.on('sonic:audio', (audioChunk: Buffer | ArrayBuffer) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      try {
        session.sendAudio(Buffer.isBuffer(audioChunk) ? audioChunk : Buffer.from(audioChunk));
      } catch (error) {
        console.error(`Audio send error for ${socket.id}:`, error instanceof Error ? error.message : error);
      }
    });

    socket.on('sonic:text', async (data: { text?: string }) => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const text = data?.text ?? '';
      if (!text.trim()) return;

      console.log(`Text input for ${socket.id}: "${text.slice(0, 60)}"`);
      try {
        await session.sendText(text);
      } catch (error) {
        console.error(`Text send error for ${socket.id}:`, error instanceof Error ? error.message : error);
      }
    });

    socket.on('sonic:stop', async () => {
      console.log(`Stopping Sonic session for ${socket.id}`);
      await closeSession(socket.id);
      socket.emit('sonic:stopped');
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      await closeSession(socket.id);
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function closeSession(socketId: string): Promise<void> {
  const session = sessions.get(socketId);
  if (!session) return;
  try {
    session.close();
  } catch (error) {
    console.error(`Error closing session for ${socketId}:`, error instanceof Error ? error.message : error);
  }
  sessions.delete(socketId);
}
