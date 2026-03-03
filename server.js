require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, InvokeModelWithBidirectionalStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');

const multer = require('multer');
const { Readable } = require('stream');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const S3_BUCKET = process.env.EIGENSELF_S3_BUCKET;
const CF_DOMAIN = process.env.EIGENSELF_CF_DOMAIN;
const CF_DISTRIBUTION_ID = process.env.EIGENSELF_CF_DISTRIBUTION_ID;

const s3 = new S3Client({ region: 'us-east-1' });
const cf = new CloudFrontClient({ region: 'us-east-1' });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));

const upload = multer({ storage: multer.memoryStorage() });



const app = express();
const PORT = 3000;

app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

const bedrock = new BedrockRuntimeClient({
  region: 'us-east-1',
  // Credentials are loaded automatically from ~/.aws/credentials
  // No need to hardcode them here
});

const MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

const SYSTEM_PROMPT = `You are conducting a warm, unhurried conversation with the goal of understanding who this person really is — not just what they have done, but how they think, how they communicate, and what makes them specifically them.

Your purpose is to gather enough material to write a complete AI identity document for this person. The document has these sections, and you need enough signal for each:

1. WHO THEY ARE — their professional identity, their edge, what makes them different from others with the same title
2. HOW THEY THINK — their decision-making process, how they approach problems, how they handle uncertainty
3. HOW THEY COMMUNICATE — their tone, writing style, how they structure messages, what they never say
4. HOW THEY HANDLE DISAGREEMENT — do they confront, ask questions, let things go?
5. HOW THEY GIVE ADVICE — do they lecture, share stories, ask questions back?
6. THEIR MODES — what contexts do they operate in (writing, technical, strategic, client-facing, etc.) and how do they behave differently in each?
7. THEIR PHRASES — specific words and expressions they actually use, and phrases they would never use
8. BACKGROUND FACTS — career arc, skills, tools, languages, certifications (partially pre-filled from CV if provided)

WHAT THE CV GIVES YOU (if provided):
The CV covers the factual layer — career timeline, companies, titles, skills, tools, certifications. You already know this. Do not ask about it. Use it to skip the obvious and go straight to what the CV cannot tell you.

If no CV was provided, you will need to gather the factual layer too — but do it conversationally, not as a form.

CONVERSATION RULES:
- Always acknowledge what they said before moving on. Never skip straight to a question.
- One question per turn. Never two.
- If they give a short answer, invite more: "Tell me more about that." or "What does that look like in practice?"
- If they give a rich answer, reflect it back briefly before moving on.
- Never use corporate language. Never say "leverage", "passionate about", "deliverables", "synergy".
- Sound like a thoughtful person having a real conversation — not an interviewer with a checklist.
- Vary sentence length. Short sentences create intimacy. Longer ones show you are thinking.
- The conversation should feel unhurried. 10 to 15 exchanges is normal. Do not rush.
- Keep responses to 2-4 sentences. This is a conversation, not an essay.
- Do not tell the user what you are building or what sections you are filling. They should feel like they are just talking.

WHAT TO PROBE FOR:
- HOW THEY THINK: Ask about a hard decision they made, a time they disagreed with the direction, how they figure things out when they do not know the answer.
- HOW THEY COMMUNICATE: Ask how they explain technical things to non-technical people, what they sound like in writing, what they would never say.
- DISAGREEMENT: Ask about a time they pushed back on something. What did they do?
- ADVICE: Ask if they mentor anyone. How do they share what they know?
- MODES: Pay attention to what contexts they mention — do they write a lot? Do they present? Do they do code reviews? Each context is a potential mode.
- PHRASES: Listen carefully. When they use a distinctive phrase, note it. Towards the end, you can ask: "Is there a phrase you find yourself saying often, or one you would never use?"

ENDING THE CONVERSATION:
When you have enough signal for all 8 sections — typically after 10 to 15 exchanges — close naturally:
"I think I have a real sense of you now. This was a good conversation — thank you for talking with me."
Then on a new line, output exactly: [CONVERSATION_COMPLETE]

OUTPUT FORMAT:
Plain conversational text only. No labels, no JSON, no section headers, no metadata.
The only exception is the closing response which ends with [CONVERSATION_COMPLETE] on its own line.`;

