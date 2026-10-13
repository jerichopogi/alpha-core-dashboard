import { isCorrectIngestToken } from "@/lib/auth";
import { normalizeReport } from "@/lib/normalize";
import { keepsCurrentSnapshot } from "@/lib/snapshot";
import { getStore } from "@/lib/store";
import { reportSchema } from "@/lib/types";

const MAX_BODY_BYTES = 512 * 1024;
// The EA reports every few minutes, plus one extra when something changes.
const MAX_REPORTS_PER_MINUTE = 6;

const reply = (status: number, error?: string) =>
  Response.json(error ? { success: false, error } : { success: true }, { status });

/** The EA posts its account state, recent deals and signal decisions here. */
export async function POST(request: Request): Promise<Response> {
  if (!isCorrectIngestToken(request.headers.get("x-ingest-token"))) return reply(401, "Unauthorized");

  const store = getStore();
  if ((await store.hit("ac:rate:ingest", 60)) > MAX_REPORTS_PER_MINUTE) return reply(429, "Too many reports");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply(413, "Report too large");
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return reply(413, "Report too large");

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply(400, "Body is not valid JSON");
  }

  const parsed = reportSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return reply(400, `Invalid report at ${issue.path.join(".") || "root"}: ${issue.message}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const { snapshot, deals, signals } = normalizeReport(parsed.data, now);
  const keepCurrent = keepsCurrentSnapshot(await store.loadSnapshot(), snapshot, now);
  await store.save(keepCurrent ? null : snapshot, deals, signals);
  return reply(200);
}
