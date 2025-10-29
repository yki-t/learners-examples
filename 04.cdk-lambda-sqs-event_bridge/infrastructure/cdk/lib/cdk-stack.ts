import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // SQSキューの作成
    const oldFlagQueue = new sqs.Queue(this, 'OldFlagQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(1),
    });

    // EventBridge Scheduler用のIAMロールを作成
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      description: 'Role for EventBridge Scheduler to send messages to SQS'
    });

    // SQSキューへのメッセージ送信権限を付与
    oldFlagQueue.grantSendMessages(schedulerRole);

    // CRUD Lambda関数にEventBridge Schedulerの操作権限を付与
    todoFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'scheduler:CreateSchedule',
        'scheduler:DeleteSchedule'
      ],
      resources: ['*']
    }));

    // CRUD Lambda関数にSchedulerロールのPassRole権限を付与
    todoFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn]
    }));

    // CRUD Lambda関数の環境変数にSQS Queue URLとScheduler Role ARNを追加
    todoFunction.addEnvironment('QUEUE_URL', oldFlagQueue.queueUrl);
    todoFunction.addEnvironment('QUEUE_ARN', oldFlagQueue.queueArn);
    todoFunction.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);

    // Old Flag付与Lambda関数の作成
    const oldFlagFunction = new lambda.Function(this, 'OldFlagFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'old-flag.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../backend/lambda')),
      environment: {
        TABLE_NAME: table.tableName
      },
      timeout: cdk.Duration.seconds(10)
    });

    // Old Flag Lambda関数にDynamoDBテーブルへのアクセス権限を付与
    table.grantReadWriteData(oldFlagFunction);

    // SQSキューをOld Flag Lambda関数のイベントソースに設定
    oldFlagFunction.addEventSource(new lambdaEventSources.SqsEventSource(oldFlagQueue, {
      batchSize: 1
    }));

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
    new cdk.CfnOutput(this, 'OldFlagQueueUrl', {
      value: oldFlagQueue.queueUrl,
      description: 'SQS Queue URL for Old Flag Processing'
    });

    new cdk.CfnOutput(this, 'OldFlagQueueArn', {
      value: oldFlagQueue.queueArn,
      description: 'SQS Queue ARN for Old Flag Processing'
    });

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
