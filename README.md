# Eigenself

> **Amazon Nova AI Hackathon · Voice AI Category**

*What would AI say if it actually understood you? Eigenself is how you find out.*

---

## What It Does

Eigenself conducts a 20-minute voice interview using Amazon Nova 2 Sonic, then synthesises everything you said into a structured `.md` identity protocol — a machine-readable document that captures not just what you have done, but how you think, what drives you, how you communicate, and what makes you specifically you.

The protocol is designed to be loaded into any AI agent as a system prompt. Once loaded, that agent can represent you accurately — not approximately. What you do with it from there is up to you. Some examples of what's already built in:

- **Evaluate job fit** — paste a job description, get a scored fit report
- **Write cover letters** — generated in your actual voice
- **Publish a web profile** — hosted on S3 via CloudFront
- **Power interview practice** — questions calibrated to who you actually are
- **Serve as your AI context layer** — load into Claude Projects, Custom GPTs, Cursor, or any AI tool

The `.md` file is not a document. It is a protocol. The CV becomes a legacy byproduct.

---

## Architecture

```
User speaks
     ↓
Nova 2 Sonic (Socket.IO bidirectional stream)
     ↓ (voice path — Sonic handles full conversation state)
Nova 2 Lite (identity protocol synthesis)
     ↓
S3 + CloudFront (profile hosting)
     ↓
DynamoDB (profile slug storage)
```

For text mode, a Bedrock Agent replaces Nova 2 Sonic as the interview engine — bringing session memory and adaptive questioning across eight identity areas. Both paths converge on the same Nova 2 Lite synthesis step.

**Frontend:** Angular 21, standalone components, Angular Signals, OnPush change detection, Socket.IO client, Web Audio API + AudioWorklet for PCM capture

**Backend:** Node.js + Express + Socket.IO, TypeScript, AWS SDK v3

---

## Nova Services Used

| Service | Role |
|---|---|
| **Amazon Nova 2 Sonic** | Bidirectional voice interview engine — unified STT + LLM + TTS, natural turn-taking |
| **Amazon Nova 2 Lite** | Protocol synthesis, fit evaluation, cover letter, HTML profile, transcription fallback |
| **Amazon Bedrock Agents** | Text mode interview orchestration — adaptive, stateful, session memory |
| **Amazon S3** | Profile hosting |
| **Amazon CloudFront** | Profile delivery + cache invalidation |
| **Amazon DynamoDB** | Profile slug storage (used when publishing a web profile) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, RxJS, Tailwind CSS, Signals |
| Backend | Node.js, Express, TypeScript, Socket.IO |
| AI / AWS | Nova 2 Sonic, Nova 2 Lite, Bedrock Agents, S3, CloudFront, DynamoDB, EC2 |
| Real-time | Socket.IO WebSocket bridge for voice streaming |
| Audio | Web Audio API, AudioWorklet, PCM capture |

---

## Quick Start

### Prerequisites

- Node.js 18+
- AWS account with Bedrock access approved for:
  - `us.amazon.nova-2-lite-v1:0`
  - `amazon.nova-2-sonic-v1:0`
- AWS CLI configured (`aws configure`, region `us-east-1`)

### Install

```bash
git clone https://github.com/woriworiwa/eigenself.git
cd eigenself
npm install
```

### Configure

Create a `.env` file in the root:

```env
BEDROCK_AGENT_ID=your_agent_id
BEDROCK_AGENT_ALIAS_ID=your_agent_alias_id
EIGENSELF_S3_BUCKET=your_s3_bucket
EIGENSELF_CF_DOMAIN=your_cloudfront_domain
EIGENSELF_CF_DISTRIBUTION_ID=your_distribution_id
```

AWS credentials are read from `~/.aws/credentials` automatically. Do not hardcode credentials. Do not commit `.env`.


### Run Locally

**Terminal 1 — Express backend:**
```bash
npm run server
```
Runs at `http://localhost:3000`

**Terminal 2 — Angular frontend:**
```bash
npm start
```
Opens at `http://localhost:4200`

> Voice mode requires Chrome or Chromium (Web Audio Worklet API).

---

## App States

```
Welcome → Onboarding → Interview → Processing → Reveal
```

| State | What Happens |
|---|---|
| **Welcome** | Landing page — tagline, how it works, who it's for |
| **Onboarding** | Name → optional CV upload → mode selection (voice / text) |
| **Interview** | Live conversation with Nova 2 Sonic (voice) or Bedrock Agent (text) |
| **Processing** | Nova 2 Lite synthesises the protocol from the full transcript |
| **Reveal** | Protocol displayed — evaluate fit, write cover letter, publish profile |

---

## Key Technical Detail

Nova 2 Sonic uses a bidirectional async streaming API (`InvokeModelWithBidirectionalStreamCommand`) requiring a persistent async generator. The implementation in `src/server/socket/sonic-session.ts` handles:

- Event queue management across the async generator lifecycle
- Turn detection and end-of-speech timeout
- Transcript deduplication — Bedrock replays completed TEXT blocks verbatim on each turn
- Clean session teardown on conversation complete

---

## Project Structure

```
eigenself/
├── src/
│   ├── app/
│   │   ├── welcome/              # Landing page
│   │   ├── interview/            # Main state machine
│   │   │   ├── onboarding/       # Name → CV → mode
│   │   │   ├── interview-state/  # Live conversation
│   │   │   ├── processing/       # Animated synthesis state
│   │   │   └── reveal/           # Protocol + tools
│   │   └── services/
│   │       └── sonic.service.ts  # Nova 2 Sonic client
│   └── server/
│       ├── routes/               # REST endpoints
│       ├── socket/               # Sonic session handlers
│       ├── prompts/              # All model instructions
│       └── lib/                  # AWS singletons
└── public/
    └── audio-processor.js        # AudioWorklet PCM processor
```

---

## About the Name

**Eigen-** (German): *own, peculiar to, characteristic of a thing and nothing else*

**Eigenself** = one's own characteristic self. Not the version you perform for a recruiter. Not the keywords on a CV. The thing underneath.

---

*Amazon Nova AI Hackathon · Voice AI Category · March 2026*
