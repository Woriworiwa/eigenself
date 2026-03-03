/**
 * create-agent-role.ts
 *
 * Creates the IAM role that Bedrock needs to run the agent.
 * This is a one-time setup. Run it before create-agent.ts.
 *
 * Run from project root:
 *   npx tsx scripts/create-agent-role.ts
 *
 * It will print the role ARN. Export it, then run create-agent.ts.
 */

import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';

const ROLE_NAME = 'eigenself-bedrock-agent-role';

const TRUST_POLICY = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { Service: 'bedrock.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  ],
};

async function main() {
  const iam = new IAMClient({ region: 'us-east-1' });

  // Check if role already exists
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    const arn = existing.Role?.Arn ?? '';
    console.log(`Role already exists: ${arn}`);
    console.log(`\nexport BEDROCK_AGENT_ROLE_ARN=${arn}`);
    return;
  } catch {
    // Role doesn't exist — create it
  }

  console.log(`Creating IAM role: ${ROLE_NAME}`);

  const createResponse = await iam.send(new CreateRoleCommand({
    RoleName: ROLE_NAME,
    AssumeRolePolicyDocument: JSON.stringify(TRUST_POLICY),
    Description: 'Allows Amazon Bedrock to invoke Nova models on behalf of the Eigenself agent',
  }));

  const roleArn = createResponse.Role?.Arn;
  if (!roleArn) throw new Error('Role creation failed — no ARN returned');
  console.log(`Role created: ${roleArn}`);

  // Attach the AWS managed Bedrock policy
  console.log('Attaching AmazonBedrockFullAccess policy...');
  await iam.send(new AttachRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyArn: 'arn:aws:iam::aws:policy/AmazonBedrockFullAccess',
  }));

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ IAM role ready.

Export this before running create-agent.ts:

export BEDROCK_AGENT_ROLE_ARN=${roleArn}
npx tsx scripts/create-agent.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
