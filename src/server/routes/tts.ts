/**
 * POST /api/tts
 *
 * Converts text to speech using AWS Polly Neural engine.
 * Returns an MP3 audio buffer. Used by the test mode panel to speak
 * suggested responses aloud so the observer hears what the "user" is saying.
 */

import { Router, Request, Response } from 'express';
import { SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { polly } from '../lib/aws';

export const ttsRouter = Router();

ttsRouter.post('/', async (req: Request, res: Response) => {
  const { text, voiceId = 'Ruth' }: { text: string; voiceId?: string } = req.body;

  if (!text?.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }

  try {
    const command = new SynthesizeSpeechCommand({
      Text: text.slice(0, 3000), // Polly hard limit
      VoiceId: voiceId as 'Ruth',
      Engine: 'neural',
      OutputFormat: 'mp3',
      SampleRate: '24000',
    });

    const result = await polly.send(command);

    if (!result.AudioStream) {
      res.status(500).json({ error: 'No audio stream returned' });
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of result.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }

    const audio = Buffer.concat(chunks);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', String(audio.length));
    res.send(audio);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Polly error';
    console.error('TTS error:', message);
    res.status(500).json({ error: message });
  }
});
