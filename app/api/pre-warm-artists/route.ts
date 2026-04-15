import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalize, extractArtists, scoreResult } from "../../lib/artist-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 8;
const MAX_GIGS = 30;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Pre-warm the artist cache in the background.
 *
 * Issue 34: This endpoint is called by the client immediately after the gig
 * list loads. While the user scrolls and browses, we silently search YouTube
 * for any artists not already in the cache. By the time they tap "Build
 * Mixtape," most or all artists are already resolved.
 *
 * Uses YOUTUBE_API_KEY (not user OAuth) — no auth required from the user.
 * Fire-and-forget from the client's perspective.
 */
export async function POST(request: Request) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No API key" }, { status: 500 });
    }

    const { gigs } = await request.json();
    if (!gigs || !Array.isArray(gigs)) {
      return NextResponse.json({ warmed: 0 });
    }

    const ytApi = "https://www.googleapis.com/youtube/v3";

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ================================================================
    // STEP 1: Extract all artist names
    // ================================================================

    const seenNormalized = new Set<string>();
    const artists: { name: string; normalized: string }[] = [];

    for (let i = 0; i < Math.min(gigs.length, MAX_GIGS); i++) {
      const gig = gigs[i];

      // Skip gigs with manual video IDs — they don't need searching
      if (gig._curated_youtube_video_id) continue;

      const extracted = extractArtists(gig);
      for (const name of extracted) {
        const norm = normalize(name);
        if (norm && !seenNormalized.has(norm)) {
          seenNormalized.add(norm);
          artists.push({ name, normalized: norm });
        }
      }
    }

    if (artists.length === 0) {
      return NextResponse.json({ warmed: 0 });
    }

    // ================================================================
    // STEP 2: Check which artists are already cached
    // ================================================================

    const { data: cachedData } = await supabase
      .from("artist_cache")
      .select("artist_name_normalized, cached_at")
      .in(
        "artist_name_normalized",
        artists.map((a) => a.normalized)
      );

    const cachedSet = new Set<string>();
    for (const row of cachedData || []) {
      const age = Date.now() - new Date(row.cached_at).getTime();
      if (age < CACHE_MAX_AGE_MS) {
        cachedSet.add(row.artist_name_normalized);
      }
    }

    const needSearch = artists.filter((a) => !cachedSet.has(a.normalized));

    if (needSearch.length === 0) {
      return NextResponse.json({ warmed: 0, alreadyCached: artists.length });
    }

    // ================================================================
    // STEP 3: Search YouTube for uncached artists (parallel, batched)
    // ================================================================

    let warmed = 0;
    let quotaExhausted = false;

    const searchAndCache = async (artist: {
      name: string;
      normalized: string;
    }): Promise<boolean> => {
      if (quotaExhausted) return false;

      const searchUrl =
        `${ytApi}/search?part=snippet` +
        `&q=${encodeURIComponent(artist.name)}` +
        `&type=video&videoCategoryId=10&maxResults=5&regionCode=AU` +
        `&key=${apiKey}`;

      try {
        const res = await fetch(searchUrl, { cache: "no-store" });

        if (res.status === 403) {
          quotaExhausted = true;
          return false;
        }
        if (!res.ok) return false;

        const data = await res.json();
        if (!data.items?.length) return false;

        let bestResult: any = null;
        let bestScore = 0;

        for (const result of data.items) {
          const score = scoreResult(result, artist.normalized);
          if (score > bestScore) {
            bestScore = score;
            bestResult = result;
          }
        }

        if (!bestResult || bestScore === 0) return false;

        // Cache it
        await supabase.from("artist_cache").upsert(
          {
            artist_name_normalized: artist.normalized,
            video_id: bestResult.id.videoId,
            video_title: bestResult.snippet.title,
            channel_title: bestResult.snippet.channelTitle,
            cached_at: new Date().toISOString(),
          },
          { onConflict: "artist_name_normalized" }
        );

        return true;
      } catch {
        return false;
      }
    };

    // Process in batches
    for (let i = 0; i < needSearch.length; i += BATCH_SIZE) {
      if (quotaExhausted) break;
      const batch = needSearch.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(searchAndCache));
      warmed += results.filter(Boolean).length;
    }

    console.log(
      `[Otoki] Pre-warm: ${warmed} new artists cached, ${cachedSet.size} already cached, ${needSearch.length - warmed} missed`
    );

    return NextResponse.json({
      warmed,
      alreadyCached: cachedSet.size,
      missed: needSearch.length - warmed,
    });
  } catch (error) {
    console.error("[Otoki] Pre-warm error:", error);
    return NextResponse.json({ warmed: 0 });
  }
}
