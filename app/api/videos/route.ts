import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { loadConfig, tagVideos } from "@/lib/jev";
import { recentUploads } from "@/lib/youtube";
import type { Slim } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accessToken = (await getToken({ req }))?.accessToken as string | undefined;
  if (!accessToken) return Response.json({ error: "login" }, { status: 401 });
  try {
    const cfg = await loadConfig();
    const videos = await recentUploads(accessToken, cfg.profile.days);
    const tagged = await tagVideos(videos, cfg);
    // channel numbers are fixed by the lineup order; empty channels are hidden
    const channels = cfg.channels
      .map(({ name, group }, i) => ({
        num: 101 + i,
        name,
        group,
        videos: videos
          .filter((v) => tagged[v.id].channel === name)
          .map(({ description, tags, ...v }): Slim => ({ ...v, ...tagged[v.id] })),
      }))
      .filter((c) => c.videos.length);
    return Response.json({ channels, profile: cfg.profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // an expired Google token -> log in again
    return Response.json({ error: msg }, { status: msg.startsWith("YouTube 401") ? 401 : 502 });
  }
}
