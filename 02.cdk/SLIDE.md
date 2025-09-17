---
marp: true
theme: loglass
paginate: true
---
 
# EC2サーバー構築時のトラブルシューティング

基本的な調査コマンド

---

## なぜトラブルシューティングが重要か

### サーバー構築時の典型的な問題
- Webサイトが表示されない
- アプリケーションが起動しない

### 効率的な問題解決のアプローチ
- **体系的な調査**：通信経路に沿って順番に確認
- **仮説検証**：問題の原因を仮説立てて検証
- **ログの活用**：エラーメッセージから原因を特定

---

## 作成するアプリケーション

- Webサーバー: Nginx
- アプリケーションサーバー: Node.js

---

## HTTPにおける通信の流れ

Node.js
↑
Nginx
↑
TCP接続
↑
DNS解決
↑
クライアント

すべての経路が正常に機能する必要がある

---
## 調査のアプローチ
- **クライアント側からのアプローチ**
  - DNS解決の確認（nslookup, dig）
  - TCP接続の確認（ping, telnet）

- **サーバー側からのアプローチ**
  - アプリケーション確認（ps, netstat, curl）
  - サービス確認（systemctl）
  - ファイアウォールの確認（iptables, ufw, AWSセキュリティグループ）

どちらも必要

---

## DNS解決の調査（クライアント側）

### digコマンド
```bash
dig example.com
```

ドメイン名をIPアドレスに解決する

※ 今回はAWS側で割り当てられるため使用しません

---

## TCP接続の調査（クライアント側）

### pingコマンドでの疎通確認
```bash
ping 54.123.45.67
```

ICMPパケットを送信し、応答を確認。

---

## サーバー側の調査 - 概要

### 以下の動作が確認できればよい

1. アプリケーション自体が正常に応答するか
1. Nginx経由でアプリケーションにアクセスできるか
1. 外部からNginx経由でアプリケーションにアクセスできるか

今回は次を仮定します。
- `node app.js` で 3000ポートでアプリケーションが起動する
- Nginxが80ポートでリッスンし、Node.jsアプリケーションにリバースプロキシする

---

## サーバー側の調査 - 1. アプリケーションの正常応答

- SSH接続した後、 app.js を作成する
- `node app.js` で 3000ポートでリッスンする
- **別のSSH接続上**で、`curl http://localhost:3000` で応答を確認

SSH接続(厳密には接続用ターミナル)が2つ必要

1つめのアプリケーションが起動すると、別のコマンド(curl)を実行できなくなるため

---

## サーバー側の調査 - curlコマンド

```bash
curl http://localhost:3000 # アプリケーションの応答を確認
curl -I http://localhost:3000 # ヘッダーのみ確認
curl -v http://localhost:3000 # 詳細な通信内容を表示
```

---

## サーバー側の調査 - daemon

### 通常プロセスの問題

- サーバーアプリケーションは通常プロセスをロックする
    例) `node app.js` (http://localhost:3000 とかで接続待機)

- SSH接続が切断されるとプロセスも消失する (プロセスは木構造. tree)

SSH接続を切断してもプロセスを存続させたい。 → **daemon**

---

## サーバー側の調査 - daemon

### 解決策

- `nohup` コマンド (no hang up) - 最も簡単
    例) `nohup node app.js &`
- `pm2` コマンド - 特定のアプリケーションであれば専用コマンドがある場合がある
    例) `pm2 start app.js`
- **system service (systemd)** - 設定が必要だが汎用的
    例) `sudo systemctl start myapp.service`

---

## サーバー側の調査 - system service

### systemd

systemdとはLinuxのサービス管理システムで、プロセスの起動や停止、監視を行う。

```bash
systemctl start myapp.service # myapp.serviceを起動
systemctl stop myapp.service  # myapp.serviceを停止
systemctl status myapp.service # myapp.serviceの状態を確認
```

多くのパッケージはsystemdのサービスファイルを提供している。
例) `systemctl status nginx`

---

## サーバー側の調査 - system service

サービスファイルの例 `/etc/systemd/system/myapp.service`
```service
[Unit]
Description=My Node.js App # サービスの説明

[Service]
Type=simple # サービスのタイプ
ExecStart=/usr/bin/node /path/to/app.js # アプリケーションの起動コマンド
Restart=always # サービスが終了した場合に再起動する

[Install]
WantedBy=multi-user.target
```

