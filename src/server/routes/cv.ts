/**
 * POST /api/parse-cv   — extracts plain text from a PDF or DOCX upload
 * POST /api/extract-name — pulls the person's full name from CV text
 */

import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { bedrock } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';

export const cvRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

// ── POST /api/parse-cv ───────────────────────────────────────────────────────

cvRouter.post('/parse-cv', upload.single('cv'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file received' });
    return;
  }

  const { mimetype, buffer, originalname } = req.file;
  const filename = (originalname ?? '').toLowerCase();

  try {
    const text = await extractText(buffer, mimetype, filename);

    if (!text) {
      res.status(422).json({ error: 'Could not extract text from this file.' });
      return;
    }

    // Trim and cap at 6000 chars — enough for any CV, avoids bloating the prompt
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 6000);
    console.log(`CV parsed: ${trimmed.length} characters from ${originalname}`);

    res.json({ cvText: trimmed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parse failed';
    console.error('CV parse error:', message);
    res.status(500).json({ error: `Failed to parse CV: ${message}` });
  }
});

// ── POST /api/extract-name ───────────────────────────────────────────────────

cvRouter.post('/extract-name', async (req: Request, res: Response) => {
  const { cvText }: { cvText?: string } = req.body;

  if (!cvText) {
    res.json({ name: null });
    return;
  }

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      system: [{
        text: "You extract names from CV text. Respond with only the person's full name — nothing else. No punctuation, no explanation. If you cannot find a name, respond with exactly: UNKNOWN",
      }],
      messages: [{
        role: 'user',
        content: [{ text: `Extract the full name of the person from this CV:\n\n${cvText.slice(0, 1000)}` }],
      }],
      inferenceConfig: { maxTokens: 20, temperature: 0 },
    });

    const response = await bedrock.send(command);
    const name = response.output?.message?.content?.[0]?.text?.trim() ?? 'UNKNOWN';

    res.json({ name: name === 'UNKNOWN' ? null : name });
  } catch (error) {
    // Non-critical — caller falls back gracefully when name is null
    console.error('Name extraction error:', error instanceof Error ? error.message : error);
    res.json({ name: null });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function extractText(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
  const isPdf = mimetype === 'application/pdf' || filename.endsWith('.pdf');
  const isDocx =
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.endsWith('.docx');

  if (isPdf) {
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error('Unsupported file type. Please upload a PDF or DOCX.');
}
