import snowflake from "snowflake-sdk";
import * as fs from "fs";
import * as path from "path";

let connectionPool: snowflake.Connection | null = null;
let connectingPromise: Promise<snowflake.Connection> | null = null;

function getPrivateKey(): string {
  if (process.env.SNOWFLAKE_PRIVATE_KEY) {
    return process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, "\n");
  }
  const keyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH ||
    path.join(process.cwd(), ".keys", "demo_portal_svc_key.p8");
  const rawKey = fs.readFileSync(keyPath, "utf-8");
  return rawKey;
}

function getConnection(): Promise<snowflake.Connection> {
  if (connectionPool && connectionPool.isUp()) {
    return Promise.resolve(connectionPool);
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = new Promise<snowflake.Connection>((resolve, reject) => {
    connectionPool = null;
    const privateKey = getPrivateKey();

    const conn = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT || "",
      username: process.env.SNOWFLAKE_USER || "ADMIN",
      authenticator: "SNOWFLAKE_JWT",
      privateKey: privateKey,
      role: process.env.SNOWFLAKE_ROLE || "ACCOUNTADMIN",
      database: "DEMO_PORTAL",
      schema: "PUBLIC",
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || "DEFAULT_WH",
    });

    conn.connect((err) => {
      connectingPromise = null;
      if (err) {
        console.error("Snowflake connection error:", err.message);
        reject(err);
      } else {
        connectionPool = conn;
        resolve(conn);
      }
    });
  });

  return connectingPromise;
}

export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  binds: (string | number | null)[] = []
): Promise<T[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const conn = await getConnection();
      const rows = await new Promise<T[]>((resolve, reject) => {
        conn.execute({
          sqlText: sql,
          binds: binds as snowflake.Binds,
          complete: (err, _stmt, rows) => {
            if (err) {
              console.error("Query error:", err.message, "SQL:", sql.substring(0, 200));
              reject(err);
            } else {
              resolve((rows || []) as T[]);
            }
          },
        });
      });
      return rows;
    } catch (err: unknown) {
      connectionPool = null;
      connectingPromise = null;
      if (attempt === 0) {
        console.error("Query failed, retrying with fresh connection...");
        continue;
      }
      throw err;
    }
  }
  throw new Error("executeQuery: unreachable");
}

export async function generatePresignedUrl(stagePath: string, stageName: string): Promise<string> {
  const rows = await executeQuery<{ PRESIGNED_URL: string }>(
    `SELECT GET_PRESIGNED_URL(@${stageName}, '${stagePath.replace(/'/g, "''")}') AS PRESIGNED_URL`
  );
  return rows[0]?.PRESIGNED_URL || "";
}

export async function uploadToStage(
  stageName: string,
  filePath: string,
  destDir: string
): Promise<void> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: `PUT file://${filePath} @${stageName}/${destDir}/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE`,
      complete: (err) => {
        if (err) reject(err);
        else resolve();
      },
    });
  });
}
