/**
 * createSonicSession
 *
 * Opens a Nova 2 Sonic bidirectional stream for a single socket connection
 * and wires up all the event plumbing between Bedrock and the browser.
 *
 * Returns a SonicSession handle with three public methods:
 *   sendAudio(pcmBuffer) — forward raw 16kHz PCM16 from the mic
 *   sendText(text)       — inject a typed message mid-conversation
 *   close()              — clean shutdown of the Bedrock stream
 *
 * Emits back to the socket:
 *   sonic:audio-out        — base64 PCM24 audio for playback
 *   sonic:transcript-chunk — partial and final text turns
 *   sonic:complete         — fired once when [CONVERSATION_COMPLETE] is detected
 *   sonic:error            — any stream-level error
 */

import { InvokeModelWithBidirectionalStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Socket } from 'socket.io';
import { bedrock } from '../lib/aws';
import { NOVA_SONIC_MODEL_ID } from '../lib/models';
import { SYSTEM_PROMPT } from '../prompts/system';
import type { SonicSession, TranscriptEntry } from '../types';

export async function createSonicSession(
  socket: Socket,
  systemPrompt: string,
  cvText: string,
): Promise<SonicSession> {
  const textEncoder = new TextEncoder();

  // ── Event queue ────────────────────────────────────────────────────────────
  // Bedrock reads from an async generator. We feed it by enqueuing JSON events.

  const eventQueue: { chunk: { bytes: Uint8Array } }[] = [];
  let resolveNext: ((value: { chunk: { bytes: Uint8Array } } | null) => void) | null = null;
  let sessionClosed = false;

  function enqueue(event: object): void {
    if (sessionClosed) return;
    const bytes = textEncoder.encode(JSON.stringify(event));
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ chunk: { bytes } });
    } else {
      eventQueue.push({ chunk: { bytes } });
    }
  }

  async function* eventStream(): AsyncGenerator<{ chunk: { bytes: Uint8Array } }> {
    while (!sessionClosed) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        const next = await new Promise<{ chunk: { bytes: Uint8Array } } | null>(resolve => {
          resolveNext = resolve;
        });
        if (next === null) break;
        yield next;
      }
    }
  }

  // ── System prompt ──────────────────────────────────────────────────────────

  const voiceSuffix = '\n\nIMPORTANT FOR VOICE: You are speaking out loud. Keep responses to 1-3 short sentences. No lists, no bullet points, no markdown. Sound like a thoughtful person having a real conversation.';

  const openingInstruction = '\n\nSTART THE CONVERSATION: When the user sends "hi" or any short greeting at the start, treat it as a session-start signal. Respond with your warm opening. It should land in this order: a genuine brief greeting, an honest acknowledgment that this is an unusual thing (most people have never talked to an AI about who they actually are), a clear statement that there is nothing formal here and no right answers, and then one easy question — have they done anything like this before? Keep the whole thing to 3-4 short spoken sentences. Do not echo the greeting itself. Do not ask about their work yet.';

  const effectiveSystem = systemPrompt || SYSTEM_PROMPT;

  const fullSystemPrompt = cvText
    ? `${effectiveSystem}\n\n---\n\nCV PROVIDED (read before the conversation starts):\n\n${cvText}\n\n---\n\nYou have read this CV. Do not ask about career history, job titles, or skills listed here. Open with something specific from the CV, then focus on what the CV cannot tell you: how they think, how they communicate, what they would never say.${voiceSuffix}${openingInstruction}`
    : `${effectiveSystem}${voiceSuffix}${openingInstruction}`;

  // ── Initialise the Bedrock stream ──────────────────────────────────────────

  enqueue({ event: { sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 } } } });
  enqueue({
    event: {
      promptStart: {
        promptName: socket.id,
        textOutputConfiguration: { mediaType: 'text/plain' },
        audioOutputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: 24000,
          sampleSizeBits: 16,
          channelCount: 1,
          voiceId: 'tiffany',
          encoding: 'base64',
        },
      },
    },
  });

  // System prompt content block
  sendContentBlock(enqueue, socket.id, `${socket.id}-system`, 'TEXT', 'SYSTEM', false, fullSystemPrompt);

  // Open the persistent audio input block
  const audioContentName = `${socket.id}-audio-${Date.now()}`;
  enqueue({
    event: {
      contentStart: {
        promptName: socket.id,
        contentName: audioContentName,
        type: 'AUDIO',
        interactive: true,
        role: 'USER',
        audioInputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: 16000,
          sampleSizeBits: 16,
          channelCount: 1,
          encoding: 'base64',
        },
      },
    },
  });

  const command = new InvokeModelWithBidirectionalStreamCommand({
    modelId: NOVA_SONIC_MODEL_ID,
    body: eventStream(),
  });

  const response = await bedrock.send(command);

  // ── Response stream ────────────────────────────────────────────────────────

  let transcriptBuffer: TranscriptEntry = { role: 'agent', text: '' };
  const fullTranscript: TranscriptEntry[] = [];
  let completeSent = false;
  let currentContentType = '';
  let currentContentRole = '';

  (async () => {
    try {
      if (!response.body) throw new Error('Bedrock response body is undefined');
      for await (const event of response.body) {
        if (sessionClosed) break;
        if (!event.chunk?.bytes) continue;

        let data: { event?: Record<string, unknown> };
        try {
          data = JSON.parse(Buffer.from(event.chunk.bytes).toString('utf-8'));
        } catch {
          continue;
        }

        if (!data.event) continue;
        const ev = data.event as Record<string, unknown>;

        // Track the current content block type so we only process
        // textOutput events from TEXT blocks, not the duplicate text
        // that Bedrock also sends inside AUDIO content blocks.
        if (ev['completionStart']) {
          // reset per-completion state if needed in future
        }

        if (ev['contentStart']) {
          const cs = ev['contentStart'] as Record<string, unknown>;
          currentContentType = (cs['type'] as string) ?? '';
          currentContentRole = (cs['role'] as string) ?? '';
        }

        // Audio out — stream directly to browser
        if (ev['audioOutput'] && typeof (ev['audioOutput'] as Record<string, unknown>)['content'] === 'string') {
          socket.emit('sonic:audio-out', (ev['audioOutput'] as Record<string, string>)['content']);
        }

        // Emit every TEXT chunk — deduplication happens on the client
        if (ev['textOutput'] && currentContentType === 'TEXT') {
          const textOut = ev['textOutput'] as { content: string; role: string };
          const role: TranscriptEntry['role'] = textOut.role === 'ASSISTANT' ? 'agent' : 'user';
          const raw = textOut.content;

          // Detect completion before stripping
          if (!completeSent && raw.includes('[CONVERSATION_COMPLETE]')) {
            completeSent = true;
          }

          // Strip control tokens from what the client sees
          const text = raw.replace(/\[CONVERSATION_COMPLETE\]/g, '').trim();
          if (!text) continue;

          // Accumulate server-side for the fullTranscript (sent on complete)
          if (transcriptBuffer.role === role) {
            transcriptBuffer.text += text;
          } else {
            if (transcriptBuffer.text.trim()) {
              fullTranscript.push({ role: transcriptBuffer.role, text: transcriptBuffer.text.trim() });
            }
            transcriptBuffer = { role, text };
          }

          // Emit once — client accumulates into its live transcript
          socket.emit('sonic:transcript-chunk', { role, text, final: false });
        }

        if (ev['contentEnd'] && currentContentType === 'TEXT') {
          if (transcriptBuffer.text.trim()) {
            fullTranscript.push({ role: transcriptBuffer.role, text: transcriptBuffer.text.trim() });
          }
          transcriptBuffer = { role: 'agent', text: '' };

          if (completeSent && fullTranscript.length > 0) {
            socket.emit('sonic:complete', { transcript: fullTranscript });
            completeSent = false;
          }
        }
        if (ev['contentEnd']) {
          currentContentType = '';
        }
      }
    } catch (error) {
      if (!sessionClosed) {
        const message = error instanceof Error ? error.message : 'Stream error';
        console.error(`Sonic stream error for ${socket.id}:`, message);
        socket.emit('sonic:error', { message });
      }
    }
  })();

  // ── Public session API ─────────────────────────────────────────────────────

  return {
    audioContentName,

    sendAudio(pcmBuffer: Buffer): void {
      enqueue({
        event: {
          audioInput: {
            promptName: socket.id,
            contentName: audioContentName,
            content: pcmBuffer.toString('base64'),
          },
        },
      });
    },

    async sendText(text: string): Promise<void> {
      const name = `${socket.id}-text-${Date.now()}`;
      sendContentBlock(enqueue, socket.id, name, 'TEXT', 'USER', true, text);
    },

    close(): void {
      sessionClosed = true;
      enqueue({ event: { contentEnd: { promptName: socket.id, contentName: audioContentName } } });
      enqueue({ event: { promptEnd: { promptName: socket.id } } });
      enqueue({ event: { sessionEnd: {} } });
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      }
    },
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function sendContentBlock(
  enqueue: (event: object) => void,
  promptName: string,
  contentName: string,
  type: 'TEXT' | 'AUDIO',
  role: 'SYSTEM' | 'USER' | 'ASSISTANT',
  interactive: boolean,
  text: string,
): void {
  enqueue({
    event: {
      contentStart: {
        promptName,
        contentName,
        type,
        interactive,
        role,
        textInputConfiguration: { mediaType: 'text/plain' },
      },
    },
  });
  enqueue({
    event: { textInput: { promptName, contentName, content: text } },
  });
  enqueue({
    event: { contentEnd: { promptName, contentName } },
  });
}
