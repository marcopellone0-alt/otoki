import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * YouTube search proxy for the favourite-song picker.
 *
 * Why server-side: keeps the YOUTUBE_API_KEY hidden from the client.
 *
 * Cost: 100 quota units per call. Free tier = 10,000 units/day.
 * The client should debounce aggressively and require min 3 chars before calling.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error("[Otoki] YOUTUBE_API_KEY missing");
      return NextResponse.json(
        { error: "Search unavailable" },
        { status: 500 }
      );
    }

    // videoCategoryId=10 = Music. Biases results toward songs/music videos
    // rather than reaction videos, interviews, etc.
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&q=${encodeURIComponent(q)}` +
      `&type=video` +
      `&videoCategoryId=10` +
      `&maxResults=8` +
      `&key=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      console.error("[Otoki] YouTube search failed:", data);
      return NextResponse.json(
        { error: "Search failed" },
        { status: res.status }
      );
    }

    // Strip the response down to just what the picker needs
    const results = (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[Otoki] Search route error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
