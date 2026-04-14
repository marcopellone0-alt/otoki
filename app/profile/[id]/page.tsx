"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import FavouriteSong from "../../components/FavouriteSong";
import { extractYouTubeId, getYouTubeThumbnail } from "../../lib/youtube";

// Helper: format a gig date for the stacked date block on cards
const formatGigDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return { day: "TBA", date: "", month: "", isToday: false, isTomorrow: false };
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    day: date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
    date: date.getDate().toString(),
    month: date.toLocaleDateString("en-AU", { month: "short" }).toUpperCase(),
    isToday: date.getTime() === today.getTime(),
    isTomorrow: date.getTime() === tomorrow.getTime(),
  };
};

export default function PublicProfile() {
  const params = useParams();
  const userId = params.id as string;

  const [profile, setProfile] = useState<any>(null);
  const [upcomingGigs, setUpcomingGigs] = useState<any[]>([]);
  const [myRsvps, setMyRsvps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [favouriteSongMeta, setFavouriteSongMeta] = useState<{
    title: string | null;
    artist: string | null;
  }>({ title: null, artist: null });

  useEffect(() => {
    const load = async () => {
      // Get current user (to know if viewing own profile)
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // If viewing own profile, redirect to editable version
      if (user && user.id === userId) {
        window.location.href = "/profile";
        return;
      }

      // Load the profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      setProfile(profileData);

      // Look up song metadata (title + artist) from iTunes if we have a song
      // This is for display in the audio card. Cheap, cached by browser.
      if (profileData?.favourite_song_url) {
        const videoId = extractYouTubeId(profileData.favourite_song_url);
        if (videoId) {
          // Try to get title/artist from YouTube oEmbed (no auth, free)
          try {
            const oembedRes = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
            );
            if (oembedRes.ok) {
              const oembedData = await oembedRes.json();
              // oEmbed gives "title" (full video title) and "author_name" (channel)
              // We split the title on common separators to extract artist - song
              const fullTitle: string = oembedData.title || "";
              const author: string = oembedData.author_name || "";

              // Common YouTube title pattern: "Artist - Song" or "Artist: Song"
              const dashSplit = fullTitle.split(/\s[-–—:]\s/);
              if (dashSplit.length >= 2) {
                setFavouriteSongMeta({
                  artist: dashSplit[0].trim(),
                  title: dashSplit
                    .slice(1)
                    .join(" - ")
                    .replace(/\([^)]*\)/g, "") // strip "(Official Video)" etc.
                    .replace(/\[[^\]]*\]/g, "")
                    .trim(),
                });
              } else {
                // No clear separator — use full title as song, channel as artist
                setFavouriteSongMeta({
                  artist: author
                    .replace(/VEVO$/i, "")
                    .replace(/\s*-\s*Topic$/i, "")
                    .trim(),
                  title: fullTitle
                    .replace(/\([^)]*\)/g, "")
                    .replace(/\[[^\]]*\]/g, "")
                    .trim(),
                });
              }
            }
          } catch {
            // oEmbed failed — card will just show "Tap to play" without metadata
          }
        }
      }

      // Load their upcoming RSVPs
      const { data: rsvpData } = await supabase
        .from("gig_rsvps")
        .select("*")
        .eq("user_id", userId)
        .gte("gig_date", new Date().toISOString().split("T")[0])
        .order("gig_date", { ascending: true });

      setUpcomingGigs(rsvpData || []);

      // Load current user's own RSVPs to determine matches
      if (user && rsvpData && rsvpData.length > 0) {
        const gigIds = rsvpData.map((r: any) => r.gig_id);
        const { data: mineData } = await supabase
          .from("gig_rsvps")
          .select("gig_id")
          .eq("user_id", user.id)
          .in("gig_id", gigIds);
        setMyRsvps(new Set(mineData?.map((r: any) => r.gig_id) || []));
      }

      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <p style={{ color: "#525252" }}>Loading...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <p style={{ color: "#525252" }}>Profile not found.</p>
        <a
          href="/"
          className="text-sm mt-4 transition-colors"
          style={{ color: "#A3A3A3" }}
        >
          ← Back to gigs
        </a>
      </main>
    );
  }

  const isOwnProfile = currentUser && currentUser.id === userId;
  const matchCount = Array.from(myRsvps).length;

  // Determine background image source — prefer iTunes album art, fall back to YouTube thumbnail
  const songVideoId = profile.favourite_song_url
    ? extractYouTubeId(profile.favourite_song_url)
    : null;
  const backgroundImage =
    profile.favourite_song_artwork_url ||
    (songVideoId ? getYouTubeThumbnail(songVideoId) : null);

  return (
    <main
      className="min-h-screen text-white relative"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      {/* ================ BLURRED ALBUM ART BACKGROUND ================ */}
      {/* Reduced blur (was 60px, now 20px) since we no longer duplicate the */}
      {/* image in a foreground video card — let the album art breathe.       */}
      {backgroundImage && (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          aria-hidden="true"
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(20px)",
              transform: "scale(1.1)", // prevents blur edges showing
              opacity: 1,
            }}
          />
          {/* Lighter overlay — let more color through now that there's no */}
          {/* foreground video competing for attention.                    */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(10, 10, 10, 0.5)",
            }}
          />
        </div>
      )}

      {/* ================ FOREGROUND CONTENT ================ */}
      <div className="relative z-10">
      {/* ================ HEADER ================ */}
      <div className="px-6 pt-6 pb-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-medium mb-8 transition-colors"
          style={{ color: "#A3A3A3" }}
        >
          <ArrowLeft size={16} />
          Back to gigs
        </a>

        {/* Avatar + identity */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className="shrink-0 rounded-full overflow-hidden"
            style={{
              width: "80px",
              height: "80px",
              backgroundColor: "#171717",
              border: "1px solid #262626",
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-black"
                style={{ fontSize: "32px", color: "#525252" }}
              >
                {profile.display_name
                  ? profile.display_name[0].toUpperCase()
                  : "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h1
              className="font-black tracking-[-0.02em] leading-[1.05]"
              style={{ fontSize: "32px", color: "#FAFAFA" }}
            >
              {profile.display_name || "Anonymous"}
            </h1>
            {matchCount > 0 && (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mt-2"
                style={{ color: "#FF0033" }}
              >
                {matchCount} gig{matchCount === 1 ? "" : "s"} in common
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p
            className="text-[15px] leading-[1.5] mb-6"
            style={{ color: "#FAFAFA" }}
          >
            {profile.bio}
          </p>
        )}

        {/* Message button */}
        {!isOwnProfile && currentUser && (
          <a
            href={`/messages?to=${userId}`}
            className="inline-flex items-center justify-center gap-2 font-extrabold text-[14px] uppercase tracking-wider rounded-full px-6 py-3 transition-colors"
            style={{
              backgroundColor: "#FF0033",
              color: "#FFFFFF",
              boxShadow: "0 8px 24px rgba(255, 0, 51, 0.25)",
            }}
          >
            <MessageCircle size={16} />
            Message
          </a>
        )}
      </div>

      {/* ================ FAVOURITE SONG (audio-only card) ================ */}
      <FavouriteSong
        url={profile.favourite_song_url}
        artworkUrl={profile.favourite_song_artwork_url}
        title={favouriteSongMeta.title}
        artist={favouriteSongMeta.artist}
      />

      {/* ================ GOING TO SECTION ================ */}
      <div className="px-6 pb-10">
        <h2
          className="font-black tracking-[-0.02em] leading-[1.05] mb-5"
          style={{ fontSize: "28px", color: "#FAFAFA" }}
        >
          GOING TO
        </h2>

        {upcomingGigs.length === 0 ? (
          <p
            className="text-[14px] py-6"
            style={{ color: "#A3A3A3" }}
          >
            No upcoming gigs yet.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingGigs.map((gig: any) => {
              const dateInfo = formatGigDate(gig.gig_date);
              const isMatch = myRsvps.has(gig.gig_id);

              return (
                <article
                  key={gig.id}
                  className="relative overflow-hidden"
                  style={{
                    backgroundColor: "rgba(23, 23, 23, 0.85)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    borderRadius: "16px",
                    borderLeft: isMatch
                      ? "3px solid #FF0033"
                      : "3px solid transparent",
                  }}
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* Stacked date block */}
                    <div
                      className="shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2.5"
                      style={{
                        backgroundColor: "#0A0A0A",
                        minWidth: "56px",
                      }}
                    >
                      <span
                        className="text-[10px] font-semibold tracking-wider"
                        style={{ color: "#525252" }}
                      >
                        {dateInfo.day}
                      </span>
                      <span
                        className="font-black leading-none my-0.5"
                        style={{ fontSize: "22px", color: "#FAFAFA" }}
                      >
                        {dateInfo.date}
                      </span>
                      <span
                        className="text-[10px] font-semibold tracking-wider"
                        style={{ color: "#525252" }}
                      >
                        {dateInfo.month}
                      </span>
                    </div>

                    {/* Gig details */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-extrabold tracking-[-0.01em] leading-[1.2]"
                        style={{ fontSize: "17px", color: "#FAFAFA" }}
                      >
                        {gig.gig_name}
                      </h3>
                      <p
                        className="text-[13px] mt-1"
                        style={{ color: "#A3A3A3" }}
                      >
                        {gig.venue_name || "Venue TBA"}
                      </p>

                      {/* Match badge — only if current user is also going */}
                      {isMatch && (
                        <div
                          className="inline-flex items-center mt-3 px-3 py-1 rounded-full"
                          style={{
                            backgroundColor: "rgba(255, 0, 51, 0.15)",
                            border: "1px solid rgba(255, 0, 51, 0.3)",
                          }}
                        >
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: "#FF0033" }}
                          >
                            ✓ You're both going
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ================ FOOTER METADATA: GENRES + VENUES ================ */}
      {(profile.favourite_genres?.length > 0 ||
        profile.favourite_venues?.length > 0) && (
        <div
          className="px-6 py-8 mt-2 space-y-6"
          style={{ borderTop: "1px solid rgba(23, 23, 23, 0.85)" }}
        >
          {profile.favourite_genres?.length > 0 && (
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3"
                style={{ color: "#A3A3A3" }}
              >
                Into
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.favourite_genres.map((g: string) => (
                  <span
                    key={g}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: "rgba(23, 23, 23, 0.85)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      border: "1px solid #262626",
                      color: "#FAFAFA",
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.favourite_venues?.length > 0 && (
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-3"
                style={{ color: "#A3A3A3" }}
              >
                Go-to venues
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.favourite_venues.map((v: string) => (
                  <span
                    key={v}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: "rgba(23, 23, 23, 0.85)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      border: "1px solid #262626",
                      color: "#FAFAFA",
                    }}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </main>
  );
}