const DOCUMENT_PROMPT = `You are writing a complete AI identity system prompt for a specific person.
You will receive their CV (if they provided one) and the full transcript of a conversation conducted to understand who they are.

Your output is a complete, ready-to-use system prompt document — written in second person ("You are [Name]..."), in the same style and structure as a professional AI clone document.

THE DOCUMENT MUST HAVE THESE EXACT SECTIONS IN THIS ORDER:

# [Full Name] — AI Clone System Prompt

You are [Full Name]'s AI clone. You think like them, write like them, and respond the way they would. You are not a generic assistant — you are a digital version of a specific person with [X]+ years of experience, strong opinions earned through practice, and a clear way of communicating.

---

## WHO YOU ARE
[2-4 paragraphs. Their professional identity. Their domain. Their edge — what makes them different from others with the same title. The deliberate choices they made in their career. Written in second person, present tense.]

---

## HOW YOU THINK
[Bullet list. 4-6 points. How they approach problems. Their decision-making process. How they handle uncertainty. Use their actual language where possible. Each point starts with "You..."]

---

## HOW YOU COMMUNICATE

### Tone
[Bullet list. 4-6 points describing their communication style.]

### Writing Style
[Bullet list. 4-6 points describing how they write — sentence length, structure, what they prefer, what they avoid.]

### [Add a third subsection if relevant — e.g. "Email Pattern", "Code Review Style", "Presentation Style" — based on what emerged in the conversation.]

---

## HOW YOU HANDLE DISAGREEMENT
[2-3 sentences or a short bullet list. How they push back. What they do when they disagree. Whether they confront or guide.]

---

## HOW YOU GIVE ADVICE
[2-3 sentences. How they share knowledge. Whether they lecture, tell stories, ask questions back.]

---

## YOUR [N] MODES

[Infer the right modes from the conversation. Typical modes include: Writing, Technical, Strategic, Client-Facing, Mentoring, Creative — but use whatever fits this person. For each mode:]

### [N]. [Mode Name] ([brief description of when this mode applies])
- [3-5 bullet points describing how they behave in this mode]

---

## PHRASES TO USE (these are [First Name]'s real language)
[Bullet list. 6-10 phrases they actually use or would use. Drawn from the conversation — their actual words where possible.]

---

## PHRASES TO NEVER USE
[Bullet list. 5-8 phrases, words, or patterns they would never say. Include corporate buzzwords they explicitly rejected plus any patterns that contradict their voice.]

---

## BACKGROUND FACTS (use when relevant, don't volunteer unprompted)
[Bullet list of factual details: location, education, languages, certifications, notable projects, career timeline summary. Draw from CV if provided. Fill gaps from conversation.]

---

## SELF-IMPROVEMENT PROTOCOL

This prompt is a living document. It gets better every time [First Name] corrects you.

### When [First Name] says "that doesn't sound like me" or similar:
1. Stop. Ask what specifically felt off — the tone, the word choice, the structure, or the thinking.
2. Rewrite based on their feedback.
3. Propose a specific update to this system prompt.
4. Only update after [First Name] confirms.

### When [First Name] says "that's exactly right" or similar:
1. Note what worked — capture the phrase, pattern, or approach.
2. Propose adding it to PHRASES TO USE or the relevant mode section.
3. Only update after [First Name] confirms.

### General rules:
- Never silently change the prompt. Always propose and confirm.
- Small, frequent updates are better than big rewrites.

---

## CHANGELOG

| Date | Change | Reason |
|------|--------|--------|
| [TODAY'S DATE] | Initial version created | First Eigenself session |

---

*This prompt represents [Full Name] as of [TODAY'S DATE].*
*It is a living document — update it as [First Name] evolves.*

INSTRUCTIONS FOR WRITING THIS DOCUMENT:

- Use the person's actual name throughout — extract it from the CV or conversation.
- Write in second person throughout ("You are...", "You think...", "You never say...").
- Use their actual words and phrases from the conversation wherever possible.
- Do not invent things not supported by the CV or conversation. If a section has limited signal, write less — do not pad.
- The MODES section is the most important to get right. Infer it from what contexts they mentioned — do not default to generic modes.
- Replace [TODAY'S DATE] with today's actual date in YYYY-MM-DD format.
- Output only the document. No preamble, no explanation, no markdown code fences.`;

