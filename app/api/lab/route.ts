import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

// the three config files edited in /lab; a missing file reads as ""
const FILES = { channels: "channels.json", prompts: "prompts.json", profile: "profile.json" } as const;
type Key = keyof typeof FILES;
const at = (name: string) => path.join(process.cwd(), name);

export async function GET() {
  const out = {} as Record<Key, string>;
  for (const k of Object.keys(FILES) as Key[]) {
    out[k] = await readFile(at(FILES[k]), "utf8").catch(() => "");
  }
  return Response.json(out);
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Record<Key, string>>;
  // blank = not sent (a file that does not exist yet comes back as "" and must not fail the save)
  const keys = (Object.keys(FILES) as Key[]).filter((k) => (body[k] ?? "").trim() !== "");
  const parsed = {} as Record<Key, unknown>;
  for (const k of keys) {
    try {
      parsed[k] = JSON.parse(body[k]!);
    } catch (e) {
      // all or nothing: nothing is written if any file is invalid
      return Response.json({ error: `${FILES[k]}: ${(e as Error).message}` }, { status: 400 });
    }
  }
  for (const k of keys) {
    await writeFile(at(FILES[k]), JSON.stringify(parsed[k], null, 2) + "\n");
  }
  return Response.json({ ok: true });
}

// forces a full re-tag on the next /api/videos call
export async function DELETE() {
  await rm(at(".data/tags.json"), { force: true });
  return Response.json({ ok: true });
}
