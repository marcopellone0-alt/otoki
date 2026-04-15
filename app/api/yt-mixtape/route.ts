import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { normalize, extractArtists, scoreResult } from "../../lib/artist-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for large builds

const SEARCH_BATCH_SIZE = 8; // Issue 27: stay under YouTube's per-second rate limit
const INSERT_BATCH_SIZE = 5; // Parallel playlist inserts
const MAX_GIGS = 30; // Issue: raised from 15
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Fully optimized YouTube Mixtape builder.
 *
 * Flow:
 * 1. Validate OAuth token (Issue 15)
 * 2. Extract + deduplicate all artists from gigs (Issues 13, 18)
 * 3. Batch cache lookup — one Supabase query (Issues 8, 26)
 * 4. Collect manual overrides + cached results (Issue 25)
 * 5. Search YouTube for uncached artists — parallel, batched, using API key (Issues 1, 2, 27, 33)
 * 6. Verify all video IDs via oEmbed — free, parallel (Issue 30)
 * 7. Deduplicate by video ID (Issue 28)
 * 8. Create playlist only if tracks found (Issue 11), with dynamic name (Issues 20, 24)
 * 9. Insert tracks with position parameter — parallel batched (Issue 29)
 * 10. Return stats (Issue 16)
 *
 * Searches use YOUTUBE_API_KEY (non-personalized, consistent caching).
 * Only playlist creation + item insertion use the user's OAuth token.
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("yt_access_token")?.value;
    if (!token)
      return NextResponse.json({ error: "No token" }, { status: 401 });

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("[Otoki] YOUTUBE_API_KEY missing");
      return NextResponse.json(
        { error: "Server config error" },
        { status: 500 }
      );
    }

    // Issue 15: Validate OAuth token before burning any quota
    const tokenCheck = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!tokenCheck.ok) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    // Issue 19: Client sends trimmed payload — { gigs, dateRange }
    const { gigs, dateRange } = await request.json();
    const ytApi = "https://www.googleapis.com/youtube/v3";

    // Supabase client for cache operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Sort gigs chronologically
    const sortedGigs = [...gigs].sort((a: any, b: any) => {
      const dateA = a.dates?.start?.localDate || "9999-12-31";
      const dateB = b.dates?.start?.localDate || "9999-12-31";
      return dateA.localeCompare(dateB);
    });

    // ==================================================================
    // STEP 1: Extract all artists + manual video IDs (Issues 13, 14, 18, 25)
    // ==================================================================

    type ArtistEntry = {
      name: string;
      normalized: string;
      manualVideoId?: string;
      gigIndex: number;
    };

    const artistEntries: ArtistEntry[] = [];
    const seenNormalized = new Set<string>();

    for (let i = 0; i < Math.min(sortedGigs.length, MAX_GIGS); i++) {
      const gig = sortedGigs[i];

      // Issue 25: Manual video ID from curated gigs — skip all searching
      if (gig._curated_youtube_video_id) {
        const artistName = gig._curated_artist_name || gig.name;
        const norm = normalize(artistName);
        if (!seenNormalized.has(norm)) {
          seenNormalized.add(norm);
          artistEntries.push({
            name: artistName,
            normalized: norm,
            manualVideoId: gig._curated_youtube_video_id,
            gigIndex: i,
          });
        }
        continue;
      }

      // Issue 18: extractArtists handles multi-bill parsing (+, w/, feat., etc.)
      const artists = extractArtists(gig);
      for (const artist of artists) {
        const norm = normalize(artist);
        if (norm && !seenNormalized.has(norm)) {
          seenNormalized.add(norm);
          artistEntries.push({ name: artist, normalized: norm, gigIndex: i });
        }
      }
    }

    console.log(
      `[Otoki] Extracted ${artistEntries.length} unique artists from ${Math.min(sortedGigs.length, MAX_GIGS)} gigs`
    );

    // ==================================================================
    // STEP 2: Batch cache lookup — one Supabase query (Issues 8, 26)
    // ==================================================================

    const uncachedNorms = artistEntries
      .filter((a) => !a.manualVideoId)
      .map((a) => a.normalized);

    const cacheMap = new Map<
      string,
      { video_id: string; video_title: string; channel_title: string }
    >();

    if (uncachedNorms.length > 0) {
      const { data: cachedData } = await supabase
        .from("artist_cache")
        .select("*")
        .in("artist_name_normalized", uncachedNorms);

      for (const row of cachedData || []) {
        const age = Date.now() - new Date(row.cached_at).getTime();
        if (age < CACHE_MAX_AGE_MS) {
          cacheMap.set(row.artist_name_normalized, {
            video_id: row.video_id,
            video_title: row.video_title || "",
            channel_title: row.channel_title || "",
          });
        }
      }
    }

    console.log(
      `[Otoki] Cache: ${cacheMap.size} hits, ${uncachedNorms.length - cacheMap.size} misses`
    );

    // ==================================================================
    // STEP 3: Categorize + collect known video IDs (Issues 8, 25)
    // ==================================================================

    type TrackResult = {
      artistName: string;
      videoId: string;
      videoTitle: string;
      gigIndex: number;
    };

    const tracks: TrackResult[] = [];
    const missed: string[] = [];

    // Manual overrides — instant, no search needed
    for (const entry of artistEntries) {
      if (entry.manualVideoId) {
        tracks.push({
          artistName: entry.name,
          videoId: entry.manualVideoId,
          videoTitle: "Manual override",
          gigIndex: entry.gigIndex,
        });
      }
    }

    // Cached results — instant, no search needed
    for (const entry of artistEntries) {
      if (!entry.manualVideoId && cacheMap.has(entry.normalized)) {
        const cached = cacheMap.get(entry.normalized)!;
        tracks.push({
          artistName: entry.name,
          videoId: cached.video_id,
          videoTitle: cached.video_title,
          gigIndex: entry.gigIndex,
        });
      }
    }

    // ==================================================================
    // STEP 4: Search YouTube for uncached artists (Issues 1, 2, 22, 23, 27, 33)
    // ==================================================================

    const needSearch = artistEntries.filter(
      (a) => !a.manualVideoId && !cacheMap.has(a.normalized)
    );

    let searchCount = 0;
    let quotaExhausted = false;

    // Issue 2: Single search per artist (not two). maxResults=5 (Issue 23).
    // Issue 33: Uses API key, not user's OAuth token.
    // Issue 12: regionCode=AU for playable results.
    const searchArtist = async (
      entry: ArtistEntry
    ): Promise<TrackResult | null> => {
      if (quotaExhausted) return null;

      const searchUrl =
        `${ytApi}/search?part=snippet` +
        `&q=${encodeURIComponent(entry.name)}` +
        `&type=video&videoCategoryId=10&maxResults=5&regionCode=AU` +
        `&key=${apiKey}`;

      // Issue 22: Retry on network errors, NOT on quota errors
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(searchUrl, { cache: "no-store" });

          if (res.status === 403) {
            console.error(
              `[Otoki] 403 for "${entry.name}" — quota likely exhausted`
            );
            quotaExhausted = true;
            return null;
          }

          if (!res.ok) {
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            return null;
          }

          const data = await res.json();
          searchCount++;

          if (!data.items?.length) return null;

          // Issue 3: Three-tier scoring
          let bestResult: any = null;
          let bestScore = 0;

          for (const result of data.items) {
            const score = scoreResult(result, entry.normalized);
            if (score > bestScore) {
              bestScore = score;
              bestResult = result;
            }
          }

          if (!bestResult || bestScore === 0) return null;

          const videoId = bestResult.id.videoId;
          const videoTitle = bestResult.snippet.title;
          const channelTitle = bestResult.snippet.channelTitle;

          // Issue 8: Cache the result for future builds
          await supabase.from("artist_cache").upsert(
            {
              artist_name_normalized: entry.normalized,
              video_id: videoId,
              video_title: videoTitle,
              channel_title: channelTitle,
              cached_at: new Date().toISOString(),
            },
            { onConflict: "artist_name_normalized" }
          );

          console.log(
            `[Otoki] Found: "${videoTitle}" (score: ${bestScore}) for "${entry.name}"`
          );

          return {
            artistName: entry.name,
            videoId,
            videoTitle,
            gigIndex: entry.gigIndex,
          };
        } catch (err) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          console.error(`[Otoki] Network error for "${entry.name}":`, err);
          return null;
        }
      }
      return null;
    };

    // Issue 27: Process in batches of 8 to stay under per-second rate limits
    for (let i = 0; i < needSearch.length; i += SEARCH_BATCH_SIZE) {
      if (quotaExhausted) break;
      const batch = needSearch.slice(i, i + SEARCH_BATCH_SIZE);
      const results = await Promise.all(batch.map(searchArtist));
      for (let j = 0; j < results.length; j++) {
        if (results[j]) {
          tracks.push(results[j]!);
        } else {
          missed.push(batch[j].name);
        }
      }
    }

    // ==================================================================
    // STEP 5: Verify all video IDs via oEmbed — free, parallel (Issue 30)
    // ==================================================================

    const verifyVideo = async (videoId: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        return res.ok;
      } catch {
        return false;
      }
    };

    const validityChecks = await Promise.all(
      tracks.map((t) => verifyVideo(t.videoId))
    );

    const validTracks: TrackResult[] = [];
    const deadTracks: TrackResult[] = [];

    for (let i = 0; i < tracks.length; i++) {
      if (validityChecks[i]) {
        validTracks.push(tracks[i]);
      } else {
        deadTracks.push(tracks[i]);
        missed.push(tracks[i].artistName);
      }
    }

    // Clean dead entries from cache so they don't pollute future builds
    if (deadTracks.length > 0) {
      const deadVideoIds = deadTracks.map((t) => t.videoId);
      await supabase
        .from("artist_cache")
        .delete()
        .in("video_id", deadVideoIds);
      console.log(
        `[Otoki] Purged ${deadTracks.length} dead videos from cache`
      );
    }

    // ==================================================================
    // STEP 6: Deduplicate by video ID (Issue 28)
    // ==================================================================

    const seenVideoIds = new Set<string>();
    const dedupedTracks: TrackResult[] = [];

    // Issue 29: Sort by gigIndex first so dedup keeps the chronologically-first occurrence
    validTracks.sort((a, b) => a.gigIndex - b.gigIndex);

    for (const track of validTracks) {
      if (!seenVideoIds.has(track.videoId)) {
        seenVideoIds.add(track.videoId);
        dedupedTracks.push(track);
      }
    }

    // ==================================================================
    // STEP 7: Create playlist ONLY if we have tracks (Issue 11)
    // ==================================================================

    if (dedupedTracks.length === 0) {
      console.log(
        `[Otoki] No tracks found. ${searchCount} searches, ${missed.length} missed.`
      );
      return NextResponse.json({
        url: null,
        tracksAdded: 0,
        totalArtists: artistEntries.length,
        missed,
      });
    }

    // Issue 24: Dynamic playlist title + description
    const dateLabel = dateRange
      ? `${new Date(dateRange.from + "T00:00:00").toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
        })} – ${new Date(dateRange.to + "T00:00:00").toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`
      : "This Week";

    // Collect unique venue names for description
    const venues = [
      ...new Set(
        sortedGigs
          .slice(0, MAX_GIGS)
          .map((g: any) => g._embedded?.venues?.[0]?.name)
          .filter(Boolean)
      ),
    ];
    const venueStr =
      venues.length <= 3
        ? venues.join(", ")
        : `${venues.slice(0, 3).join(", ")} + ${venues.length - 3} more`;

    // Issue 20: Named with date range instead of generic title
    const playlistRes = await fetch(`${ytApi}/playlists?part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title: `Otoki Mixtape · ${dateLabel}`,
          description: `Gigs in Naarm · ${dateLabel} · ${venueStr} · Mixed by Otoki`,
        },
        status: { privacyStatus: "unlisted" },
      }),
    });

    const playlistData = await playlistRes.json();
    if (!playlistRes.ok) {
      console.error("[Otoki] Playlist creation failed:", playlistData);
      return NextResponse.json(
        { error: "Playlist creation failed" },
        { status: 500 }
      );
    }

    const playlistId = playlistData.id;
    console.log(`[Otoki] Created playlist: ${playlistId} — "${dateLabel}"`);

    // ==================================================================
    // STEP 8: Insert tracks with position — parallel batched (Issue 29)
    // ==================================================================

    let addedCount = 0;

    for (let i = 0; i < dedupedTracks.length; i += INSERT_BATCH_SIZE) {
      const batch = dedupedTracks.slice(i, i + INSERT_BATCH_SIZE);
      const insertResults = await Promise.all(
        batch.map((track, batchIdx) =>
          fetch(`${ytApi}/playlistItems?part=snippet`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              snippet: {
                playlistId,
                position: i + batchIdx, // Issue 29: maintain chronological order
                resourceId: {
                  kind: "youtube#video",
                  videoId: track.videoId,
                },
              },
            }),
          })
        )
      );

      for (const res of insertResults) {
        if (res.ok) {
          addedCount++;
        } else {
          try {
            const err = await res.json();
            console.error(`[Otoki] Insert failed:`, err);
          } catch {}
        }
      }
    }

    // Issue 32: Quota logging
    const quotaEstimate =
      searchCount * 100 + (dedupedTracks.length + 1) * 50;
    console.log(
      `[Otoki] ✅ Mixtape complete. ${addedCount}/${dedupedTracks.length} tracks. ` +
        `${searchCount} searches (${cacheMap.size} cache hits). ` +
        `~${quotaEstimate} quota units.`
    );

    // Issue 16: Return stats alongside URL
    return NextResponse.json({
      url: `https://music.youtube.com/playlist?list=${playlistId}`,
      tracksAdded: addedCount,
      totalArtists: artistEntries.length,
      missed,
    });
  } catch (error) {
    console.error("[Otoki] Fatal Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
