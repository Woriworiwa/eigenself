/**
 * fix-agent.ts
 *
 * Patches the existing Bedrock Agent so it can respond conversationally
 * without requiring a tool/action group invocation.
 *
 * THE PROBLEM:
 *   Bedrock Agents default to "orchestration mode" — they expect to call
 *   action groups (tools) to fulfill requests. Without any action groups,
 *   the agent falls back to a built-in guardrail that rejects natural
 *   conversation turns with:
 *     "I cannot conduct interviews... The available tools do not support this."
 *
 * THE FIX:
 *   Enable the AMAZON.UserInput built-in action group. This tells Bedrock
 *   "this agent is allowed to respond directly to the user without invoking
 *   any tools." It is the official AWS mechanism for pure conversational agents.
 *
 * Run from the project root (requires BEDROCK_AGENT_ID in .env or env):
 *   npx tsx scripts/fix-agent.ts
 */

import {
  BedrockAgentClient,
  UpdateAgentCommand,
  CreateAgentActionGroupCommand,
  PrepareAgentCommand,
  GetAgentCommand,
  ListAgentActionGroupsCommand,
} from '@aws-sdk/client-bedrock-agent';
import { AGENT_INSTRUCTIONS } from '../src/server/prompts/agent-interview';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = 'us-east-1';
const AGENT_ID    = process.env['BEDROCK_AGENT_ID'] ?? '';
const AGENT_MODEL = 'us.amazon.nova-2-lite-v1:0';
const AGENT_ROLE_ARN = process.env['BEDROCK_AGENT_ROLE_ARN'] ?? '';

async function main() {
  if (!AGENT_ID) {
    console.error('ERROR: BEDROCK_AGENT_ID is not set in your .env file.');
    process.exit(1);
  }

  const client = new BedrockAgentClient({ region: REGION });

  // ── Step 1: Check current agent status ────────────────────────────────────
  console.log(`Fetching agent ${AGENT_ID}...`);
  const agentInfo = await client.send(new GetAgentCommand({ agentId: AGENT_ID }));
  const agent = agentInfo.agent;
  if (!agent) throw new Error('Agent not found');

  console.log(`  Name:   ${agent.agentName}`);
  console.log(`  Status: ${agent.agentStatus}`);
  console.log(`  Model:  ${agent.foundationModel}`);

  const roleArn = AGENT_ROLE_ARN || agent.agentResourceRoleArn || '';

  // ── Step 2: Check if UserInput action group already exists ────────────────
  console.log('\nChecking existing action groups...');
  const actionGroups = await client.send(new ListAgentActionGroupsCommand({
    agentId: AGENT_ID,
    agentVersion: 'DRAFT',
  }));

  const hasUserInput = actionGroups.actionGroupSummaries?.some(
    ag => ag.actionGroupName === 'UserInputAction'
  );

  if (hasUserInput) {
    console.log('  ✓ UserInput action group already present.');
  } else {
    // ── Step 3: Add the AMAZON.UserInput built-in action group ───────────────
    console.log('\nAdding AMAZON.UserInput action group...');
    await client.send(new CreateAgentActionGroupCommand({
      agentId: AGENT_ID,
      agentVersion: 'DRAFT',
      actionGroupName: 'UserInputAction',
      parentActionGroupSignature: 'AMAZON.UserInput',
      actionGroupState: 'ENABLED',
    }));
    console.log('  ✓ UserInput action group added.');
  }

  // ── Step 4: Re-update the agent instructions (force a new DRAFT version) ──
  console.log('\nUpdating agent instructions...');
  await client.send(new UpdateAgentCommand({
    agentId: AGENT_ID,
    agentName: agent.agentName!,
    foundationModel: agent.foundationModel ?? AGENT_MODEL,
    instruction: AGENT_INSTRUCTIONS,
    agentResourceRoleArn: roleArn,
    idleSessionTTLInSeconds: agent.idleSessionTTLInSeconds ?? 1800,
  }));
  console.log('  ✓ Instructions updated.');

  // ── Step 5: Prepare (recompile) the agent ─────────────────────────────────
  console.log('\nPreparing agent (this takes ~15 seconds)...');
  await client.send(new PrepareAgentCommand({ agentId: AGENT_ID }));
  await waitForStatus(client, AGENT_ID, 'PREPARED');
  console.log('  ✓ Agent prepared.');

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Agent fixed. The AMAZON.UserInput action group
  is now enabled — the agent can respond to users
  directly without requiring a tool invocation.

  No .env changes needed. Restart the server and
  try the interview again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function waitForStatus(
  client: BedrockAgentClient,
  agentId: string,
  target: string,
  maxAttempts = 20,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const res = await client.send(new GetAgentCommand({ agentId }));
    const status = res.agent?.agentStatus ?? '';
    console.log(`  Status: ${status}`);
    if (status === target) return;
    if (status === 'FAILED') throw new Error('Agent entered FAILED state during prepare');
  }
  throw new Error(`Agent did not reach ${target} within timeout`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('\nScript failed:', err.message ?? err);
  process.exit(1);
});
