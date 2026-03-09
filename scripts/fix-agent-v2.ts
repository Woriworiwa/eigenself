/**
 * fix-agent-v2.ts
 *
 * Correct order:
 *   1. UpdateAgent  (puts agent back to NOT_PREPARED / UPDATING)
 *   2. Wait for NOT_PREPARED
 *   3. CreateAgentActionGroup (must happen on DRAFT while NOT_PREPARED)
 *   4. PrepareAgent
 *   5. Wait for PREPARED
 *
 * Run: npx tsx scripts/fix-agent-v2.ts
 */

import {
  BedrockAgentClient,
  UpdateAgentCommand,
  CreateAgentActionGroupCommand,
  ListAgentActionGroupsCommand,
  PrepareAgentCommand,
  GetAgentCommand,
} from '@aws-sdk/client-bedrock-agent';
import { AGENT_INSTRUCTIONS } from '../src/server/prompts/agent-interview';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION    = 'us-east-1';
const AGENT_ID  = process.env['BEDROCK_AGENT_ID'] ?? '';

async function main() {
  if (!AGENT_ID) {
    console.error('ERROR: BEDROCK_AGENT_ID not set in .env');
    process.exit(1);
  }

  const client = new BedrockAgentClient({ region: REGION });

  // ── 1. Fetch current agent ─────────────────────────────────────────────────
  console.log(`Fetching agent ${AGENT_ID}...`);
  const { agent } = await client.send(new GetAgentCommand({ agentId: AGENT_ID }));
  if (!agent) throw new Error('Agent not found');
  console.log(`  Status: ${agent.agentStatus}  Model: ${agent.foundationModel}`);

  // ── 2. UpdateAgent — moves it back to NOT_PREPARED ────────────────────────
  console.log('\nUpdating agent (this resets it to NOT_PREPARED)...');
  await client.send(new UpdateAgentCommand({
    agentId:               AGENT_ID,
    agentName:             agent.agentName!,
    foundationModel:       agent.foundationModel!,
    instruction:           AGENT_INSTRUCTIONS,
    agentResourceRoleArn:  agent.agentResourceRoleArn!,
    idleSessionTTLInSeconds: agent.idleSessionTTLInSeconds ?? 1800,
  }));

  await waitForStatus(client, AGENT_ID, ['NOT_PREPARED', 'PREPARED']);
  console.log('  ✓ Agent updated.');

  // ── 3. Check / create UserInput action group ───────────────────────────────
  console.log('\nChecking action groups on DRAFT...');
  const { actionGroupSummaries = [] } = await client.send(
    new ListAgentActionGroupsCommand({ agentId: AGENT_ID, agentVersion: 'DRAFT' })
  );
  console.log(`  Found ${actionGroupSummaries.length} action group(s):`);
  actionGroupSummaries.forEach(ag =>
    console.log(`    - ${ag.actionGroupName} (${ag.actionGroupState})`)
  );

  const hasUserInput = actionGroupSummaries.some(
    ag => ag.actionGroupName === 'UserInputAction'
  );

  if (hasUserInput) {
    console.log('  ✓ UserInputAction already exists — skipping create.');
  } else {
    console.log('\nCreating AMAZON.UserInput action group...');
    await client.send(new CreateAgentActionGroupCommand({
      agentId:                    AGENT_ID,
      agentVersion:               'DRAFT',
      actionGroupName:            'UserInputAction',
      parentActionGroupSignature: 'AMAZON.UserInput',
      actionGroupState:           'ENABLED',
    }));
    console.log('  ✓ Action group created.');

    // Verify it's there
    const { actionGroupSummaries: after = [] } = await client.send(
      new ListAgentActionGroupsCommand({ agentId: AGENT_ID, agentVersion: 'DRAFT' })
    );
    console.log(`  Action groups after create: ${after.length}`);
    after.forEach(ag => console.log(`    - ${ag.actionGroupName} (${ag.actionGroupState})`));
  }

  // ── 4. PrepareAgent ────────────────────────────────────────────────────────
  console.log('\nPreparing agent...');
  await client.send(new PrepareAgentCommand({ agentId: AGENT_ID }));
  await waitForStatus(client, AGENT_ID, ['PREPARED']);
  console.log('  ✓ Agent prepared.');

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done. Restart your server and test the interview.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function waitForStatus(
  client: BedrockAgentClient,
  agentId: string,
  targets: string[],
  maxAttempts = 30,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const { agent } = await client.send(new GetAgentCommand({ agentId }));
    const status = agent?.agentStatus ?? '';
    console.log(`  Status: ${status}`);
    if (targets.includes(status)) return;
    if (status === 'FAILED') throw new Error('Agent entered FAILED state');
  }
  throw new Error(`Agent did not reach ${targets.join('/')} within timeout`);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

main().catch(err => {
  console.error('\nFailed:', err.message ?? err);
  process.exit(1);
});
