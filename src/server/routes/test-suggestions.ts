/**
 * POST /api/test-suggestions
 *
 * Generates 3 realistic persona-based responses for a given interviewer question.
 * Used by the test mode panel during usability testing sessions.
 */

import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrock } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';

export const testSuggestionsRouter = Router();

testSuggestionsRouter.post('/', async (req: Request, res: Response) => {
  const { question, persona }: { question: string; persona: string } = req.body;

  if (!question || !persona) {
    res.status(400).json({ error: 'question and persona required' });
    return;
  }

  const prompt = `You are simulating a person being interviewed by an AI. Your persona: ${persona}

The interviewer just said: "${question}"

Generate 3 natural, realistic responses this person might give. Each should be 1–3 sentences, in first person, true to the persona's voice. Make them varied: one direct answer, one with a brief story or example, one short or slightly deflecting.

Return a JSON array of exactly 3 strings. No labels, no explanation — just the array.`;

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 400, temperature: 0.9 },
    });

    const response = await bedrock.send(command);
    const raw = response.output?.message?.content?.[0]?.text ?? '[]';

    const match = raw.match(/\[[\s\S]*\]/);
    const suggestions = match ? (JSON.parse(match[0]) as string[]) : [];

    res.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bedrock error';
    console.error('Test suggestions error:', message);
    res.status(500).json({ error: message });
  }
});
