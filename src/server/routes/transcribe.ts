/**
 * POST /api/transcribe
 *
 * Accepts a recorded audio file (webm, ogg, mp4, wav, etc.) and returns
 * the spoken words as plain text using Nova 2 Lite's audio understanding.
 *
 * Used as a fallback when the Sonic bidirectional stream is unavailable
 * (e.g. Firefox, or text-only mode).
 */

import { Router, Request, Response } from 'express';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import multer from 'multer';
import { bedrock } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';

export const transcribeRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

const MIME_TO_FORMAT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg':  'ogg',
  'audio/mp4':  'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav':  'wav',
  'audio/flac': 'flac',
  'audio/aac':  'aac',
};

transcribeRouter.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file received' });
    return;
  }

  const { buffer, mimetype } = req.file;
  const baseMime = mimetype.split(';')[0].trim();
  const audioFormat = MIME_TO_FORMAT[baseMime] ?? 'webm';

  console.log(`Transcribe request: ${buffer.length} bytes, mime=${mimetype}, format=${audioFormat}`);

  try {
    const payload = {
      messages: [{
        role: 'user',
        content: [
          {
            audio: {
              format: audioFormat,
              source: { bytes: buffer.toString('base64') },
            },
          },
          {
            text: 'Please transcribe this audio recording. Output only the spoken words, nothing else. If silent, output [SILENT].',
          },
        ],
      }],
      system: [{
        text: 'You are a transcription service. Output only the transcript — no explanations, no punctuation corrections, no preamble.',
      }],
      inferenceConfig: { max_new_tokens: 500, temperature: 0 },
    };

    const command = new InvokeModelCommand({
      modelId: NOVA_LITE_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrock.send(command);
    const body = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    const transcript: string = body?.output?.message?.content?.[0]?.text?.trim() ?? '';

    if (!transcript || transcript === '[SILENT]') {
      console.log('Transcribe result: silent or empty');
      res.json({ transcript: '' });
      return;
    }

    console.log('Transcribe result:', transcript);
    res.json({ transcript });

  } catch (error) {
    const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error('Transcribe error:', err.name, err.message, err.$metadata?.httpStatusCode);
    res.status(500).json({ error: err.message ?? 'Transcription failed' });
  }
});
