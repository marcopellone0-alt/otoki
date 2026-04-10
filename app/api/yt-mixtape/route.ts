import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('yt_access_token')?.value;
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    const { gigs } = await request.json();
    const ytApi = 'https://www.googleapis.com/youtube/v3';
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Sort gigs by date (soonest first) before building playlist
    const sortedGigs = [...gigs].sort((a, b) => {
      const dateA = a.dates?.start?.localDate || '9999-12-31';
      const dateB = b.dates?.start?.localDate || '9999-12-31';
      return dateA.localeCompare(dateB);
    });

    // 1. CREATE PLAYLIST
    const playlistRes = await fetch(`${ytApi}/playlists?part=snippet,status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        snippet: {
          title: "Otoki Live Mixtape",
          description: "Your local gig guide, mixed by Otoki. Discover who's playing live near you."
        },
        status: {
          privacyStatus: "unlisted"
        }
      })
    });

    const playlistData = await playlistRes.json();
    if (!playlistRes.ok) {
      console.error('[Otoki] YouTube playlist creation failed:', playlistData);
      return NextResponse.json({ error: "Playlist creation failed" }, { status: 500 });
    }

    const playlistId = playlistData.id;
    console.log(`[Otoki] Created YouTube Playlist: ${playlistId}`);

    // 2. SEARCH FOR ARTISTS AND ADD TRACKS
    const seenArtists = new Set<string>();
    let addedCount = 0;

    const normalize = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').trim();
    const stripSpaces = (s: string) => s.replace(/\s/g, '');

    for (const gig of sortedGigs.slice(0, 15)) {
      const artistNames: string[] = [];
      const attractions = gig._embedded?.attractions || [];

      if (attractions.length > 0) {
        for (const attraction of attractions) {
          const name = attraction.name;
          const type = attraction.classifications?.[0]?.type?.name;
          const subType = attraction.classifications?.[0]?.subType?.name;

          const isTourBrand = type === 'Undefined' && subType === 'Undefined'
            && /\b(tour|festival|summer|series)\b/i.test(name);

          if (!isTourBrand) {
            artistNames.push(name);
          }
        }
      } else {
        const fallbackName = gig.name
          .split(/[\|\-\@\:\/]/)[0]
          .replace(/\([^)]*\)/g, '')
          .replace(/\b(Tour|Festival|Live|Australian|Anniversary|Acoustic|feat\.?.*)/gi, '')
          .replace(/[''']/g, '')
          .trim();
        if (fallbackName) artistNames.push(fallbackName);
      }

      for (const artistName of artistNames) {
        const key = artistName.toLowerCase();
        if (seenArtists.has(key)) continue;
        seenArtists.add(key);

        // Search YouTube for music videos — fetch top 3 results for better matching
        const searchRes = await fetch(
          `${ytApi}/search?part=snippet&q=${encodeURIComponent(artistName + ' official music video')}&type=video&videoCategoryId=10&maxResults=3`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (!searchData.items || searchData.items.length === 0) {
          console.warn(`[Otoki] No YouTube video found for: "${artistName}", skipping`);
          continue;
        }

        const artistNorm = normalize(artistName);

        // Score each result and pick the best match
        let bestResult = null;
        let bestScore = -1;

        for (const result of searchData.items) {
          const channelTitle = result.snippet.channelTitle;
          const channelNorm = normalize(channelTitle);
          let score = 0;

          // Priority 1: YouTube auto-generated "[Artist] - Topic" channels (always correct)
          if (channelNorm.endsWith(' topic')) {
            const topicArtist = channelNorm.replace(/ topic$/, '');
            if (topicArtist.includes(artistNorm) || artistNorm.includes(topicArtist)
                || stripSpaces(topicArtist).includes(stripSpaces(artistNorm))
                || stripSpaces(artistNorm).includes(stripSpaces(topicArtist))) {
              score = 100; // Guaranteed correct — auto-generated from official audio
            }
          }

          // Priority 2: Channel name matches artist name (official artist channel / VEVO)
          if (score === 0) {
            if (channelNorm.includes(artistNorm) || artistNorm.includes(channelNorm)
                || stripSpaces(channelNorm).includes(stripSpaces(artistNorm))
                || stripSpaces(artistNorm).includes(stripSpaces(channelNorm))) {
              score = 50;
            }
          }

          // No match on channel name = score stays 0, result is rejected
          // (titleNorm.startsWith check deliberately removed — too many false positives from fan uploads)

          if (score > bestScore) {
            bestScore = score;
            bestResult = result;
          }
        }

        // Only add if we found a channel-verified match
        if (!bestResult || bestScore === 0) {
          console.warn(`[Otoki] No verified match for: "${artistName}" — all ${searchData.items.length} results failed channel check`);
          continue;
        }

        const videoId = bestResult.id.videoId;
        const videoTitle = bestResult.snippet.title;
        const channelTitle = bestResult.snippet.channelTitle;

        console.log(`[Otoki] Found: "${videoTitle}" (channel: ${channelTitle}, score: ${bestScore}) for artist "${artistName}"`);

        // Add video to playlist
        const addRes = await fetch(`${ytApi}/playlistItems?part=snippet`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            snippet: {
              playlistId: playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: videoId
              }
            }
          })
        });

        if (addRes.ok) {
          addedCount++;
        } else {
          const err = await addRes.json();
          console.error(`[Otoki] Failed to add "${videoTitle}":`, err);
        }
      }
    }

    console.log(`[Otoki] ✅ YouTube Mixtape complete. ${addedCount} tracks added.`);

    // Return the YouTube Music playlist URL
    return NextResponse.json({ 
      url: `https://music.youtube.com/playlist?list=${playlistId}` 
    });

  } catch (error) {
    console.error("[Otoki] Fatal Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
