/**
 * YouTube URL utilities for the favourite song embed feature.
 *
 * Why this exists:
 * - Users paste raw YouTube URLs in many formats (watch?v=, youtu.be/, shorts/, embed/)
 * - We must NEVER render a user-supplied URL directly into an iframe src (XSS risk)
 * - Instead, we extract the 11-character video ID and construct safe URLs ourselves
 */

/**
 * Extract the 11-character YouTube video ID from any common URL format.
 * Returns null if the URL is not a recognisable YouTube link.
 *
 * Supported formats:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtube.com/watch?v=VIDEO_ID&t=42s
 *   - https://youtu.be/VIDEO_ID
 *   - https://youtu.be/VIDEO_ID?t=42
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 */
export function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // YouTube video IDs are always exactly 11 characters: A-Z, a-z, 0-9, -, _
  const idPattern = /([A-Za-z0-9_-]{11})/;

  // Try parsing as a URL first (handles query params cleanly)
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

    // youtu.be/VIDEO_ID
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (idPattern.test(id) && id.length === 11) return id;
    }

    // youtube.com variants
    if (host === "youtube.com" || host === "music.youtube.com") {
      // /watch?v=VIDEO_ID
      const v = u.searchParams.get("v");
      if (v && idPattern.test(v) && v.length === 11) return v;

      // /shorts/VIDEO_ID or /embed/VIDEO_ID
      const pathMatch = u.pathname.match(/^\/(shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (pathMatch) return pathMatch[2];
    }
  } catch {
    // Not a valid URL — fall through to bare-ID check
  }

  // Last resort: maybe the user pasted just the ID
  if (trimmed.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Get the high-quality thumbnail URL for a video ID.
 * `hqdefault` (480x360) exists for every YouTube video, unlike `maxresdefault`.
 */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Get the safe embed URL for a video ID.
 * - autoplay=1 is allowed because the user just tapped to load the iframe
 * - rel=0 prevents YouTube from suggesting unrelated videos in the player
 * - modestbranding=1 hides the YouTube logo (best effort)
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
}

/**
 * Validate a URL string. Returns true if we can extract a video ID.
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}
