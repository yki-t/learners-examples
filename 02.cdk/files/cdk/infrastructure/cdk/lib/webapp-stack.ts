import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export class WebappStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPCの取得（デフォルトVPCを使用）
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      isDefault: true
    });

    // セキュリティグループの作成
    const securityGroup = new ec2.SecurityGroup(this, 'WebappSecurityGroup', {
      vpc,
      description: 'Security group for webapp EC2 instance',
      allowAllOutbound: true
    });

    // HTTPアクセスを許可
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );

    // SSHアクセスを許可
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(), // 一旦全許可
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // S3バケットの作成（設定ファイル用）
    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // 設定ファイルをS3にアップロード
    new s3deploy.BucketDeployment(this, 'DeployConfigs', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../configs'))],
      destinationBucket: configBucket
    });

    // アプリケーションファイルをS3にアップロード
    new s3deploy.BucketDeployment(this, 'DeployApp', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../app'))],
      destinationBucket: configBucket,
      destinationKeyPrefix: 'app'
    });

    // User Dataスクリプトの作成 (EC2の初回起動時に実行されるスクリプト)
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      '# パッケージの更新とインストール',
      'dnf update -y',
      'dnf install -y nginx aws-cli',
      '',
      '# Node.jsのインストール',
      'curl -sL https://rpm.nodesource.com/setup_22.x | bash -',
      'dnf install -y nodejs',
      '',
      '# S3から設定ファイルをダウンロード',
      `aws s3 cp s3://${configBucket.bucketName}/nginx.conf /etc/nginx/conf.d/nodeapp.conf`,
      `aws s3 cp s3://${configBucket.bucketName}/nodeapp.service /etc/systemd/system/nodeapp.service`,
      `aws s3 cp s3://${configBucket.bucketName}/app/app.js /home/ec2-user/app.js`,
      'chown ec2-user:ec2-user /home/ec2-user/app.js',
      '',
      '# デフォルトのNginx設定を無効化',
      'sed -i "s/^\\s*server {/# server {/" /etc/nginx/nginx.conf',
      'sed -i "s/^\\s*listen/# listen/" /etc/nginx/nginx.conf',
      'sed -i "s/^\\s*server_name/# server_name/" /etc/nginx/nginx.conf',
      'sed -i "s/^\\s*root/# root/" /etc/nginx/nginx.conf',
      'sed -i "s/^\\s*}/# }/" /etc/nginx/nginx.conf',
      '',
      '# サービスの起動',
      'systemctl daemon-reload',
      'systemctl enable nodeapp',
      'systemctl start nodeapp',
      'systemctl enable nginx',
      'systemctl start nginx'
    );

    // EC2インスタンスの作成
    const instance = new ec2.Instance(this, 'WebappInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023
      }),
      securityGroup,
      userData,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });

    // S3バケットへのアクセス権限を付与
    configBucket.grantRead(instance);

    // 出力
    new cdk.CfnOutput(this, 'InstancePublicIP', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance'
    });

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `http://${instance.instancePublicIp}`,
      description: 'URL to access the web application'
    });
  }
}