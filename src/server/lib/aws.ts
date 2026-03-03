/**
 * AWS client singletons.
 *
 * All clients target us-east-1. Credentials are loaded automatically
 * from ~/.aws/credentials — never hardcode them here.
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { S3Client } from '@aws-sdk/client-s3';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';

export const bedrock = new BedrockRuntimeClient({ region: REGION });

export const s3 = new S3Client({ region: REGION });

export const cloudfront = new CloudFrontClient({ region: REGION });

export const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION })
);
