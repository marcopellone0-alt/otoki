import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { normalize, extractArtists, scoreResult } from "../../lib/artist-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEARCH_BATCH_SIZE = 8;
const MAX_GIGS = 30;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

    // Validate OAuth token before burning any quota
    const tokenCheck = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!tokenCheck.ok) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const { gigs, dateRange } = await request.json();
    const ytApi = "https://www.googleapis.com/youtube/v3";

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
    // STEP 1: Extract all artists + manual video IDs
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

      // Manual video ID from curated gigs — skip all searching
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
    // STEP 2: Batch cache lookup — one Supabase query
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
        // Only use fresh cache entries with valid-looking video IDs
        if (age < CACHE_MAX_AGE_MS && row.video_id && row.video_id.length === 11) {
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
    // STEP 3: Collect video IDs from manual overrides + cache
    // ==================================================================

    type TrackResult = {
      artistName: string;
      videoId: string;
      videoTitle: string;
      gigIndex: number;
    };

    const tracks: TrackResult[] = [];
    const missed: string[] = [];

    // Manual overrides
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

    // Cached results
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
    // STEP 4: Search YouTube for uncached artists (parallel, batched)
    // ==================================================================

    const needSearch = artistEntries.filter(
      (a) => !a.manualVideoId && !cacheMap.has(a.normalized)
    );

    let searchCount = 0;
    let quotaExhausted = false;

    const searchArtist = async (
      entry: ArtistEntry
    ): Promise<TrackResult | null> => {
      if (quotaExhausted) return null;

      const searchUrl =
        `${ytApi}/search?part=snippet` +
        `&q=${encodeURIComponent(entry.name)}` +
        `&type=video&videoCategoryId=10&maxResults=5&regionCode=AU` +
        `&key=${apiKey}`;

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

          let bestResult: any = null;
          let bestScore = 0;

          for (const result of data.items) {
            // Guard: only consider results that have a videoId
            if (!result.id?.videoId) continue;

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

          // Cache the result
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

    // Searches stay parallel in batches of 8 — this works fine
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
    // STEP 5: Deduplicate by video ID
    // ==================================================================

    const seenVideoIds = new Set<string>();
    const dedupedTracks: TrackResult[] = [];

    // Sort by gigIndex for chronological order
    tracks.sort((a, b) => a.gigIndex - b.gigIndex);

    for (const track of tracks) {
      if (!seenVideoIds.has(track.videoId)) {
        seenVideoIds.add(track.videoId);
        dedupedTracks.push(track);
      }
    }

    // ==================================================================
    // STEP 6: Create playlist only if we have tracks
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

    // Dynamic playlist title + description
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
    // STEP 7: Insert tracks SEQUENTIALLY (parallel causes 409 conflicts)
    // ==================================================================

    let addedCount = 0;

    for (const track of dedupedTracks) {
      try {
        const insertRes = await fetch(`${ytApi}/playlistItems?part=snippet`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snippet: {
              playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: track.videoId,
              },
            },
          }),
        });

        if (insertRes.ok) {
          addedCount++;
        } else {
          const err = await insertRes.json();
          console.error(
            `[Otoki] Insert failed for "${track.artistName}" (${track.videoId}):`,
            err
          );
          // If the video is unplayable/unavailable, purge it from cache
          if (err.error?.code === 400 || err.error?.code === 404) {
            await supabase
              .from("artist_cache")
              .delete()
              .eq("video_id", track.videoId);
            console.log(
              `[Otoki] Purged bad cache entry: ${track.videoId}`
            );
          }
        }
      } catch (err) {
        console.error(
          `[Otoki] Insert network error for "${track.artistName}":`,
          err
        );
      }
    }

    // Quota logging
    const quotaEstimate =
      searchCount * 100 + (dedupedTracks.length + 1) * 50;
    console.log(
      `[Otoki] ✅ Mixtape complete. ${addedCount}/${dedupedTracks.length} tracks. ` +
        `${searchCount} searches (${cacheMap.size} cache hits). ` +
        `~${quotaEstimate} quota units.`
    );

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
