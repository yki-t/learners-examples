
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda関数の作成
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/lambda')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    // HTTP API Gatewayの作成
    const httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: 'github-actions-demo-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.OPTIONS
        ],
        allowHeaders: ['Content-Type']
      }
    });

    // Lambda統合の作成
    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      apiFunction
    );

    // ルートの追加
    httpApi.addRoutes({
      path: '/hello',
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration
    });

    // 出力
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.url || '',
      description: 'HTTP API Gateway Endpoint'
    });

    new cdk.CfnOutput(this, 'FunctionName', {
      value: apiFunction.functionName,
      description: 'Lambda Function Name'
    });
  }
}
