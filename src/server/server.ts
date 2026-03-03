/**
 * Eigenself — Express + Socket.IO server
 *
 * Responsibilities:
 *   - Load environment variables
 *   - Configure middleware (CORS, JSON body parsing)
 *   - Mount API routes
 *   - Attach Socket.IO and Sonic handlers
 *   - Start listening
 *
 * Everything else lives in routes/, socket/, lib/, and prompts/.
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { chatRouter }       from './routes/chat';
import { agentChatRouter }  from './routes/agent-chat';
import { cvRouter }         from './routes/cv';
import { documentRouter }   from './routes/document';
import { profileRouter }    from './routes/profile';
import { transcribeRouter } from './routes/transcribe';
import { registerSonicHandlers } from './socket/sonic-handlers';
import { NOVA_LITE_MODEL_ID, NOVA_SONIC_MODEL_ID } from './lib/models';

const PORT = Number(process.env['PORT'] ?? 3000);

const ALLOWED_ORIGINS = [
  'http://localhost:4200',
  // Production Angular app — served from CloudFront
  'https://d97lw07dec7fh.cloudfront.net',
  'https://d1k8d68asrg0f1.cloudfront.net',
];

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/chat',               chatRouter);
app.use('/api/agent-chat',         agentChatRouter);
app.use('/api',                    cvRouter);          // handles /api/parse-cv and /api/extract-name
app.use('/api/generate-document',  documentRouter);
app.use('/api/publish-profile',    profileRouter);
app.use('/api/transcribe',         transcribeRouter);

// ── Global error handler ──────────────────────────────────────────────────────
// Four-parameter signature is required for Express to treat this as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err.message);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
});

// ── HTTP + Socket.IO ──────────────────────────────────────────────────────────

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7, // 10 MB — needed for audio chunks
});

registerSonicHandlers(io);

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Eigenself server running on http://localhost:${PORT}`);
  console.log(`Nova 2 Lite  : ${NOVA_LITE_MODEL_ID}`);
  console.log(`Nova 2 Sonic : ${NOVA_SONIC_MODEL_ID}`);
  console.log('Routes       : /api/chat, /api/agent-chat, /api/parse-cv, /api/extract-name, /api/generate-document, /api/publish-profile, /api/transcribe');
  console.log('Socket.IO    : sonic:start, sonic:audio, sonic:text, sonic:stop');
});