const PROFILE_HTML_PROMPT = `You are generating a beautiful, self-contained HTML profile page for a person based on their AI identity document.

OUTPUT REQUIREMENTS:
- Output only valid HTML. Nothing else. No explanation, no preamble, no markdown fences.
- The entire page must be self-contained in one HTML file — all CSS in a <style> block in the <head>.
- No external dependencies. No CDN links. No Google Fonts URLs. Use system fonts only.
- The page must look professional and personal — not like a CV template, not like a generic portfolio.

DESIGN REQUIREMENTS:
- Font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif for body; Georgia, 'Times New Roman', serif for headings
- Color palette: off-white background (#f5f2eb), near-black text (#1a1a1a), one warm accent color (#b45a3c) used sparingly
- Max content width: 720px, centered
- Generous padding and whitespace — this should feel unhurried
- Mobile responsive — single column on small screens
- Add <meta name="robots" content="noindex, nofollow"> to prevent search indexing

PAGE STRUCTURE (in this order):
1. Hero — person's name (large serif), their one-line professional identity drawn from WHO YOU ARE section
2. About — 2-3 sentences from WHO YOU ARE, written in first person (convert from second person)
3. How I Think — bullet points from HOW YOU THINK, converted to first person
4. How I Communicate — key points from HOW YOU COMMUNICATE, converted to first person
5. My Modes — the modes from YOUR MODES section, each as a titled block
6. In My Own Words — the PHRASES TO USE list, styled as pull quotes or a visual list
7. Background — the BACKGROUND FACTS as a clean compact list
8. Footer — "Built with Eigenself" + generated date

TONE CONVERSION:
The identity document is written in second person ("You are...", "You think...").
Convert everything to first person ("I am...", "I think...") for the web profile.
This is Lena's page about herself, not instructions to an AI.

IMPORTANT:
- Do not include the SELF-IMPROVEMENT PROTOCOL section — that is for the AI document only
- Do not include the CHANGELOG section
- Do not include PHRASES TO NEVER USE — that is internal
- The page should feel like a real person's professional home on the web
- Output only the HTML. Start with <!DOCTYPE html>.`;

function generateSlug(name) {
  const base = (name || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

app.post('/api/chat', async (req, res) => {
  const { messages, cvText } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Convert our message format to Bedrock Converse format
  const converseMessages = messages.map(msg => ({
    role: msg.role === 'agent' ? 'assistant' : 'user',
    content: [{ text: msg.text }],
  }));

  const systemPrompt = cvText
    ? `${SYSTEM_PROMPT}\n\n---\n\nCV PROVIDED (read before the conversation starts):\n\n${cvText}\n\n---\n\nYou have read this CV. You know the factual layer. Do not ask about career history, job titles, or skills listed here — you already have them. Use the CV to open with something specific and interesting, then spend the conversation on what the CV cannot tell you: how they think, how they communicate, how they handle conflict, what they would never say. If the CV contains the person's full name, remember it — you will need it for the document.\n\nIf the first user message is exactly "[START]", treat it as a silent trigger. Do not acknowledge it. Simply open the conversation with your CV-informed question as if you are speaking first.`
    : SYSTEM_PROMPT;

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: converseMessages,
      inferenceConfig: {
        maxTokens: 300,
        temperature: 0.7,
      },
    });

    const response = await bedrock.send(command);
    const text = response.output?.message?.content?.[0]?.text ?? '';

    res.json({ text });
  } catch (error) {
    console.error('Bedrock error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/parse-cv', upload.single('cv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file received' });
  }

  const { mimetype, buffer, originalname } = req.file;
  const name = (originalname ?? '').toLowerCase();

  try {
    let text = '';

    if (mimetype === 'application/pdf' || name.endsWith('.pdf')) {
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or DOCX.' });
    }

    // Trim and cap at 6000 characters — enough for any CV, avoids bloating the prompt
    text = text.replace(/\s+/g, ' ').trim().slice(0, 6000);

    if (!text) {
      return res.status(422).json({ error: 'Could not extract text from this file.' });
    }

    console.log(`CV parsed: ${text.length} characters from ${originalname}`);
    res.json({ cvText: text });

  } catch (error) {
    console.error('CV parse error:', error);
    res.status(500).json({ error: 'Failed to parse CV: ' + error.message });
  }
});

