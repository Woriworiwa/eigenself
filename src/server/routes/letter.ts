import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrock } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';
import { LETTER_PROMPT } from '../prompts/letter';

export const letterRouter = Router();

letterRouter.post('/', async (req: Request, res: Response) => {
  const { protocol, jobPost }: { protocol: string; jobPost: string } = req.body;

  if (!protocol || !jobPost) {
    res.status(400).json({ error: 'protocol and jobPost are required' });
    return;
  }

  const userPrompt =
    `IDENTITY PROTOCOL:\n\n${protocol}\n\n---\n\nJOB DESCRIPTION:\n\n${jobPost}\n\n---\n\nWrite the cover letter now.`;

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      system: [{ text: LETTER_PROMPT }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: {
        maxTokens: 1000,
        temperature: 0.6,
      },
    });

    const response = await bedrock.send(command);
    const letter = response.output?.message?.content?.[0]?.text ?? '';
    res.json({ letter });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Letter generation failed';
    console.error('Generate-letter error:', msg);
    res.status(500).json({ error: msg });
  }
});
