import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import pg from "pg";

const { Pool } = pg;
const secretsManager = new SecretsManagerClient({});

let pool = null;

// Secrets Managerからデータベース接続情報を取得
async function getDbCredentials() {
  const secretArn = process.env.DB_SECRET_ARN;

  try {
    const response = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretArn })
    );
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error("Error fetching secret:", error);
    throw error;
  }
}

// データベース接続プールの初期化
async function getPool() {
  if (pool) {
    return pool;
  }

  const credentials = await getDbCredentials();

  pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.dbname,
    user: credentials.username,
    password: credentials.password,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  // データベーステーブルの初期化
  await initializeDatabase(pool);

  return pool;
}

// テーブルの作成（初回のみ）
async function initializeDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        due_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  } finally {
    client.release();
  }
}

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

// Lambda関数のエントリポイント
export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.requestContext?.http?.path || event.rawPath || event.path;

  console.log(`${method} ${path}`);

  // OPTIONSはCORS対応のために常に200を返す
  if (method === "OPTIONS") {
    return json(200, { ok: true });
  }

  const dbPool = await getPool();

  try {
    // 一覧取得
    if (method === "GET" && isTodosRoot(path)) {
      const limit = Math.min(
        Number(event.queryStringParameters?.limit) || 20,
        100
      );
      const offset = Number(event.queryStringParameters?.offset) || 0;

      const result = await dbPool.query(
        'SELECT * FROM todos ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      const countResult = await dbPool.query('SELECT COUNT(*) FROM todos');
      const total = parseInt(countResult.rows[0].count);

      return json(200, {
        items: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          completed: row.completed,
          dueDate: row.due_date,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        total,
        limit,
        offset
      });
    }

    // ID指定での取得
    if (method === "GET" && isTodosById(path)) {
      const id = idFromPath(path);
      const result = await dbPool.query(
        'SELECT * FROM todos WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return json(404, { message: "not found" });
      }

      const row = result.rows[0];
      return json(200, {
        id: row.id,
        title: row.title,
        completed: row.completed,
        dueDate: row.due_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
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

      const result = await dbPool.query(
        `INSERT INTO todos (title, completed, due_date, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING *`,
        [title, false, dueDate]
      );

      const row = result.rows[0];
      return json(201, {
        id: row.id,
        title: row.title,
        completed: row.completed,
        dueDate: row.due_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }

    // 更新
    if (method === "PUT" && isTodosById(path)) {
      const id = idFromPath(path);
      const body = parseBody(event);
      if (!body) return json(400, { message: "invalid JSON" });

      // 既存のレコードを確認
      const checkResult = await dbPool.query(
        'SELECT * FROM todos WHERE id = $1',
        [id]
      );

      if (checkResult.rows.length === 0) {
        return json(404, { message: "not found" });
      }

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if ("title" in body) {
        updates.push(`title = $${paramIndex++}`);
        values.push(body.title);
      }
      if ("completed" in body) {
        updates.push(`completed = $${paramIndex++}`);
        values.push(body.completed);
      }
      if ("dueDate" in body) {
        updates.push(`due_date = $${paramIndex++}`);
        values.push(body.dueDate);
      }

      if (updates.length === 0) {
        return json(400, { message: "no updatable fields" });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await dbPool.query(
        `UPDATE todos SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const row = result.rows[0];
      return json(200, {
        id: row.id,
        title: row.title,
        completed: row.completed,
        dueDate: row.due_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }

    // 削除
    if (method === "DELETE" && isTodosById(path)) {
      const id = idFromPath(path);

      const result = await dbPool.query(
        'DELETE FROM todos WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return json(404, { message: "not found" });
      }

      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      };
    }

    return json(404, { message: "route not found" });

  } catch (err) {
    console.error("Database error:", err);
    return json(500, { message: err.message || "error" });
  }
};
