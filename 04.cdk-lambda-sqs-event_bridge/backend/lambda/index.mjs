import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const scheduler = new SchedulerClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const QUEUE_URL = process.env.QUEUE_URL;
const QUEUE_ARN = process.env.QUEUE_ARN;
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN

// JSONレスポンスを返すためのユーティリティ
const json = (statusCode, body = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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

// パスの判定
const isTodosRoot = (path) => /^\/todos\/?$/.test(path);
const isTodosById = (path) => /^\/todos\/([^/]+)\/?$/.test(path);
const idFromPath = (path) => path.split("/").filter(Boolean).pop();

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.rawPath || event.path;

  console.log(`${method} ${path}`);

  // OPTIONSはCORS対応のために常に200を返す
  if (method === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    // ID指定での取得
    if (method === "GET" && isTodosById(path)) {
      const id = idFromPath(path);
      const res = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
      }));

      if (!res.Item) {
        return json(404, { message: "not found" });
     }

      return json(200, res.Item);
    }

    // 一覧取得
    if (method === "GET" && isTodosRoot(path)) {
      const limit = Math.min(
        Number(event.queryStringParameters?.limit) || 20,
        100
      );
      const cursor = event.queryStringParameters?.cursor;
      const ExclusiveStartKey = cursor
        ? JSON.parse(Buffer.from(cursor, "base64").toString("utf8"))
        : undefined;

      const res = await ddb.send(new ScanCommand({
        TableName: TABLE_NAME,
        Limit: limit,
        ExclusiveStartKey
      }));

      const nextCursor = res.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString("base64")
        : null;

      return json(200, {
        items: res.Items || [],
        nextCursor
      });
    }

    // 新規作成
    if (method === "POST" && isTodosRoot(path)) {
      const body = parseBody(event);
      if (!body) return json(400, { message: "invalid JSON" });

      const { title, dueDate = null } = body;
      if (!title || typeof title !== "string") {
        return json(400, { message: "title is required" });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const item = {
        id,
        title,
        completed: false,
        old: false,
        dueDate,
        createdAt: now,
        updatedAt: now
      };

      await ddb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item
      }));

      // EventBridge Schedulerで1分後にスケジュールを登録
      try {
        const scheduleTime = new Date(Date.now() + 60 * 1000); // 1分後
        const scheduleName = `old-flag-${id}`;

        await scheduler.send(new CreateScheduleCommand({
          Name: scheduleName,
          ScheduleExpression: `at(${scheduleTime.toISOString().slice(0, 19)})`,
          Target: {
            Arn: QUEUE_ARN,
            RoleArn: SCHEDULER_ROLE_ARN,
            Input: JSON.stringify({ taskId: id })
          },
          FlexibleTimeWindow: {
            Mode: 'OFF'
          }
        }));

        console.log(`Scheduled old flag for task ${id} at ${scheduleTime.toISOString()}`);
      } catch (scheduleErr) {
        console.error("Failed to create schedule:", scheduleErr);
        // スケジュール作成に失敗してもタスクは作成されているのでエラーにしない
      }

      return json(201, item);
    }

    // 更新
    if (method === "PUT" && isTodosById(path)) {
      const id = idFromPath(path);
      const body = parseBody(event);
      if (!body) return json(400, { message: "invalid JSON" });

      const allowed = {};
      if ("title" in body) allowed.title = body.title;
      if ("completed" in body) allowed.completed = body.completed;
      if ("dueDate" in body) allowed.dueDate = body.dueDate;

      const exprNames = {};
      const exprValues = { ":u": new Date().toISOString() };
      const sets = ["#u = :u"];

      for (const [k, v] of Object.entries(allowed)) {
        const nameKey = `#${k}`;
        const valueKey = `:${k}`;
        exprNames[nameKey] = k;
        exprValues[valueKey] = v;
        sets.push(`${nameKey} = ${valueKey}`);
      }

      if (sets.length === 1) {
        return json(400, { message: "no updatable fields" });
      }

      const res = await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: { "#u": "updatedAt", ...exprNames },
        ExpressionAttributeValues: exprValues,
        ReturnValues: "ALL_NEW"
      }));

      return json(200, res.Attributes);
    }

    // 削除
    if (method === "DELETE" && isTodosById(path)) {
      const id = idFromPath(path);

      await ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id },
        ConditionExpression: "attribute_exists(id)"
      }));

      return {
        statusCode: 204,
        headers: {
           "Access-Control-Allow-Origin": "*"
        }
      };
    }

    return json(404, { message: "route not found" });

  } catch (err) {
    console.error(err);
    const code = err.name === "ConditionalCheckFailedException" ? 404 : 500;
    return json(code, { message: err.message || "error" });
  }
};
