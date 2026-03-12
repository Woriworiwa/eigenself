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
  const { question, personaId, persona, cvText }: {
    question: string;
    personaId: string;
    persona: string;
    cvText?: string;
  } = req.body;

  if (!question || !personaId) {
    res.status(400).json({ error: 'question and personaId required' });
    return;
  }

  let prompt: string;

  if (personaId === 'same' && cvText) {
    prompt = `You are the person described in the CV below, being interviewed by an AI. Answer the interviewer's question authentically as this person — in first person, drawing on your actual background, experience, and way of speaking as shown in the CV. Sound like a real human, not a summary of the CV.

CV:
${cvText}

The interviewer just said: "${question}"

Generate 3 natural responses this person might give. Make them varied in approach — one direct, one that references a specific experience from the CV, one slightly more reflective. Each 1–3 sentences.

Return a JSON array of exactly 3 strings. No labels, no explanation — just the array.`;
  } else {
    prompt = `You are simulating a person being interviewed by an AI. Your persona: ${persona}

The interviewer just said: "${question}"

Generate 3 natural responses this person might give. Each should be 1–3 sentences, in first person, true to the persona's voice and communication style. Make them varied.

Return a JSON array of exactly 3 strings. No labels, no explanation — just the array.`;
  }

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
