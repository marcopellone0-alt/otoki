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

    for (const gig of gigs.slice(0, 15)) {
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

        // Search YouTube for a music video by this artist
        const searchRes = await fetch(
          `${ytApi}/search?part=snippet&q=${encodeURIComponent(artistName + ' official music video')}&type=video&videoCategoryId=10&maxResults=1`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (!searchData.items || searchData.items.length === 0) {
          console.warn(`[Otoki] No YouTube video found for: "${artistName}", skipping`);
          continue;
        }

        const topResult = searchData.items[0];
        const videoId = topResult.id.videoId;
        const videoTitle = topResult.snippet.title;
        const channelTitle = topResult.snippet.channelTitle;

        // Verify the result is actually related to the artist we searched for
        const normalize = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').trim();
        const artistNorm = normalize(artistName);
        const channelNorm = normalize(channelTitle);
        const titleNorm = normalize(videoTitle);

        const stripSpaces = (s: string) => s.replace(/\s/g, '');
        const isRelevant = channelNorm.includes(artistNorm)
          || artistNorm.includes(channelNorm)
          || stripSpaces(channelNorm).includes(stripSpaces(artistNorm))
          || stripSpaces(artistNorm).includes(stripSpaces(channelNorm))
          || titleNorm.startsWith(artistNorm);

        if (!isRelevant) {
          console.warn(`[Otoki] Skipping mismatch: searched "${artistName}", got "${videoTitle}" by channel "${channelTitle}"`);
          continue;
        }

        console.log(`[Otoki] Found: "${videoTitle}" (channel: ${channelTitle}) for artist "${artistName}"`);

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
