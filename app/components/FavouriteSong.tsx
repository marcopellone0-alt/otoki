"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import {
  extractYouTubeId,
  getYouTubeThumbnail,
} from "../lib/youtube";

interface FavouriteSongProps {
  url: string | null | undefined;
  artworkUrl?: string | null;
  title?: string | null;
  artist?: string | null;
}

/**
 * Audio-only favourite song card.
 *
 * Uses YouTube's IFrame Player API to play the video's audio while keeping
 * the video element hidden offscreen. The user sees a Spotify-style mini
 * player: album art thumbnail, title/artist text, play/pause button, and
 * a thin progress bar.
 *
 * Why this approach:
 * - YouTube has no official audio-only embed, so we hide the iframe and
 *   talk to it via the IFrame Player API
 * - The user gets a clean focused player; the album art becomes the
 *   page's visual hero (no duplication with a foreground video)
 * - First play has ~1-2s delay while YouTube's player loads; subsequent
 *   play/pause is instant
 *
 * Security: never renders the user-supplied URL directly. Only the
 * extracted 11-char video ID is used.
 */
export default function FavouriteSong({
  url,
  artworkUrl,
  title,
  artist,
}: FavouriteSongProps) {
  const [playerReady, setPlayerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const playerRef = useRef<any>(null);
  const containerId = useRef(
    `yt-player-${Math.random().toString(36).slice(2, 9)}`
  );
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  if (!url) return null;
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  // Load the YouTube IFrame API once for the whole app
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If API is already loaded, initialize immediately
    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
      return;
    }

    // Otherwise, load the API script
    const existingScript = document.getElementById("youtube-iframe-api");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    // YouTube calls this global when the API is ready
    const previousCallback = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      initPlayer();
    };

    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch {
          // Player may already be gone
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const initPlayer = () => {
    if (!(window as any).YT || !(window as any).YT.Player) return;
    const container = document.getElementById(containerId.current);
    if (!container) return;

    playerRef.current = new (window as any).YT.Player(containerId.current, {
      height: "1",
      width: "1",
      videoId: videoId,
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => setPlayerReady(true),
        onStateChange: (e: any) => {
          // YT.PlayerState: 1=playing, 2=paused, 0=ended, 3=buffering
          if (e.data === 1) {
            setPlaying(true);
            setLoading(false);
            startProgressTracking();
          } else if (e.data === 2) {
            setPlaying(false);
            stopProgressTracking();
          } else if (e.data === 0) {
            setPlaying(false);
            setProgress(0);
            stopProgressTracking();
          } else if (e.data === 3) {
            setLoading(true);
          }
        },
      },
    });
  };

  const startProgressTracking = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;
      try {
        const current = playerRef.current.getCurrentTime();
        const total = playerRef.current.getDuration();
        if (total > 0) setProgress(current / total);
      } catch {
        // Player not ready
      }
    }, 250);
  };

  const stopProgressTracking = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  const togglePlay = () => {
    if (!playerRef.current) {
      // Player still loading — show loading state
      setLoading(true);
      return;
    }

    if (playing) {
      playerRef.current.pauseVideo();
    } else {
      setLoading(true);
      playerRef.current.playVideo();
    }
  };

  // Prefer iTunes album art, fall back to YouTube thumbnail
  const thumbnail = artworkUrl || getYouTubeThumbnail(videoId);

  return (
    <div className="px-6 pb-10">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
        style={{ color: "#A3A3A3" }}
      >
        ▶ Favourite track
      </p>

      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          backgroundColor: "rgba(23, 23, 23, 0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid #262626",
        }}
      >
        <div className="flex items-center gap-3 p-3">
          {/* Album art thumbnail */}
          <img
            src={thumbnail}
            alt=""
            className="shrink-0 object-cover"
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "8px",
              backgroundColor: "#0A0A0A",
            }}
          />

          {/* Title + artist */}
          <div className="flex-1 min-w-0">
            {title && (
              <p
                className="font-semibold text-[14px] leading-[1.3] truncate"
                style={{ color: "#FAFAFA" }}
              >
                {title}
              </p>
            )}
            {artist && (
              <p
                className="text-[12px] mt-0.5 truncate"
                style={{ color: "#A3A3A3" }}
              >
                {artist}
              </p>
            )}
            {!title && !artist && (
              <p
                className="text-[13px]"
                style={{ color: "#A3A3A3" }}
              >
                Tap to play
              </p>
            )}
          </div>

          {/* Play/pause button */}
          <button
            onClick={togglePlay}
            disabled={loading}
            className="shrink-0 flex items-center justify-center transition-transform active:scale-95"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "24px",
              backgroundColor: "#FF0033",
              boxShadow: "0 4px 16px rgba(255, 0, 51, 0.3)",
              cursor: loading ? "default" : "pointer",
            }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {loading ? (
              <Loader2
                size={20}
                color="#FFFFFF"
                className="animate-spin"
              />
            ) : playing ? (
              <Pause size={20} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Play
                size={20}
                color="#FFFFFF"
                fill="#FFFFFF"
                style={{ marginLeft: "2px" }}
              />
            )}
          </button>
        </div>

        {/* Progress bar — thin line at the bottom of the card */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "2px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              backgroundColor: "#FF0033",
              transition: "width 0.25s linear",
            }}
          />
        </div>
      </div>

      {/* Hidden YouTube player — 1px and offscreen */}
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          top: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <div id={containerId.current} />
      </div>
    </div>
  );
}