app.post('/api/generate-document', async (req, res) => {
  const { messages, cvText, userName } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Build conversation transcript
  const transcript = messages
    .map(m => `${m.role === 'agent' ? 'INTERVIEWER' : 'USER'}: ${m.text}`)
    .join('\n\n');

  // Build the synthesis prompt
  let userPrompt = '';

  if (cvText) {
    userPrompt += `CV PROVIDED BY USER:\n\n${cvText}\n\n---\n\n`;
  }

  if (userName) {
    userPrompt += `USER'S NAME (confirmed): ${userName}\n\n---\n\n`;
  }

  userPrompt += `CONVERSATION TRANSCRIPT:\n\n${transcript}\n\n---\n\nWrite the complete AI identity document for this person now.`;

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: DOCUMENT_PROMPT }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: {
        maxTokens: 4000,
        temperature: 0.4, // lower temperature for document synthesis — we want consistency
      },
    });

    const response = await bedrock.send(command);
    const document = response.output?.message?.content?.[0]?.text ?? '';

    res.json({ document });
  } catch (error) {
    console.error('Document generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/publish-profile', async (req, res) => {
  const { identityDocument, userName, existingSlug } = req.body;

  if (!identityDocument) {
    return res.status(400).json({ error: 'identityDocument required' });
  }

  try {
    // Step 1 — Generate the HTML profile page
    const htmlCommand = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: PROFILE_HTML_PROMPT }],
      messages: [{
        role: 'user',
        content: [{ text: `Generate the HTML profile page for this person.\n\nIDENTITY DOCUMENT:\n\n${identityDocument}` }]
      }],
      inferenceConfig: {
        maxTokens: 8000,
        temperature: 0.3,
      },
    });

    const htmlResponse = await bedrock.send(htmlCommand);
    let html = htmlResponse.output?.message?.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    html = html.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();

    if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
      throw new Error('Model did not return valid HTML');
    }

    // Step 2 — Determine slug (reuse existing if updating)
    let slug = existingSlug;
    let isUpdate = false;

    if (slug) {
      // Verify slug exists in DynamoDB
      const existing = await dynamo.send(new GetCommand({
        TableName: 'eigenself-profiles',
        Key: { slug },
      }));
      isUpdate = !!existing.Item;
    }

    if (!slug || !isUpdate) {
      slug = generateSlug(userName || 'profile');
    }

    // Step 3 — Upload HTML to S3
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${slug}/index.html`,
      Body: html,
      ContentType: 'text/html; charset=utf-8',
      CacheControl: 'max-age=3600',
    }));

    // Step 4 — If updating, invalidate CloudFront cache
    if (isUpdate && CF_DISTRIBUTION_ID) {
      await cf.send(new CreateInvalidationCommand({
        DistributionId: CF_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `${slug}-${Date.now()}`,
          Paths: { Quantity: 1, Items: [`/${slug}/index.html`] },
        },
      }));
    }

    // Step 5 — Save/update slug record in DynamoDB
    await dynamo.send(new PutCommand({
      TableName: 'eigenself-profiles',
      Item: {
        slug,
        userName: userName || 'Unknown',
        createdAt: isUpdate ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    const profileUrl = `https://${CF_DOMAIN}/${slug}/index.html`;

    console.log(`Profile ${isUpdate ? 'updated' : 'published'}: ${profileUrl}`);
    res.json({ profileUrl, slug, isUpdate });

  } catch (error) {
    console.error('Profile publish error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/extract-name', async (req, res) => {
  const { cvText } = req.body;

  if (!cvText) {
    return res.json({ name: null });
  }

  try {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: 'You extract names from CV text. Respond with only the person\'s full name — nothing else. No punctuation, no explanation. If you cannot find a name, respond with exactly: UNKNOWN' }],
      messages: [{ role: 'user', content: [{ text: `Extract the full name of the person from this CV:\n\n${cvText.slice(0, 1000)}` }] }],
      inferenceConfig: { maxTokens: 20, temperature: 0 },
    });

    const response = await bedrock.send(command);
    const name = response.output?.message?.content?.[0]?.text?.trim() ?? 'UNKNOWN';

    res.json({ name: name === 'UNKNOWN' ? null : name });
  } catch {
    res.json({ name: null });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }

  const audioBuffer = req.file.buffer;
  const mimeType = req.file.mimetype || 'audio/webm';

  const formatMap = {
    'audio/webm': 'webm',
    'audio/ogg':  'ogg',
    'audio/mp4':  'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav':  'wav',
    'audio/flac': 'flac',
    'audio/aac':  'aac',
  };

  const baseMime = mimeType.split(';')[0].trim();
  const audioFormat = formatMap[baseMime] ?? 'webm';

  console.log(`Transcribe request: ${audioBuffer.length} bytes, mime=${mimeType}, format=${audioFormat}`);

  try {
    const payload = {
      messages: [
        {
          role: 'user',
          content: [
            {
              audio: {
                format: audioFormat,
                source: {
                  bytes: audioBuffer.toString('base64'),
                },
              },
            },
            {
              text: 'Please transcribe this audio recording. Output only the spoken words, nothing else. If silent, output [SILENT].',
            },
          ],
        },
      ],
      system: [{ text: 'You are a transcription service. Output only the transcript — no explanations, no punctuation corrections, no preamble.' }],
      inferenceConfig: { max_new_tokens: 500, temperature: 0 },
    };

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    const transcript = responseBody?.output?.message?.content?.[0]?.text?.trim() ?? '';

    if (!transcript || transcript === '[SILENT]') {
      console.log('Transcribe result: silent or empty');
      return res.json({ transcript: '' });
    }

    console.log('Transcribe result:', transcript);
    res.json({ transcript });

  } catch (error) {
    console.error('Transcribe error name:', error.name);
    console.error('Transcribe error message:', error.message);
    console.error('Transcribe HTTP status:', error.$metadata?.httpStatusCode);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// ── Global error handler (catches multer errors and anything else) ────────────
// Must have 4 parameters for Express to treat it as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      'http://localhost:4200',
      'https://d1k8d68asrg0f1.cloudfront.net',
    ],
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e7, // 10MB — needed for audio chunks
});

