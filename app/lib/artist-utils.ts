/**
 * Shared utilities for artist name extraction, normalization, and YouTube
 * result scoring. Used by both the mixtape route and the pre-warm endpoint.
 *
 * Key design decisions:
 * - Unicode transliteration via NFD decomposition (Issue 9): á→a, ö→o, ž→z
 * - Multi-artist bill splitting (Issue 18): handles +, &, w/, with, feat., ft.
 * - Three-tier scoring (Issue 3): Topic channel (100), channel match (50), title match (25)
 */

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a string for fuzzy matching.
 * Strips diacriticals, lowercases, replaces & with "and", removes non-alphanum.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritical marks: á→a, ö→o, ž→z
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

const stripSpaces = (s: string) => s.replace(/\s/g, "");

// ============================================================================
// Artist extraction
// ============================================================================

const GENERIC_EVENT_WORDS =
  /\b(salsa|bachata|karaoke|trivia|comedy|open\s*mic|dance\s*class|workshop|party|club\s*night|dj\s*night|jam\s*session|kids|children|markets|bingo|quiz)\b/i;

/**
 * Split a string that may contain multiple artist names separated by
 * common bill separators: +, &, w/, with, feat., ft., "and" (when surrounded by spaces).
 */
function splitMultiArtist(name: string): string[] {
  return name
    .split(/\s*(?:\+|\bw\/|\bwith\b|\bfeat\.?\s|\bft\.?\s)\s*/i)
    .flatMap((part) => part.split(/\s*&\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length > 1); // drop empty or single-char fragments
}

/**
 * Extract artist names from a gig object.
 *
 * Priority:
 * 1. Curated gig's explicit artist_name field (most reliable)
 * 2. Ticketmaster's _embedded.attractions (structured data)
 * 3. Title parsing fallback (regex-based, least reliable)
 *
 * All results are run through splitMultiArtist to handle multi-bill titles.
 */
export function extractArtists(gig: any): string[] {
  // 1. Curated gig with explicit artist name
  if (gig._curated_artist_name) {
    return splitMultiArtist(gig._curated_artist_name);
  }

  // 2. Ticketmaster attractions
  const attractions = gig._embedded?.attractions || [];
  if (attractions.length > 0) {
    const names: string[] = [];
    for (const attraction of attractions) {
      const name = attraction.name;
      const type = attraction.classifications?.[0]?.type?.name;
      const subType = attraction.classifications?.[0]?.subType?.name;

      const isTourBrand =
        type === "Undefined" &&
        subType === "Undefined" &&
        /\b(tour|festival|summer|series)\b/i.test(name);

      if (!isTourBrand) {
        names.push(name);
      }
    }
    return names;
  }

  // 3. Title parsing fallback
  const fallbackName = gig.name
    .split(/[\|\@\:\/]/)[0] // split on |, @, :, / but NOT - (keep "Artist - Tour Name" together initially)
    .replace(/\([^)]*\)/g, "") // remove parenthesised sections
    .replace(/\[[^\]]*\]/g, "") // remove bracketed sections
    .replace(
      /\b(Tour|Festival|Live|Australian|Anniversary|Acoustic|Presents?|Residency)\b/gi,
      ""
    )
    .replace(/['''""]/g, "")
    .trim();

  if (
    !fallbackName ||
    GENERIC_EVENT_WORDS.test(fallbackName) ||
    GENERIC_EVENT_WORDS.test(gig.name)
  ) {
    return [];
  }

  // Try splitting on " - " for "Artist - Tour/Show Name" pattern
  const dashParts = fallbackName.split(/\s*[-–—]\s*/);
  const primaryName = dashParts[0].trim();

  if (primaryName.length > 1) {
    return splitMultiArtist(primaryName);
  }

  return splitMultiArtist(fallbackName);
}

// ============================================================================
// YouTube result scoring
// ============================================================================

function channelMatchesArtist(
  channelNorm: string,
  artistNorm: string
): boolean {
  return (
    channelNorm.includes(artistNorm) ||
    artistNorm.includes(channelNorm) ||
    stripSpaces(channelNorm).includes(stripSpaces(artistNorm)) ||
    stripSpaces(artistNorm).includes(stripSpaces(channelNorm))
  );
}

/**
 * Score a YouTube search result against an expected artist name.
 *
 * Tiers:
 * - 100: YouTube auto-generated "[Artist] - Topic" channel (always correct)
 * - 50:  Channel name matches artist name (official channel / VEVO)
 * - 25:  Video title contains artist name (weaker signal, catches small artists)
 * - 0:   No match — reject
 */
export function scoreResult(result: any, artistNorm: string): number {
  const channelNorm = normalize(result.snippet.channelTitle);
  const titleNorm = normalize(result.snippet.title);

  // Priority 1: Topic channels
  if (channelNorm.endsWith(" topic")) {
    const topicArtist = channelNorm.replace(/ topic$/, "");
    if (channelMatchesArtist(topicArtist, artistNorm)) return 100;
  }

  // Priority 2: Channel name match
  if (channelMatchesArtist(channelNorm, artistNorm)) return 50;

  // Priority 3: Title contains artist name
  if (titleNorm.includes(artistNorm) || artistNorm.includes(titleNorm))
    return 25;

  return 0;
}
