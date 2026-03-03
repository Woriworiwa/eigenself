/**
 * POST /api/generate-document
 *
 * Synthesises the full conversation transcript (+ optional CV) into a
 * complete AI identity document using Nova 2 Lite.
 */

import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrock } from '../lib/aws.js';
import { NOVA_LITE_MODEL_ID } from '../lib/models.js';
import { DOCUMENT_PROMPT } from '../prompts/document.js';
import type { Message } from '../types.js';

export const documentRouter = Router();

documentRouter.post('/', async (req: Request, res: Response) => {
  const { messages, cvText, userName }: {
    messages: Message[];
    cvText?: string;
    userName?: string;
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  const userPrompt = buildUserPrompt(messages, cvText, userName);

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      system: [{ text: DOCUMENT_PROMPT }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: {
        maxTokens: 4000,
        temperature: 0.4, // lower = more consistent document structure
      },
    });

    const response = await bedrock.send(command);
    const document = response.output?.message?.content?.[0]?.text ?? '';

    res.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document generation failed';
    console.error('Document generation error:', message);
    res.status(500).json({ error: message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildUserPrompt(messages: Message[], cvText?: string, userName?: string): string {
  const transcript = messages
    .map(m => `${m.role === 'agent' ? 'INTERVIEWER' : 'USER'}: ${m.text}`)
    .join('\n\n');

  let prompt = '';

  if (cvText) {
    prompt += `CV PROVIDED BY USER:\n\n${cvText}\n\n---\n\n`;
  }

  if (userName) {
    prompt += `USER'S NAME (confirmed): ${userName}\n\n---\n\n`;
  }

  prompt += `CONVERSATION TRANSCRIPT:\n\n${transcript}\n\n---\n\nWrite the complete AI identity document for this person now.`;

  return prompt;
}