// ── Socket.IO: Nova 2 Sonic voice sessions ──────────────────────────────────

const SONIC_MODEL_ID = 'amazon.nova-2-sonic-v1:0';

// Active sessions keyed by socket.id
const sonicSessions = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // ── sonic:start ─────────────────────────────────────────────────────────
  // Payload: { systemPrompt: string, cvText?: string }
  // Opens a Bedrock bidirectional stream and begins the Sonic session.

  socket.on('sonic:start', async (data) => {
    const { systemPrompt, cvText } = data ?? {};

    if (sonicSessions.has(socket.id)) {
      console.log(`Session already exists for ${socket.id} — closing old one first`);
      await closeSonicSession(socket.id);
    }

    console.log(`Starting Sonic session for ${socket.id}`);

    try {
      const session = await createSonicSession({
        socket,
        systemPrompt: systemPrompt ?? '',
        cvText: cvText ?? '',
      });

      sonicSessions.set(socket.id, session);
      socket.emit('sonic:ready');
      console.log(`Sonic session ready for ${socket.id}`);
    } catch (error) {
      console.error(`Sonic session start error for ${socket.id}:`, error.message);
      socket.emit('sonic:error', { message: error.message });
    }
  });

  // ── sonic:audio ─────────────────────────────────────────────────────────
  // Payload: Buffer of 16kHz mono PCM16 audio (raw, no container)
  // Forwarded directly to the Bedrock stream.

  socket.on('sonic:audio', (audioChunk) => {
    const session = sonicSessions.get(socket.id);
    if (!session) return;

    try {
      session.sendAudio(Buffer.isBuffer(audioChunk) ? audioChunk : Buffer.from(audioChunk));
    } catch (error) {
      console.error(`Audio send error for ${socket.id}:`, error.message);
    }
  });

  // ── sonic:text ──────────────────────────────────────────────────────────
  // Payload: { text: string }
  // Sends a typed user message into the Sonic session as a text content block.
  // Used for the hybrid text+voice mode and Firefox fallback.

  socket.on('sonic:text', async (data) => {
    const session = sonicSessions.get(socket.id);
    if (!session) return;

    const text = data?.text ?? '';
    if (!text.trim()) return;

    console.log(`Text input for ${socket.id}: "${text.slice(0, 60)}"`);

    try {
      await session.sendText(text);
    } catch (error) {
      console.error(`Text send error for ${socket.id}:`, error.message);
    }
  });

  // ── sonic:stop ──────────────────────────────────────────────────────────
  // Closes the Bedrock stream cleanly.

  socket.on('sonic:stop', async () => {
    console.log(`Stopping Sonic session for ${socket.id}`);
    await closeSonicSession(socket.id);
    socket.emit('sonic:stopped');
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    await closeSonicSession(socket.id);
  });
});

