import { pool } from "./pool.ts";
import type { Video } from "./types.ts";

const API = "https://www.googleapis.com/youtube/v3";

async function yt(path: string, params: Record<string, string>, token: string) {
  const r = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`YouTube ${r.status}: ${await r.text()}`);
  return r.json();
}

// ISO 8601 duration (PT1H2M3S) -> seconds. Live/premiere ("P0D") -> 0.
export function secs(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

// Everything the user's subscriptions uploaded in the last `days` days (profile.days), newest first.
// Quota ~1 unit per call: 1 per 50 subs, 1 per channel, 1 per 50 videos (10k/day budget).
// ponytail: max 200 subscriptions, max 30 uploads/channel in the window, videos <= 60 s (Shorts) dropped
export async function recentUploads(token: string, days = 14, perChannel = 30): Promise<Video[]> {
  const cutoff = Date.now() - days * 864e5;

  const channelIds: string[] = [];
  let pageToken = "";
  do {
    const d = await yt("subscriptions", { part: "snippet", mine: "true", maxResults: "50", ...(pageToken && { pageToken }) }, token);
    channelIds.push(...d.items.map((s: any) => s.snippet.resourceId.channelId));
    pageToken = d.nextPageToken ?? "";
  } while (pageToken && channelIds.length < 200);

  // a channel's uploads playlist id is its channel id with "UC" -> "UU"
  const ids = (
    await pool(channelIds, 10, async (id) => {
      try {
        const d = await yt("playlistItems", { part: "contentDetails", playlistId: "UU" + id.slice(2), maxResults: String(perChannel) }, token);
        return d.items.filter((i: any) => Date.parse(i.contentDetails.videoPublishedAt) >= cutoff).map((i: any) => i.contentDetails.videoId as string);
      } catch {
        return []; // channel without uploads playlist
      }
    })
  ).flat();

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const videos = (
    await pool(batches, 4, async (b) => {
      const d = await yt("videos", { part: "snippet,contentDetails,statistics", id: b.join(",") }, token);
      return d.items.map((v: any): Video => ({
        id: v.id,
        title: v.snippet.title,
        author: v.snippet.channelTitle,
        description: v.snippet.description,
        tags: v.snippet.tags ?? [],
        categoryId: v.snippet.categoryId,
        duration: secs(v.contentDetails.duration),
        views: Number(v.statistics?.viewCount ?? 0),
        thumb: v.snippet.thumbnails?.medium?.url,
        publishedAt: v.snippet.publishedAt,
      }));
    })
  ).flat();

  return videos.filter((v) => v.duration > 60).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
