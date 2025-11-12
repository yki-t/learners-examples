import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// JSONレスポンスを返すためのユーティリティ
const json = (statusCode, body = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  },
  body: JSON.stringify(body)
});

// リクエストボディをパースするユーティリティ
const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.rawPath || event.path;

  console.log(`${method} ${path}`);
  console.log("Event:", JSON.stringify(event, null, 2));

  // OPTIONSはCORS対応のために常に200を返す
  if (method === "OPTIONS") {
    return json(200, { ok: true });
  }

  // Cognito AuthorizerからユーザーIDを取得
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub ||
                 event.requestContext?.authorizer?.claims?.sub;

  if (!userId) {
    return json(401, { message: "Unauthorized" });
  }

  try {
    // ユーザープロフィール取得
    if (method === "GET" && path === "/profile") {
      const res = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId }
      }));

      // プロフィールが存在しない場合は初期データを返す
      if (!res.Item) {
        return json(200, {
          userId,
          profile: null,
          message: "Profile not found. Please create one."
        });
      }

      return json(200, res.Item);
    }

    // ユーザープロフィール作成・更新
    if (method === "POST" && path === "/profile") {
      const body = parseBody(event);
      if (!body) return json(400, { message: "invalid JSON" });

      const { displayName, bio } = body;

      // 既存のプロフィールを取得してcreatedAtを保持
      const existing = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId }
      }));

      const now = new Date().toISOString();
      const item = {
        userId,
        displayName: displayName || "",
        bio: bio || "",
        createdAt: existing.Item?.createdAt || now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));

      return json(200, item);
    }

    // 認証されたユーザー情報を返す（テスト用）
    if (method === "GET" && path === "/me") {
      const claims = event.requestContext?.authorizer?.jwt?.claims ||
                     event.requestContext?.authorizer?.claims;

      return json(200, {
        userId,
        email: claims.email,
        emailVerified: claims.email_verified,
        message: "You are authenticated!"
      });
    }

    return json(404, { message: "route not found" });

  } catch (err) {
    console.error(err);
    return json(500, { message: err.message || "error" });
  }
};
