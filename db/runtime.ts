let schemaReady: Promise<D1Database> | null = null;

export async function getRuntimeDb() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error("D1 binding DB is unavailable");
  }
  return env.DB;
}

export function ensureRuntimeSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getRuntimeDb();
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS expert_reviews (
        case_id TEXT PRIMARY KEY NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT '교통전문가',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS designer_responses (
        case_id TEXT PRIMARY KEY NOT NULL,
        response TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        attachments TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT '재제출',
        actor TEXT NOT NULL DEFAULT '한빛건축 설계팀',
        submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS reflection_checks (
        case_id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL DEFAULT '확인대기',
        note TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL DEFAULT 'LH 담당자',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS timeline_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        case_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT 'done',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS workflow_cases (
        case_id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL DEFAULT 'EXPERT_REVIEW_REQUESTED',
        review_package TEXT NOT NULL DEFAULT '{}',
        designer_confirmed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS timeline_case_idx ON timeline_events (case_id, created_at)",
      ),
    ]);
    return db;
  })();

  return schemaReady;
}
