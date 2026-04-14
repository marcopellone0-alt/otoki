/**
 * iTunes Search API utility — fetches album artwork for songs.
 *
 * Why iTunes: free, no auth required, broad catalog coverage, returns high-res
 * artwork URLs that we can serve directly.
 *
 * Rate limit: ~20 requests/min per IP. Since we only call this at song *selection*
 * time (not on every profile view) and cache the URL in Supabase, this is fine.
 */

interface ITunesResult {
  artworkUrl100?: string;
  artistName?: string;
  trackName?: string;
  collectionName?: string;
}

/**
 * Look up album artwork for a given song.
 * Returns the highest-res artwork URL found, or null if no good match.
 *
 * iTunes returns artworkUrl100 (100x100). We swap "100x100" for "600x600"
 * in the URL to get a higher-res version — this is a documented iTunes trick.
 */
export async function fetchAlbumArtwork(
  songTitle: string,
  artistName: string
): Promise<string | null> {
  if (!songTitle || !artistName) return null;

  // Clean the song title — strip common YouTube cruft like "(Official Video)"
  const cleanedTitle = songTitle
    .replace(/\([^)]*\)/g, "") // remove anything in parens
    .replace(/\[[^\]]*\]/g, "") // remove anything in brackets
    .replace(/\b(official|music|video|audio|lyric|lyrics|hd|hq|4k)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip common channel suffixes from artist name (e.g. "tameimpalaVEVO" → "tame impala")
  const cleanedArtist = artistName
    .replace(/VEVO$/i, "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*Official$/i, "")
    .trim();

  const query = `${cleanedArtist} ${cleanedTitle}`.trim();
  if (!query) return null;

  try {
    const url =
      `https://itunes.apple.com/search` +
      `?term=${encodeURIComponent(query)}` +
      `&media=music` +
      `&entity=song` +
      `&limit=1`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const result: ITunesResult | undefined = data.results?.[0];

    if (!result?.artworkUrl100) return null;

    // Upgrade 100x100 → 600x600 for high-res. This is a stable iTunes URL pattern.
    return result.artworkUrl100.replace("100x100bb", "600x600bb");
  } catch (err) {
    console.error("[Otoki] iTunes lookup failed:", err);
    return null;
  }
}
