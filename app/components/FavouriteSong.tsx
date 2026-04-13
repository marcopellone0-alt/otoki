"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import {
  extractYouTubeId,
  getYouTubeThumbnail,
  getYouTubeEmbedUrl,
} from "../lib/youtube";

interface FavouriteSongProps {
  url: string | null | undefined;
}

/**
 * Renders a user's favourite YouTube song on their public profile.
 *
 * Behaviour:
 * - Resting state: shows YouTube thumbnail with a play button overlay.
 *   Iframe is NOT loaded yet — saves ~500KB of YouTube JS until the user wants it.
 * - Tapped state: swaps to the YouTube iframe with autoplay (allowed because
 *   the user initiated playback).
 * - If the URL is invalid or missing, renders nothing.
 *
 * Security: never renders the user-supplied URL directly. Only the extracted
 * 11-char video ID is used to construct the safe embed URL.
 */
export default function FavouriteSong({ url }: FavouriteSongProps) {
  const [playing, setPlaying] = useState(false);

  if (!url) return null;
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  return (
    <div className="px-6 pb-10">
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
        style={{ color: "#525252" }}
      >
        ▶ Favourite track
      </p>

      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          aspectRatio: "16 / 9",
          backgroundColor: "#171717",
          border: "1px solid #262626",
        }}
      >
        {playing ? (
          <iframe
            src={getYouTubeEmbedUrl(videoId)}
            title="Favourite track"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
            style={{ border: "none" }}
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 w-full h-full group"
            aria-label="Play favourite track"
          >
            <img
              src={getYouTubeThumbnail(videoId)}
              alt=""
              className="w-full h-full object-cover"
            />
            {/* Dark gradient for play button contrast */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)",
              }}
            />
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="flex items-center justify-center rounded-full transition-transform group-hover:scale-105"
                style={{
                  width: "64px",
                  height: "64px",
                  backgroundColor: "#FF0033",
                  boxShadow: "0 8px 32px rgba(255, 0, 51, 0.4)",
                }}
              >
                <Play
                  size={26}
                  color="#FFFFFF"
                  fill="#FFFFFF"
                  style={{ marginLeft: "3px" }}
                />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