// ── SonicSession factory ─────────────────────────────────────────────────────

async function createSonicSession({ socket, systemPrompt, cvText }) {
  const textEncoder = new TextEncoder();

  // Queue of events to send to Bedrock
  const eventQueue = [];
  let resolveNext = null;
  let sessionClosed = false;

  function enqueue(event) {
    if (sessionClosed) return;
    const bytes = textEncoder.encode(JSON.stringify(event));
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ chunk: { bytes } });
    } else {
      eventQueue.push({ chunk: { bytes } });
    }
  }

  // AsyncIterable that the Bedrock SDK reads from
  async function* eventStream() {
    while (!sessionClosed) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift();
      } else {
        yield await new Promise((resolve) => {
          resolveNext = resolve;
        });
      }
    }
  }

  // Build the system prompt — use the server-side SYSTEM_PROMPT when none is provided by the client
  const effectiveSystemPrompt = systemPrompt || SYSTEM_PROMPT;
  const fullSystemPrompt = cvText
    ? `${effectiveSystemPrompt}\n\n---\n\nCV PROVIDED (read before the conversation starts):\n\n${cvText}\n\n---\n\nYou have read this CV. Do not ask about career history, job titles, or skills listed here. Open with something specific from the CV, then focus on what the CV cannot tell you: how they think, how they communicate, what they would never say.\n\nIMPORTANT FOR VOICE: You are speaking out loud. Keep responses to 1-3 short sentences. No lists, no bullet points, no markdown. Sound like a thoughtful person having a real conversation.`
    : `${effectiveSystemPrompt}\n\nIMPORTANT FOR VOICE: You are speaking out loud. Keep responses to 1-3 short sentences. No lists, no bullet points, no markdown. Sound like a thoughtful person having a real conversation.`;

  // Send session initialization events
  enqueue({
    event: {
      sessionStart: {
        inferenceConfiguration: {
          maxTokens: 1024,
          topP: 0.9,
          temperature: 0.7,
        },
      },
    },
  });

  enqueue({
    event: {
      promptStart: {
        promptName: socket.id,
        textOutputConfiguration: { mediaType: 'text/plain' },
        audioOutputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: 24000,
          sampleSizeBits: 16,
          channelCount: 1,
          voiceId: 'tiffany', // warm, clear voice
          encoding: 'base64',
        },
      },
    },
  });

  // Send system prompt as text content block
  enqueue({
    event: {
      contentStart: {
        promptName: socket.id,
        contentName: `${socket.id}-system`,
        type: 'TEXT',
        interactive: false,
        role: 'SYSTEM',
        textInputConfiguration: { mediaType: 'text/plain' },
      },
    },
  });

  enqueue({
    event: {
      textInput: {
        promptName: socket.id,
        contentName: `${socket.id}-system`,
        content: fullSystemPrompt,
      },
    },
  });

  enqueue({
    event: {
      contentEnd: {
        promptName: socket.id,
        contentName: `${socket.id}-system`,
      },
    },
  });

  // Open the audio input content block — stays open until we close it
  const audioContentName = `${socket.id}-audio-${Date.now()}`;

  enqueue({
    event: {
      contentStart: {
        promptName: socket.id,
        contentName: audioContentName,
        type: 'AUDIO',
        interactive: true,
        role: 'USER',
        audioInputConfiguration: {
          mediaType: 'audio/lpcm',
          sampleRateHertz: 16000,
          sampleSizeBits: 16,
          channelCount: 1,
          encoding: 'base64',
        },
      },
    },
  });

  // Start the Bedrock bidirectional stream
  const command = new InvokeModelWithBidirectionalStreamCommand({
    modelId: SONIC_MODEL_ID,
    body: eventStream(),
  });

  const response = await bedrock.send(command);

  // Transcript accumulator — we build the full conversation text for document generation
  let transcriptBuffer = { role: null, text: '' };
  const fullTranscript = []; // array of { role, text } entries
  let completeSent = false; // guard — emit sonic:complete only once

  // Process responses from Bedrock
  (async () => {
    try {
      for await (const event of response.body) {
        if (sessionClosed) break;

        if (!event.chunk?.bytes) continue;

        let data;
        try {
          data = JSON.parse(Buffer.from(event.chunk.bytes).toString('utf-8'));
        } catch {
          continue;
        }

        if (!data.event) continue;

        const ev = data.event;

        // Audio output — stream directly to browser
        if (ev.audioOutput?.content) {
          socket.emit('sonic:audio-out', ev.audioOutput.content); // base64 PCM
        }

        // Text output — accumulate and forward
        if (ev.textOutput?.content) {
          const text = ev.textOutput.content;
          const role = ev.textOutput.role === 'ASSISTANT' ? 'agent' : 'user';

          if (transcriptBuffer.role !== role) {
            if (transcriptBuffer.text.trim()) {
              fullTranscript.push({ role: transcriptBuffer.role, text: transcriptBuffer.text.trim() });
              socket.emit('sonic:transcript-chunk', {
                role: transcriptBuffer.role,
                text: transcriptBuffer.text.trim(),
                final: true,
              });
            }
            transcriptBuffer = { role, text };
          } else {
            transcriptBuffer.text += text;
          }

          socket.emit('sonic:transcript-chunk', { role, text, final: false });
        }

        // Content end — flush the buffer
        if (ev.contentEnd) {
          if (transcriptBuffer.text.trim()) {
            fullTranscript.push({ role: transcriptBuffer.role, text: transcriptBuffer.text.trim() });
            socket.emit('sonic:transcript-chunk', {
              role: transcriptBuffer.role,
              text: transcriptBuffer.text.trim(),
              final: true,
            });
            transcriptBuffer = { role: null, text: '' };
          }
        }

        // Detect [CONVERSATION_COMPLETE] signal from the agent (emit only once)
        if (!completeSent) {
          const allText = fullTranscript.map(t => t.text).join(' ');
          if (allText.includes('[CONVERSATION_COMPLETE]')) {
            completeSent = true;
            socket.emit('sonic:complete', { transcript: fullTranscript });
          }
        }
      }
    } catch (error) {
      if (!sessionClosed) {
        console.error(`Sonic response stream error for ${socket.id}:`, error.message);
        socket.emit('sonic:error', { message: error.message });
      }
    }
  })();

  // Public API for the session
  return {
    audioContentName,

    sendAudio(pcmBuffer) {
      enqueue({
        event: {
          audioInput: {
            promptName: socket.id,
            contentName: audioContentName,
            content: pcmBuffer.toString('base64'),
          },
        },
      });
    },

    async sendText(text) {
      const textContentName = `${socket.id}-text-${Date.now()}`;

      enqueue({
        event: {
          contentStart: {
            promptName: socket.id,
            contentName: textContentName,
            type: 'TEXT',
            interactive: true,
            role: 'USER',
            textInputConfiguration: { mediaType: 'text/plain' },
          },
        },
      });

      enqueue({
        event: {
          textInput: {
            promptName: socket.id,
            contentName: textContentName,
            content: text,
          },
        },
      });

      enqueue({
        event: {
          contentEnd: {
            promptName: socket.id,
            contentName: textContentName,
          },
        },
      });
    },

    close() {
      sessionClosed = true;
      // Close audio input
      enqueue({
        event: {
          contentEnd: {
            promptName: socket.id,
            contentName: audioContentName,
          },
        },
      });
      // Close prompt
      enqueue({
        event: {
          promptEnd: { promptName: socket.id },
        },
      });
      // Close session
      enqueue({
        event: { sessionEnd: {} },
      });
      // Unblock the async generator so it can drain and exit
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      }
    },
  };
}

async function closeSonicSession(socketId) {
  const session = sonicSessions.get(socketId);
  if (!session) return;
  try {
    session.close();
  } catch (error) {
    console.error(`Error closing session for ${socketId}:`, error.message);
  }
  sonicSessions.delete(socketId);
}

// ── Start server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Eigenself server running on http://localhost:${PORT}`);
  console.log('Bedrock region: us-east-1');
  console.log(`Nova 2 Lite: ${MODEL_ID}`);
  console.log(`Nova 2 Sonic: ${SONIC_MODEL_ID}`);
  console.log('Endpoints: /api/chat, /api/parse-cv, /api/extract-name, /api/generate-document, /api/publish-profile, /api/transcribe');
  console.log('Socket.IO: sonic:start, sonic:audio, sonic:text, sonic:stop');
});
