# Eigenself — AI-Native Identity Protocol Builder

> **Amazon Nova AI Hackathon submission · Voice AI category**

LinkedIn, CVs, ATS systems — they reduce people to a list of keywords. Skills, years of experience, job titles. A matching algorithm decides your worth. It is cold, mechanical, and deeply dehumanizing. People feel it. That is why job searching feels so demoralizing.

This product does the opposite. It says: **you are more than your skills list**. You have a voice, a way of thinking, things that energize you and things that drain you. You have a story. And we help you tell it — in a way that even AI agents can understand and respect.

Eigenself conducts a voice conversation with you, finds what is uniquely human about you, and produces a structured `.md` identity protocol that AI agents can load, query, and reason over.

This is not a CV builder. The CV is a byproduct. The primary output is a machine-readable protocol — built natively for the AI-powered hiring world that already exists.

---

## What It Does

A user speaks. Amazon Nova 2 Sonic conducts the interview — conversational, unhurried, curious. Nova 2 Lite structures the output into a portable identity protocol. From that protocol, a professional bio and a legacy CV are rendered as secondary formats.

The protocol is then the asset. Load it into any AI agent and ask: *"Is this person a fit for what we need?"*

**Three outputs, ranked by importance:**
1. **AI Protocol** — machine-readable `.md` structured for agent consumption
2. **Professional Bio** — human-readable rendering for LinkedIn and portfolios
3. **CV** — legacy rendering for systems that still require it

---

## Architecture

```
Browser (Angular, port 4200)
  └─ WebSocket / HTTP → Express server (port 3000)
       └─ Amazon Nova 2 Sonic    → Voice interview engine
       └─ Amazon Bedrock Agents  → Adaptive interview orchestration
       └─ Bedrock Knowledge Base → Cross-session protocol memory
       └─ Amazon Nova 2 Lite     → Protocol structuring + fit evaluation
```

In production, the Express server becomes an AWS Lambda function — no code changes required.

---

## Nova Services Used

| Service | Role |
|---|---|
| **Amazon Nova 2 Sonic** | Speech-to-speech voice interview engine — unified STT + LLM + TTS in one model, natural turn-taking, tone interpretation |
| **Amazon Nova 2 Lite** | Profile reasoning engine — structures interview output into the identity protocol using extended thinking (1M token context) |
| **Amazon Bedrock Agents** | Adaptive interview orchestration — reads prior answers and decides the next question dynamically |
| **Bedrock Knowledge Bases** | Cross-session protocol memory — stores and retrieves the user's protocol across visits without requiring login |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 21, RxJS, Tailwind CSS, Nx |
| Backend | Node.js, Express, TypeScript |
| AI / AWS | Amazon Bedrock, Nova 2 Sonic, Nova 2 Lite, Bedrock Agents, Bedrock Knowledge Bases |
| AWS SDK | `@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-bedrock-agent-runtime` |
| Real-time | Socket.io (WebSocket bridge for voice streaming) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- AWS account with Bedrock model access approved for:
  - `amazon.nova-lite-v1:0` (Nova 2 Lite)
  - `amazon.nova-sonic-v1:0` (Nova 2 Sonic)
- AWS CLI configured locally (`aws configure`)

### Install

```bash
git clone https://github.com/woriworiwa/eigenself.git
cd eigenself
npm install
```

### Configure

Copy `.env.example` to `.env` and set your region:

```env
AWS_REGION=us-east-1
```

AWS credentials are read from `~/.aws/credentials` automatically. Do not hardcode credentials. Do not commit the `.env` file.

### Run Locally (Two Terminals)

**Terminal 1 — Angular frontend:**
```bash
npm start
```
Opens at `http://localhost:4200`

**Terminal 2 — Express backend (Bedrock proxy):**
```bash
npm run server
```
Runs at `http://localhost:3000`

---

## Interview Flow

The app has five states, navigated sequentially:

```
Welcome → Onboarding → Interview → Processing → Reveal
```

| State | What Happens |
|---|---|
| **Welcome** | Mission statement and entry point |
| **Onboarding** | Mode selection — voice (Nova 2 Sonic) or text |
| **Interview** | 5 adaptive questions via Nova 2 Sonic or text input |
| **Processing** | Nova 2 Lite structures the protocol (animated thinking state) |
| **Reveal** | Identity protocol displayed — copy AI Protocol, copy Bio, download CV |

---

## IAM Permissions

Minimum IAM permissions required for the backend:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-sonic-v1:0"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "arn:aws:bedrock:us-east-1:*:knowledge-base/*"
    }
  ]
}
```

---

## Project Structure

```
eigenself/
├── src/
│   ├── app/
│   │   ├── welcome/          # Entry state
│   │   ├── interview/        # Interview flow
│   │   │   ├── onboarding/   # Mode selection
│   │   │   ├── interview-state/  # Active interview
│   │   │   ├── processing/   # Protocol generation
│   │   │   └── reveal/       # Protocol display
│   │   └── services/
│   │       └── sonic.service.ts  # Nova 2 Sonic integration
│   └── server/               # Express backend → Lambda-ready
├── public/
│   └── audio-processor.js    # Web Audio API worklet
├── scripts/
│   ├── create-agent.ts       # Bedrock Agent provisioning
│   └── create-agent-role.ts  # IAM role setup
└── server.js                 # Production server entry
```

---

## Hackathon Submission

- **Event:** Amazon Nova AI Hackathon
- **Category:** Voice AI
- **Primary model:** Amazon Nova 2 Sonic
- **Deadline:** March 16, 2026

---

## About Eigenself

**Eigen-** (German prefix): *own, peculiar to, characteristic of*

Eigenself = one's own characteristic self. Built for the world where AI reads your identity before any human does.
