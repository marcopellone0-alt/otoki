import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get('spotify_access_token')?.value;
    if (!rawToken) return NextResponse.json({ error: "No token" }, { status: 401 });

    // Clean the token of any ghost characters
    const token = rawToken.trim();
    const { gigs } = await request.json();
    const spotApi = `https://api.spotify.com/v1`;

    // DEBUG: WHO AM I? (Check your terminal for this email!)
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
        public: false // Force private to match standard dev scopes
      }),
    });

    const playlistData = await playlistRes.json();
    if (!playlistRes.ok) return NextResponse.json({ error: "Playlist failed" }, { status: 500 });
    const playlistId = playlistData.id;
    console.log(`[Otoki] Created Playlist ID: ${playlistId}`);

    // 2. SEARCH
    const trackUris: string[] = [];
    for (const gig of gigs.slice(0, 10)) {
      const cleanArtist = gig.name.split(/[\|\-\@\:]/)[0].replace(/Tour|Australian|'|’/gi, '').trim();
      const searchRes = await fetch(`${spotApi}/search?q=artist:${encodeURIComponent(cleanArtist)}&type=track&limit=1`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const searchData = await searchRes.json();
      if (searchData.tracks?.items?.[0]?.uri) {
        trackUris.push(searchData.tracks.items[0].uri);
      }
    }

    // 3. THE INJECTION (The "Sledgehammer" version)
    if (trackUris.length > 0) {
      // 3-second delay for Spotify's 2026 DB propagation
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