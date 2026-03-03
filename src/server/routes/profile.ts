/**
 * POST /api/publish-profile
 *
 * 1. Generates a self-contained HTML page from the identity document
 * 2. Uploads it to S3 under /<slug>/index.html
 * 3. Invalidates the CloudFront cache if updating an existing profile
 * 4. Saves/updates the slug record in DynamoDB
 *
 * Returns: { profileUrl, slug, isUpdate }
 */

import { Router, Request, Response } from 'express';
import { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { bedrock, s3, cloudfront, dynamo } from '../lib/aws';
import { NOVA_LITE_MODEL_ID } from '../lib/models';
import { PROFILE_HTML_PROMPT } from '../prompts/profile-html';
import { generateSlug } from '../lib/slug';

export const profileRouter = Router();

const S3_BUCKET          = process.env['EIGENSELF_S3_BUCKET'];
const CF_DOMAIN          = process.env['EIGENSELF_CF_DOMAIN'];
const CF_DISTRIBUTION_ID = process.env['EIGENSELF_CF_DISTRIBUTION_ID'];

profileRouter.post('/', async (req: Request, res: Response) => {
  const { identityDocument, userName, existingSlug }: {
    identityDocument: string;
    userName?: string;
    existingSlug?: string;
  } = req.body;

  if (!identityDocument) {
    res.status(400).json({ error: 'identityDocument required' });
    return;
  }

  try {
    const html = await generateProfileHtml(identityDocument);
    const { slug, isUpdate } = await resolveSlug(existingSlug, userName);

    await uploadToS3(slug, html);

    if (isUpdate && CF_DISTRIBUTION_ID) {
      await invalidateCloudFront(slug);
    }

    await saveToDynamo(slug, userName, isUpdate);

    const profileUrl = `https://${CF_DOMAIN}/${slug}/index.html`;
    console.log(`Profile ${isUpdate ? 'updated' : 'published'}: ${profileUrl}`);

    res.json({ profileUrl, slug, isUpdate });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Publish failed';
    console.error('Profile publish error:', message);
    res.status(500).json({ error: message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateProfileHtml(identityDocument: string): Promise<string> {
  const command = new ConverseCommand({
    modelId: NOVA_LITE_MODEL_ID,
    system: [{ text: PROFILE_HTML_PROMPT }],
    messages: [{
      role: 'user',
      content: [{ text: `Generate the HTML profile page for this person.\n\nIDENTITY DOCUMENT:\n\n${identityDocument}` }],
    }],
    inferenceConfig: { maxTokens: 8000, temperature: 0.3 },
  });

  const response = await bedrock.send(command);
  let html = response.output?.message?.content?.[0]?.text ?? '';

  // Strip any accidental markdown fences the model may add
  html = html.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();

  if (!html.startsWith('<!DOCTYPE') && !html.startsWith('<html')) {
    throw new Error('Model did not return valid HTML');
  }

  return html;
}

async function resolveSlug(
  existingSlug: string | undefined,
  userName: string | undefined
): Promise<{ slug: string; isUpdate: boolean }> {
  if (existingSlug) {
    const existing = await dynamo.send(new GetCommand({
      TableName: 'eigenself-profiles',
      Key: { slug: existingSlug },
    }));
    if (existing.Item) {
      return { slug: existingSlug, isUpdate: true };
    }
  }

  return { slug: generateSlug(userName ?? 'profile'), isUpdate: false };
}

async function uploadToS3(slug: string, html: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: `${slug}/index.html`,
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'max-age=3600',
  }));
}

async function invalidateCloudFront(slug: string): Promise<void> {
  await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: CF_DISTRIBUTION_ID,
    InvalidationBatch: {
      CallerReference: `${slug}-${Date.now()}`,
      Paths: { Quantity: 1, Items: [`/${slug}/index.html`] },
    },
  }));
}

async function saveToDynamo(slug: string, userName: string | undefined, isUpdate: boolean): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: 'eigenself-profiles',
    Item: {
      slug,
      userName: userName ?? 'Unknown',
      ...(isUpdate ? {} : { createdAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    },
  }));
}
