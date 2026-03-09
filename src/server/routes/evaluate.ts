import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrock } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';
import { EVALUATOR_PROMPT } from '../prompts/fit-analysis';

export const evaluateRouter = Router();

evaluateRouter.post('/', async (req: Request, res: Response) => {
  const { protocol, jobPost }: { protocol: string; jobPost: string } = req.body;

  if (!protocol || !jobPost) {
    res.status(400).json({ error: 'protocol and jobPost are required' });
    return;
  }

  const userPrompt =
    `IDENTITY PROTOCOL:\n\n${protocol}\n\n---\n\nJOB DESCRIPTION:\n\n${jobPost}\n\n---\n\nWrite the fit report now.`;

  try {
    const command = new ConverseCommand({
      modelId: NOVA_LITE_MODEL_ID,
      system: [{ text: EVALUATOR_PROMPT }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: {
        maxTokens: 2000,
        temperature: 0.3,
      },
    });

    const response = await bedrock.send(command);
    const report = response.output?.message?.content?.[0]?.text ?? '';
    res.json({ report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Evaluation failed';
    console.error('Evaluate-fit error:', msg);
    res.status(500).json({ error: msg });
  }
});
