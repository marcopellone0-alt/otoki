import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get('spotify_access_token')?.value;
    if (!rawToken) return NextResponse.json({ error: "No token" }, { status: 401 });
    const token = rawToken.trim();
    const { gigs } = await request.json();
    const spotApi = `https://api.spotify.com/v1`;

    const meRes = await fetch(`${spotApi}/me`, { 
      headers: { 'Authorization': `Bearer ${token}` },
      cache: 'no-store'
    });
    const meData = await meRes.json();
    console.log(`[Otoki Debug] Authenticated as: ${meData.email}`);

    // 1. CREATE PLAYLIST
    const playlistRes = await fetch(`${spotApi}/me/playlists`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        name: "Otoki Live Mixtape",
        description: "Your local gig guide, mixed by Otoki.",
        public: false
      }),
    });
    const playlistData = await playlistRes.json();
    if (!playlistRes.ok) return NextResponse.json({ error: "Playlist failed" }, { status: 500 });
    const playlistId = playlistData.id;
    console.log(`[Otoki] Created Playlist ID: ${playlistId}`);

    // 2. SEARCH — smarter artist name extraction
    const trackUris: string[] = [];
    for (const gig of gigs.slice(0, 10)) {
      // Step 1: split on common separators to get the first artist chunk
      const firstChunk = gig.name.split(/[\|\-\@\:\/]/)[0];

      // Step 2: strip tour/event noise words and country tags like (NZ), (USA)
      const cleanArtist = firstChunk
        .replace(/\([^)]*\)/g, '')           // remove anything in brackets e.g. (NZ), (USA)
        .replace(/\b(Tour|Festival|Live|Australian|Anniversary|Acoustic|feat\.?.*)/gi, '')
        .replace(/[''']/g, '')               // remove smart quotes
        .trim();

      if (!cleanArtist) continue;

      console.log(`[Otoki] Searching Spotify for: "${cleanArtist}"`);

      // Step 3: search with AU market for better relevance
      const searchRes = await fetch(
        `${spotApi}/search?q=artist:${encodeURIComponent(cleanArtist)}&type=track&limit=5&market=AU`, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const searchData = await searchRes.json();
      const tracks = searchData.tracks?.items;

      if (tracks && tracks.length > 0) {
        // Pick the most popular track instead of just the first result
        const best = tracks.reduce((a: any, b: any) => 
          (b.popularity ?? 0) > (a.popularity ?? 0) ? b : a
        );
        console.log(`[Otoki] Best track for "${cleanArtist}": ${best.name} (popularity: ${best.popularity})`);
        trackUris.push(best.uri);
      } else {
        console.warn(`[Otoki] No track found for: "${cleanArtist}"`);
      }
    }

    // 3. INJECT TRACKS
    if (trackUris.length > 0) {
      await new Promise(r => setTimeout(r, 3000)); 
      console.log(`[Otoki] Injecting ${trackUris.length} tracks...`);
      
      const addRes = await fetch(`${spotApi}/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ uris: trackUris })
      });
      const addResult = await addRes.json();
      
      if (!addRes.ok) {
        console.error("[Otoki] 🚨 INJECTION BLOCKED:", addResult);
      } else {
        console.log("[Otoki] ✅ MIXTAPE COMPLETE. ENJOY.");
      }
    }

    return NextResponse.json({ url: playlistData.external_urls.spotify });
  } catch (error) {
    console.error("[Otoki] Fatal Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}