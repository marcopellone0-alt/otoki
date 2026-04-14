"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { fetchAlbumArtwork } from "../lib/itunes";

/**
 * Decode HTML entities that come back from the YouTube API
 * (e.g. "Tame Impala &#39; Currents" → "Tame Impala ' Currents")
 */
function decodeHtmlEntities(str: string): string {
  if (typeof window === "undefined") return str;
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

interface YouTubeResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

interface SongPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (videoId: string, title: string, artworkUrl: string | null) => void;
}

export default function SongPicker({ open, onClose, onSelect }: SongPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the sheet opens
  useEffect(() => {
    if (open) {
      // Small delay so the focus happens after the slide-up animation starts
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      // Reset state when closed
      setQuery("");
      setResults([]);
      setError(null);
      setSelectingId(null);
    }
  }, [open]);

  // Debounced search — waits 500ms after typing stops before hitting the API.
  // This protects the YouTube quota (100 units/call) from being torched on every keystroke.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/youtube/search?q=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();
        if (!res.ok) {
          setError("Search failed. Try again.");
          setResults([]);
        } else {
          setResults(data.results || []);
        }
      } catch {
        setError("Couldn't reach search. Check your connection.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleSelect = async (result: YouTubeResult) => {
    const decodedTitle = decodeHtmlEntities(result.title);
    const decodedChannel = decodeHtmlEntities(result.channelTitle);

    setSelectingId(result.videoId);

    // Look up album artwork via iTunes. If it fails or returns nothing,
    // we pass null and the consumer will fall back to the YouTube thumbnail.
    const artworkUrl = await fetchAlbumArtwork(decodedTitle, decodedChannel);

    onSelect(result.videoId, decodedTitle, artworkUrl);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col"
        style={{
          backgroundColor: "#0A0A0A",
          borderTop: "1px solid #262626",
          borderTopLeftRadius: "20px",
          borderTopRightRadius: "20px",
          maxHeight: "85dvh",
          height: "85dvh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "2px",
              backgroundColor: "#262626",
            }}
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 pb-4 shrink-0"
          style={{ borderBottom: "1px solid #171717" }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: "#525252" }}
          >
            Choose a song
          </p>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ color: "#A3A3A3" }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search input */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid #171717" }}
        >
          <div className="relative">
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#525252",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a song or artist..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full text-[15px] focus:outline-none"
              style={{
                backgroundColor: "#171717",
                border: "1px solid #262626",
                color: "#FAFAFA",
                borderRadius: "20px",
                padding: "10px 16px 10px 38px",
              }}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2
                size={20}
                className="animate-spin"
                style={{ color: "#525252" }}
              />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-12 px-6">
              <p className="text-[14px]" style={{ color: "#FF0033" }}>
                {error}
              </p>
            </div>
          )}

          {!loading && !error && query.trim().length < 3 && (
            <div className="text-center py-12 px-6">
              <p className="text-[14px]" style={{ color: "#525252" }}>
                Search YouTube for the song that says something about you.
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            query.trim().length >= 3 &&
            results.length === 0 && (
              <div className="text-center py-12 px-6">
                <p className="text-[14px]" style={{ color: "#525252" }}>
                  No results. Try a different search.
                </p>
              </div>
            )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result) => {
                const isSelecting = selectingId === result.videoId;
                return (
                  <button
                    key={result.videoId}
                    onClick={() => handleSelect(result)}
                    disabled={selectingId !== null}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left"
                    style={{
                      backgroundColor: isSelecting ? "#171717" : "transparent",
                      opacity: selectingId !== null && !isSelecting ? 0.4 : 1,
                      cursor: selectingId !== null ? "default" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (selectingId === null) {
                        e.currentTarget.style.backgroundColor = "#171717";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectingId === null) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <img
                      src={result.thumbnail}
                      alt=""
                      className="shrink-0 object-cover"
                      style={{
                        width: "80px",
                        height: "60px",
                        borderRadius: "8px",
                        backgroundColor: "#171717",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold text-[14px] leading-[1.3]"
                        style={{
                          color: "#FAFAFA",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {decodeHtmlEntities(result.title)}
                      </p>
                      <p
                        className="text-[12px] mt-1 truncate"
                        style={{ color: "#A3A3A3" }}
                      >
                        {decodeHtmlEntities(result.channelTitle)}
                      </p>
                    </div>
                    {isSelecting && (
                      <Loader2
                        size={16}
                        className="animate-spin shrink-0"
                        style={{ color: "#525252" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