---

## サーバー側の調査 - 1. アプリケーションの正常応答 (再)

1. SSH接続した後、`app.js`を作成する
1. 起動用のサービスファイルを作成する `/etc/systemd/system/myapp.service`
1. サービスファイルを読み込む `systemctl daemon-reload`
1. サービスを開始する `systemctl start myapp.service`
1. サービスの状態を確認する `systemctl status myapp.service`
1. アプリケーションの応答を確認する `curl http://localhost:3000`
1. `app.js`を更新した場合
  サービスの再起動が必要`systemctl restart myapp.service`

これで3000ポートでアプリケーションが永続的に動作することを確認できた

---

## サーバー側の調査 - 2. Nginx経由でapp.jsにアクセスできるか

1. Nginxの状態を確認する `systemctl status nginx`
1. Nginx → app.js へのリバースプロキシを設定する (次ページ)
1. サービスをリロードする `systemctl reload nginx`
1. サービスの状態を確認する `systemctl status nginx`
1. アプリケーションの応答を確認する `curl http://localhost:80`
  80ポートで待ち構えるNginxが、
  リクエストを3000ポートのアプリケーションに転送する
  app.jsの応答が返ってくればOK

---

## サーバー側の調査 - 2. Nginx経由でapp.jsにアクセスできるか

```nginx
server { # だいたいこんな感じ(細かいとこは違うかも)
    listen 80; # Nginxがリッスンするポート
    server_name _; # サーバー名. _ はすべてのリクエストを受け付ける

    location / {
        proxy_pass http://localhost:3000; # Node.jsアプリケーションへのリバースプロキシ
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## サーバー側の調査 - 2. Nginx経由でapp.jsにアクセスできるか

### 起動の調査方法

1. Nginxの設定が正しいか確認する `nginx -t`
1. Nginx自体の状態を確認する `systemctl status nginx`
1. 詳しいログを確認する `journalctl -u nginx`

### リクエストの調査方法

1. アクセスログを確認する `cat /var/log/nginx/access.log`
1. エラーログ を確認する `cat /var/log/nginx/error.log`

---

## サーバー側の調査 - 3. 外部からアクセスできるか

- セキュリティグループの設定が正しいか。
    AWS コンソールにてEC2に対するセキュリティグループの設定を確認
- ファイアウォールの設定が正しいか。
    `iptables` や `ufw` の設定を確認 (AWSの場合は通常不要)

どちらも、「外部→インスタンス」(inbound) の80ポートが開いている必要がある

サーバー側の調査2まで完了していて、80ポートが開いてれば外部からアクセスできる

---

## まとめ

### 通信経路に沿った系統的な調査

1. **DNS解決** → dig, nslookup
2. **TCP接続** → ping, nc, telnet
3. **Nginx** → nginx -t
4. **サービス管理** → systemctl
5. **HTTP通信** → curl

### ポイント
- 経路を順に調査していく

---
marp: true
theme: loglass
paginate: true
---

# AWS CDKでEC2 Webサーバーを構築する

Infrastructure as Codeで前回の環境を再現

---

## 前回の構成をCDKで再現

### 前回手動で構築したもの
- EC2インスタンス
- Nginx (80番ポート)
- Node.jsアプリ (3000番ポート)
- systemdサービス設定

### 今回CDKで自動化
- モノレポ構成で管理
- 設定ファイルはS3から配布
- すべてのインフラをコード化

---

## モノレポプロジェクト構造

```
webapp-monorepo/
├── app/app.js                  # Node.jsアプリケーション
├── infrastructure/
│   ├── cdk/
│   │   ├── bin/
│   │   │   └── webapp.ts
│   │   ├── lib/
│   │   │   └── webapp-stack.ts   # CDKスタック定義
│   │   ├── package.json
│   │   └── cdk.json
│   ├── nginx.conf                # Nginx設定
│   └── app.service                # systemdサービス設定
└── scripts/
    └── deploy.sh                  # デプロイスクリプト
