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

    // 2. SEARCH — using attractions data, string parsing as fallback
    const trackUris: string[] = [];
    const seenArtists = new Set<string>();

    for (const gig of gigs.slice(0, 15)) {
      const artistNames: string[] = [];
      const attractions = gig._embedded?.attractions || [];
      
      if (attractions.length > 0) {
        for (const attraction of attractions) {
          const name = attraction.name;
          const type = attraction.classifications?.[0]?.type?.name;
          const subType = attraction.classifications?.[0]?.subType?.name;
          
          // Skip tour/festival brand names
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

        // Verify artist exists on Spotify with a matching name
        const artistRes = await fetch(
          `${spotApi}/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1&market=AU`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const artistData = await artistRes.json();
        const spotifyArtist = artistData.artists?.items?.[0];

        if (!spotifyArtist) continue;

        const normalize = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').trim();
        const isMatch = normalize(spotifyArtist.name) === normalize(artistName)
          || normalize(spotifyArtist.name).includes(normalize(artistName))
          || normalize(artistName).includes(normalize(spotifyArtist.name));

        if (!isMatch) continue;

        // Get their best track
        const searchRes = await fetch(
          `${spotApi}/search?q=artist:${encodeURIComponent(artistName)}&type=track&limit=5&market=AU`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const tracks = searchData.tracks?.items;

        if (!tracks || tracks.length === 0) continue;

        const best = tracks.reduce((a: any, b: any) =>
          (b.popularity ?? 0) > (a.popularity ?? 0) ? b : a
        );

        trackUris.push(best.uri);
      }
    }

    // 3. INJECT TRACKS
    if (trackUris.length > 0) {
      await new Promise(r => setTimeout(r, 3000)); 
      
      await fetch(`${spotApi}/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ uris: trackUris })
      });
    }

    return NextResponse.json({ url: playlistData.external_urls.spotify });
  } catch (error) {
    console.error("[Otoki] Fatal Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}