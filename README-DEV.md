# Eigenself — Dev Setup

Two terminals are required to run the app locally.

## Terminal 1 — Angular dev server

```bash
npm start
```

Runs on http://localhost:4200

## Terminal 2 — Node.js backend (Bedrock proxy)

```bash
npm run server
```

Runs on http://localhost:3000

## AWS credentials

The server reads credentials automatically from `~/.aws/credentials` (standard AWS CLI config).
No credentials should ever be hardcoded or committed.

Minimum IAM permissions required:

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-lite-v1:0"
}
```

## Architecture

```
Browser (port 4200)
  └─ POST /api/chat
       └─ Node.js Express (port 3000)
            └─ AWS SDK v3 → Amazon Bedrock Nova 2 Lite (us-east-1)
```

In production, `server.js` becomes a Lambda function — no code changes needed.
