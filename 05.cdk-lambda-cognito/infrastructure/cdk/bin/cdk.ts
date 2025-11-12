#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';

const app = new cdk.App();
new CdkStack(app, 'CognitoAuthStack', {
  stackName: 'CognitoAuthStackTsujii', // 衝突しない名前を設定してください
});
