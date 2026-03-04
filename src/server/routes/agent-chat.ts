/**
 * POST /api/agent-chat
 *
 * Routes a single conversational turn through the Bedrock Agent.
 * The agent maintains session memory natively — we pass a sessionId
 * (derived from a client-provided token) and Bedrock handles the
 * conversation history on its side.
 *
 * Request body:
 *   sessionId   — stable ID for this interview session (client generates it)
 *   message     — the user's latest message
 *   cvText?     — CV text to inject as session context on the first turn
 *
 * Response:
 *   { text: string }  — same shape as /api/chat for drop-in compatibility
 */

import { Router, Request, Response } from 'express';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export const agentChatRouter = Router();

const REGION = 'us-east-1';
const AGENT_ID    = process.env['BEDROCK_AGENT_ID'] ?? '';
const AGENT_ALIAS = process.env['BEDROCK_AGENT_ALIAS_ID'] ?? '';

const agentRuntime = new BedrockAgentRuntimeClient({ region: REGION });

// Track which sessions have already received CV context
// so we only inject it on the first turn.
const cvInjectedSessions = new Set<string>();

agentChatRouter.post('/', async (req: Request, res: Response) => {
  const { sessionId, message, cvText }: {
    sessionId: string;
    message: string;
    cvText?: string;
  } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({ error: 'sessionId and message are required' });
    return;
  }

  if (!AGENT_ID || !AGENT_ALIAS) {
    // Graceful fallback — agent not configured, caller should use /api/chat instead
    res.status(503).json({ error: 'Bedrock Agent not configured. Set BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID in .env' });
    return;
  }

  // On the first turn, wrap the message with explicit system-level framing.
  // Without this the agent treats the opening instruction as a user request
  // and rejects it ("cannot conduct interviews") due to its guardrails.
  // We track by sessionId so subsequent turns are sent as plain user messages.
  let fullMessage = message;
  if (!cvInjectedSessions.has(sessionId)) {
    cvInjectedSessions.add(sessionId);
    if (cvText) {
      fullMessage = `[SYSTEM — interview starting. CV provided below. Read it, then open the interview with a specific observation from it before moving to what it cannot tell you.]\n\n${cvText}\n\n---\n\n${message}`;
    } else {
      fullMessage = `[SYSTEM — interview starting. No CV provided. Open the interview with your first question to learn who this person is.]`;
    }
  }

  try {
    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS,
      sessionId,
      inputText: fullMessage,
    });

    const response = await agentRuntime.send(command);

    // The agent streams its response in chunks — collect them all
    let text = '';
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          text += Buffer.from(chunk.chunk.bytes).toString('utf-8');
        }
      }
    }

    res.json({ text: text.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent invocation failed';
    console.error('Agent chat error:', message);
    res.status(500).json({ error: message });
  }
});

// Clean up CV session tracking when a session ends
// Called by the client when the interview completes or the user navigates away
agentChatRouter.post('/end-session', (req: Request, res: Response) => {
  const { sessionId }: { sessionId?: string } = req.body;
  if (sessionId) cvInjectedSessions.delete(sessionId);
  res.json({ ok: true });
});
