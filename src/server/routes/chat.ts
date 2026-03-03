/**
 * POST /api/chat
 *
 * Runs a single conversational turn using Nova 2 Lite.
 * Accepts the full message history and optional CV text.
 * Returns the assistant's reply as plain text.
 */

import { Router, Request, Response } from 'express';
import { ConverseCommand, ConversationRole } from '@aws-sdk/client-bedrock-runtime';
import { bedrock } from '../lib/aws.js';
import { NOVA_LITE_MODEL_ID } from '../lib/models.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';
import type { Message } from '../types.js';

export const chatRouter = Router();

chatRouter.post('/', async (req: Request, res: Response) => {
  const { messages, cvText }: { messages: Message[]; cvText?: string } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  const converseMessages = messages.map(msg => ({
    role: (msg.role === 'agent' ? 'assistant' : 'user') as ConversationRole,
    content: [{ text: msg.text }],
  }));

  const systemPrompt = cvText
    ? buildSystemPromptWithCv(cvText)
    : SYSTEM_PROMPT;

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: converseMessages,
      inferenceConfig: { maxTokens: 300, temperature: 0.7 },
    });

    const response = await bedrock.send(command);
    const text = response.output?.message?.content?.[0]?.text ?? '';

    res.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bedrock error';
    console.error('Chat error:', message);
    res.status(500).json({ error: message });
  }
});

function buildSystemPromptWithCv(cvText: string): string {
  return `${SYSTEM_PROMPT}

---

CV PROVIDED (read before the conversation starts):

${cvText}

---

You have read this CV. You know the factual layer. Do not ask about career history, job titles, or skills listed here — you already have them. Use the CV to open with something specific and interesting, then spend the conversation on what the CV cannot tell you: how they think, how they communicate, how they handle conflict, what they would never say. If the CV contains the person's full name, remember it — you will need it for the document.

If the first user message is exactly "[START]", treat it as a silent trigger. Do not acknowledge it. Simply open the conversation with your CV-informed question as if you are speaking first.`;
}