```

---

## CDKを使うメリット

### Infrastructure as Code
- **バージョン管理**: Gitで管理可能
- **再現性**: 同じ環境を何度でも構築
- **レビュー可能**: PRでインフラ変更をレビュー

### S3による設定管理
- 設定ファイルの集中管理
- バージョニング対応
- EC2からの安全なアクセス

---

## プロジェクトの初期化

```bash
# プロジェクトディレクトリの作成
mkdir webapp-monorepo && cd webapp-monorepo

# CDKプロジェクトの初期化
mkdir -p infrastructure/cdk
cd infrastructure/cdk
npx cdk init app --language typescript

# アプリケーションディレクトリの作成
cd ../..
mkdir app
```

---

## Node.jsアプリケーション

```javascript
// app/app.js
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from CDK</h1>')
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## Nginx設定ファイル

```nginx
# infrastructure/nginx.conf
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## systemdサービス設定

```ini
# infrastructure/app.service
[Unit]
Description=Node.js Web Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user
ExecStart=/usr/bin/node /home/ec2-user/app.js

[Install]
WantedBy=multi-user.target
```

---
```typescript
// S3バケットの作成とアップロード
// infrastructure/cdk/lib/webapp-stack.ts
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
// S3バケットの作成
const configBucket = new s3.Bucket(this, 'ConfigBucket', {
  bucketName: `webapp-config-${this.account}-${this.region}`,
  versioned: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true
});
// 設定ファイルのアップロード
new s3deploy.BucketDeployment(this, 'DeployConfig', {
  destinationBucket: configBucket,
  sources: [
    s3deploy.Source.asset('../../app'),
    s3deploy.Source.asset('../../infrastructure', { exclude: ['cdk/**'] })
  ],
});
```

---
```typescript
// VPCとネットワーク設定
import * as ec2 from 'aws-cdk-lib/aws-ec2';
// VPCの作成
const vpc = new ec2.Vpc(this, 'WebAppVpc', {
  maxAzs: 2,
  natGateways: 1,
  subnetConfiguration: [
    {
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC,
      cidrMask: 24
    },
    {
      name: 'Private',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      cidrMask: 24
    }
  ]
});
```

---

```typescript
// セキュリティグループの作成
const securityGroup = new ec2.SecurityGroup(this, 'WebAppSG', {
  vpc,
  description: 'Security group for web application',
  allowAllOutbound: true
});

// インバウンドルールの追加
securityGroup.addIngressRule(
  ec2.Peer.anyIpv4(), 
  ec2.Port.tcp(80), 
  'Allow HTTP traffic'
);

// 管理用SSH
securityGroup.addIngressRule(
  ec2.Peer.anyIpv4(), 
  ec2.Port.tcp(22), 
  'Allow SSH access'
);
```

---
```typescript
// IAMロールの作成
import * as iam from 'aws-cdk-lib/aws-iam';

// EC2用IAMロールの作成
const role = new iam.Role(this, 'EC2Role', {
  assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName(
      'CloudWatchAgentServerPolicy'
    )
  ]
});

// S3バケットへのアクセス権限を付与
configBucket.grantRead(role);
```

---

## EC2インスタンスの作成

```typescript
// EC2インスタンスの作成
const instance = new ec2.Instance(this, 'WebAppInstance', {
  vpc,
  vpcSubnets: {
    subnetType: ec2.SubnetType.PUBLIC,
  },
  instanceType: ec2.InstanceType.of(
    ec2.InstanceClass.T3, 
    ec2.InstanceSize.MICRO
  ),
  machineImage: new ec2.AmazonLinuxImage({
    generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023
  }),
  securityGroup,
  role,
  keyName: process.env.KEY_PAIR_NAME || 'webapp-key'
});

