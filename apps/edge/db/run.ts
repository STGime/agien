import { Client } from "jsr:@db/postgres@0.19.5";

/**
 * Split a SQL script into individual statements, ignoring `;` inside single
 * quotes, dollar-quoted bodies ($$...$$ / $tag$...$tag$), `--` line comments,
 * and slash-star block comments.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDollar = false;
  let dollarTag = "";

  while (i < sql.length) {
    const ch = sql[i];

    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }

    if (inDollar) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        inDollar = false;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    const dollarMatch = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      inDollar = true;
      current += dollarTag;
      i += dollarTag.length;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements.filter((s) => s.length > 0);
}

/** Build a Client from a postgres:// connection string with snake_case keys. */
export function clientFromUrl(url: string): Client {
  const u = new URL(url);
  return new Client({
    hostname: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  });
}

/** Connect with retry so tests can run while the Postgres container warms up. */
export async function connectWithRetry(
  url: string,
  attempts = 30,
  delayMs = 1000,
): Promise<Client> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const client = clientFromUrl(url);
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastErr = e;
      try {
        await client.end();
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/** Apply every numbered `NNNN_*.sql` file in `dir`, in order. Returns filenames. */
export async function runMigrations(client: Client, dir: string | URL): Promise<string[]> {
  const base = dir instanceof URL ? dir : new URL(dir);
  const entries: string[] = [];
  for await (const entry of Deno.readDir(base)) {
    if (entry.isFile && entry.name.endsWith(".sql") && /^\d/.test(entry.name)) {
      entries.push(entry.name);
    }
  }
  entries.sort();

  const applied: string[] = [];
  for (const name of entries) {
    const sql = await Deno.readTextFile(new URL(name, base));
    for (const stmt of splitStatements(sql)) {
      await client.queryObject(stmt);
    }
    applied.push(name);
  }
  return applied;
}

/** Apply the seed file (idempotent via ON CONFLICT DO NOTHING). */
export async function runSeed(client: Client, seedPath: string | URL): Promise<void> {
  const sql = await Deno.readTextFile(seedPath);
  for (const stmt of splitStatements(sql)) {
    await client.queryObject(stmt);
  }
}
