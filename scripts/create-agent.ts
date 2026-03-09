/**
 * create-agent.ts
 *
 * One-time setup script — creates the Eigenself interview Bedrock Agent
 * and its alias, then prints the IDs you need to add to .env.
 *
 * Run once from the project root:
 *   npx tsx scripts/create-agent.ts
 *
 * Prerequisites:
 *   - AWS credentials configured (~/.aws/credentials or env vars)
 *   - BEDROCK_AGENT_ROLE_ARN set in environment (run create-agent-role.ts first)
 *   - Nova 2 Lite model access approved in us-east-1
 */

import {
  BedrockAgentClient,
  CreateAgentCommand,
  PrepareAgentCommand,
  CreateAgentAliasCommand,
  CreateAgentActionGroupCommand,
  GetAgentCommand,
} from '@aws-sdk/client-bedrock-agent';
import { AGENT_INSTRUCTIONS } from '../src/server/prompts/agent-interview';

const REGION = 'us-east-1';
const AGENT_NAME = 'eigenself-interviewer';
const AGENT_MODEL = 'us.amazon.nova-2-lite-v1:0';
const AGENT_ROLE_ARN = process.env['BEDROCK_AGENT_ROLE_ARN'] ?? '';

async function main() {
  if (!AGENT_ROLE_ARN) {
    console.error(`
ERROR: BEDROCK_AGENT_ROLE_ARN is not set.

Run the role creation script first:
  npx tsx scripts/create-agent-role.ts

Then export the ARN it prints and re-run this script:
  export BEDROCK_AGENT_ROLE_ARN=arn:aws:iam::YOUR_ACCOUNT_ID:role/eigenself-bedrock-agent-role
  npx tsx scripts/create-agent.ts
`);
    process.exit(1);
  }

  const client = new BedrockAgentClient({ region: REGION });

  // Step 1 — create the agent
  console.log('Creating Bedrock Agent...');
  const createResponse = await client.send(new CreateAgentCommand({
    agentName: AGENT_NAME,
    foundationModel: AGENT_MODEL,
    instruction: AGENT_INSTRUCTIONS,
    agentResourceRoleArn: AGENT_ROLE_ARN,
    description: 'Eigenself interview agent — conducts adaptive identity interviews',
    idleSessionTTLInSeconds: 1800,
  }));

  const agentId = createResponse.agent?.agentId;
  if (!agentId) throw new Error('Agent creation failed — no agentId returned');
  console.log(`Agent created: ${agentId}`);

  // Step 2 — wait for NOT_PREPARED
  console.log('Waiting for agent to initialise...');
  await waitForAgentStatus(client, agentId, 'NOT_PREPARED');

  // Step 3 — enable AMAZON.UserInput so the agent can respond conversationally
  // without requiring a tool/action group invocation. Without this, Bedrock
  // rejects natural conversation turns with "tools do not support this action".
  console.log('Enabling UserInput action group...');
  await client.send(new CreateAgentActionGroupCommand({
    agentId,
    agentVersion: 'DRAFT',
    actionGroupName: 'UserInputAction',
    parentActionGroupSignature: 'AMAZON.UserInput',
    actionGroupState: 'ENABLED',
  }));

  // Step 4 — prepare (compile) the agent
  console.log('Preparing agent...');
  await client.send(new PrepareAgentCommand({ agentId }));
  await waitForAgentStatus(client, agentId, 'PREPARED');
  console.log('Agent prepared.');

  // Step 4 — create a named alias
  console.log('Creating agent alias...');
  const aliasResponse = await client.send(new CreateAgentAliasCommand({
    agentId,
    agentAliasName: 'live',
    description: 'Production alias for eigenself-interviewer',
  }));

  const aliasId = aliasResponse.agentAlias?.agentAliasId;
  if (!aliasId) throw new Error('Alias creation failed — no agentAliasId returned');
  console.log(`Alias created: ${aliasId}`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Bedrock Agent ready.

Add these two lines to your .env file:

BEDROCK_AGENT_ID=${agentId}
BEDROCK_AGENT_ALIAS_ID=${aliasId}

Then restart the server: npm run server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function waitForAgentStatus(
  client: BedrockAgentClient,
  agentId: string,
  targetStatus: string,
  maxAttempts = 20,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const response = await client.send(new GetAgentCommand({ agentId }));
    const status = response.agent?.agentStatus;
    console.log(`  Agent status: ${status}`);
    if (status === targetStatus) return;
    if (status === 'FAILED') throw new Error('Agent entered FAILED state');
  }
  throw new Error(`Agent did not reach ${targetStatus} within timeout`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