// タグの追加
Tags.of(instance).add('Name', 'WebApp-Server');
Tags.of(instance).add('Environment', 'Production');
```

---

```typescript
// UserData Script
instance.addUserData(
  '#!/bin/bash',
  'set -e',  // エラー時に停止
  // ログ設定
  'exec > >(tee /var/log/user-data.log)',
  'exec 2>&1',
  // システム更新
  'yum update -y',
  // 必要なパッケージのインストール
  'yum install -y aws-cli',
  'curl -sL https://rpm.nodesource.com/setup_18.x | bash -',
  'yum install -y nodejs nginx',
  // S3から設定ファイルをダウンロード
  `aws s3 cp s3://${configBucket.bucketName}/app.js /home/ec2-user/app.js`,
  `aws s3 cp s3://${configBucket.bucketName}/nginx.conf /etc/nginx/conf.d/app.conf`,
  `aws s3 cp s3://${configBucket.bucketName}/app.service /etc/systemd/system/nodeapp.service`
);
```

---

```typescript
instance.addUserData(
  // ファイルの権限設定
  'chown ec2-user:ec2-user /home/ec2-user/app.js',
  'chmod 644 /etc/nginx/conf.d/app.conf',
  'chmod 644 /etc/systemd/system/nodeapp.service',
  // サービスの起動
  'systemctl daemon-reload',
  'systemctl enable nodeapp',
  'systemctl start nodeapp',
  // Nginxの起動
  'systemctl enable nginx',
  'systemctl start nginx',
  // セットアップ完了の通知
  'echo "Setup completed at $(date)" >> /var/log/setup-complete.log'
);
```

---

```typescript
// スタックのアウトプット
new CfnOutput(this, 'InstancePublicIP', {
  value: instance.instancePublicIp,
  description: 'Public IP address of the EC2 instance',
  exportName: 'WebAppPublicIP'
});
new CfnOutput(this, 'InstanceId', {
  value: instance.instanceId,
  description: 'Instance ID'
});
new CfnOutput(this, 'ConfigBucketName', {
  value: configBucket.bucketName,
  description: 'S3 bucket containing configuration files'
});
new CfnOutput(this, 'WebAppURL', {
  value: `http://${instance.instancePublicIp}`,
  description: 'Web application URL'
});
```

---

## デプロイスクリプト

```bash
#!/bin/bash
# scripts/deploy.sh
set -e
echo "Building and deploying webapp infrastructure..."
cd infrastructure/cdk # CDKディレクトリに移動
npm install # 依存関係のインストール
npx cdk bootstrap # CDKブートストラップ
npx cdk deploy --require-approval never # スタックのデプロイ
echo "Deployment completed!"
echo "Check the CloudFormation console for outputs."
```

---

## デプロイの実行

```bash
# 権限を付与
chmod +x scripts/deploy.sh

# デプロイの実行
./scripts/deploy.sh

# または手動で実行
cd infrastructure/cdk
npx cdk synth   # 確認
npx cdk deploy  # デプロイ
```

デプロイ完了後、出力されたURLにアクセス

---

## CloudFormationコンソールでの確認

1. AWS CloudFormationコンソールを開く
2. スタック一覧から確認
3. **リソース**タブで作成されたリソース
   - VPC、サブネット
   - EC2インスタンス
   - S3バケット
   - IAMロール
4. **アウトプット**タブで接続情報を確認

---

## スタックの削除

```bash
# リソースの削除
cd infrastructure/cdk
npx cdk destroy

# 確認プロンプト
Are you sure you want to delete: WebappStack (y/n)? y
```

- S3バケットは `autoDeleteObjects: true` で自動削除

---

## ベストプラクティス

### 1. 環境変数の活用

環境の切り替えなど
```typescript
const config = {
  keyName: process.env.KEY_PAIR_NAME,
  environment: process.env.ENVIRONMENT || 'dev',
  region: process.env.AWS_REGION || 'ap-northeast-1'
};
```

---

## ベストプラクティス

### 2. Secrets Manager の利用
機密情報は Secrets Manager で管理すべき
```typescript
const secret = new secretsmanager.Secret(this, 'AppSecret');
secret.grantRead(role);
```

---

## ベストプラクティス

### 3. CloudWatch Logs の設定
ログを取る設定
```typescript
const logGroup = new logs.LogGroup(this, 'AppLogs', {
  retention: logs.RetentionDays.ONE_WEEK
});
```

---

## モニタリングの追加

```typescript
// CloudWatchアラームの設定
new cloudwatch.Alarm(this, 'CPUAlarm', {
  metric: instance.metricCPUUtilization(),
  threshold: 80,
  evaluationPeriods: 2,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
});

// SNS通知の設定
const topic = new sns.Topic(this, 'AlertTopic');
topic.addSubscription(
  new subscriptions.EmailSubscription('admin@example.com')
);
```

---

## おわり

デプロイされたアプリケーションにアクセスして動作確認を行ってください。


