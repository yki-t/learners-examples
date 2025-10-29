import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDBテーブルの作成
    const table = new dynamodb.Table(this, 'TodoTable', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda関数の作成
    const todoFunction = new lambda.Function(this, 'TodoFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/lambda')),
      environment: {
        TABLE_NAME: table.tableName
      },
      timeout: cdk.Duration.seconds(10)
    });

    // Lambda関数にDynamoDBテーブルへのアクセス権限を付与
    table.grantReadWriteData(todoFunction);

    // API Gatewayの作成
    const api = new apigateway.RestApi(this, 'TodoApi', {
      description: 'Todo API with Lambda and DynamoDB',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // Lambda統合の作成
    const todoIntegration = new apigateway.LambdaIntegration(todoFunction);

    // /todos エンドポイントの作成
    const todos = api.root.addResource('todos');
    todos.addMethod('ANY', todoIntegration); // すべてのHTTPメソッドを許可

    // /todos/{id} エンドポイントの作成
    const todoItem = todos.addResource('{id}');
    todoItem.addMethod('ANY', todoIntegration);


    // フロントエンド用S3バケットの作成
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // CloudFrontディストリビューションの作成
    const distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
       origin: new origins.S3Origin(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ]
    });

    // 出力
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Website URL'
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket Name for Website'
    });

    new cdk.CfnOutput(this, 'TodoTableName', {
      value: table.tableName,
      description: 'DynamoDB Table Name'
    });

    new cdk.CfnOutput(this, 'TodoFunctionName', {
      value: todoFunction.functionName,
      description: 'Lambda Function Name'
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway Endpoint'
    });
  }
}
