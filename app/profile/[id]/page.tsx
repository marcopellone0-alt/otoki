"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Pencil, LogOut } from "lucide-react";
import FavouriteSong from "../../components/FavouriteSong";
import SharedHistoryHero from "../../components/SharedHistoryHero";
import PublicScrapbookPreview from "../../components/PublicScrapbookPreview";
import ProfileActionsMenu from "../../components/ProfileActionsMenu";
import { extractYouTubeId, getYouTubeThumbnail } from "../../lib/youtube";

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
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // Block check: hide ONLY if the TARGET has blocked the VIEWER.
      // The blocker should still be able to see the blocked user's profile
      // so they can access the unblock menu via the three-dot.
      // Asymmetric on purpose: viewer-as-blocker -> can see, viewer-as-blocked -> hidden.
      if (user && user.id !== userId) {
        const { data: blockedByTarget } = await supabase
          .from("blocks")
          .select("id")
          .eq("blocker_id", userId)   // target is the one who issued the block
          .eq("blocked_id", user.id)  // viewer is the one being blocked
          .maybeSingle();

        if (blockedByTarget) {
          setProfile(null);
          setLoading(false);
          return;
        }
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      setProfile(profileData);

      if (profileData?.favourite_song_url) {
        const videoId = extractYouTubeId(profileData.favourite_song_url);
        if (videoId) {
          try {
            const oembedRes = await fetch(
              `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
            );
            if (oembedRes.ok) {
              const oembedData = await oembedRes.json();
              const fullTitle: string = oembedData.title || "";
              const author: string = oembedData.author_name || "";

              const dashSplit = fullTitle.split(/\s[-–—:]\s/);
              if (dashSplit.length >= 2) {
                setFavouriteSongMeta({
                  artist: dashSplit[0].trim(),
                  title: dashSplit
                    .slice(1)
                    .join(" - ")
                    .replace(/\([^)]*\)/g, "")
                    .replace(/\[[^\]]*\]/g, "")
                    .trim(),
                });
              } else {
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
            // oEmbed failed — card just shows "Tap to play"
          }
        }
      }

      const { data: rsvpData } = await supabase
        .from("gig_rsvps")
        .select("*")
        .eq("user_id", userId)
        .gte("gig_date", new Date().toISOString().split("T")[0])
        .order("gig_date", { ascending: true });

      setUpcomingGigs(rsvpData || []);

      if (user && user.id !== userId && rsvpData && rsvpData.length > 0) {
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

  const handleLogout = async () => {
    const confirmed = window.confirm("Log out of Otoki?");
    if (!confirmed) return;
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

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

  const isOwnProfile = !!(currentUser && currentUser.id === userId);

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
              filter: "blur(10px)",
              transform: "scale(1.1)",
              opacity: 1,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(10, 10, 10, 0.55)",
            }}
          />
        </div>
      )}

      <div className="relative z-10">
        <div className="px-6 pt-6 pb-8">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-[13px] font-medium mb-8 transition-colors"
            style={{ color: "#A3A3A3" }}
          >
            <ArrowLeft size={16} />
            Back to gigs
          </a>

          {!isOwnProfile && (
            <SharedHistoryHero
              targetUserId={userId}
              viewerUserId={currentUser?.id || null}
            />
          )}

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
            </div>
          </div>

          {profile.bio && (
            <p
              className="text-[15px] leading-[1.5] mb-6"
              style={{ color: "#FAFAFA" }}
            >
              {profile.bio}
            </p>
          )}

          {currentUser && (
            <div className="flex items-center gap-3">
              <a
                href={isOwnProfile ? "/profile" : `/messages?to=${userId}`}
                className="inline-flex items-center justify-center gap-2 font-extrabold text-[14px] uppercase tracking-wider rounded-full px-6 py-3 transition-colors"
                style={{
                  backgroundColor: isOwnProfile ? "#171717" : "#FF0033",
                  color: "#FFFFFF",
                  border: isOwnProfile ? "1px solid #262626" : "none",
                  boxShadow: isOwnProfile
                    ? "none"
                    : "0 8px 24px rgba(255, 0, 51, 0.25)",
                }}
              >
                {isOwnProfile ? <Pencil size={16} /> : <MessageCircle size={16} />}
                {isOwnProfile ? "Edit profile" : "Message"}
              </a>

              {!isOwnProfile && (
                <ProfileActionsMenu
                  targetUserId={userId}
                  targetDisplayName={profile.display_name || "this user"}
                />
              )}
            </div>
          )}
        </div>

        <FavouriteSong
          url={profile.favourite_song_url}
          artworkUrl={profile.favourite_song_artwork_url}
          title={favouriteSongMeta.title}
          artist={favouriteSongMeta.artist}
        />

        <div className="px-6 pb-10">
          <h2
            className="font-black tracking-[-0.02em] leading-[1.05] mb-5"
            style={{ fontSize: "28px", color: "#FAFAFA" }}
          >
            GOING TO
          </h2>

          {upcomingGigs.length === 0 ? (
            <p className="text-[14px] py-6" style={{ color: "#A3A3A3" }}>
              No upcoming gigs yet.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingGigs.map((gig: any) => {
                const dateInfo = formatGigDate(gig.gig_date);
                const isMatch = !isOwnProfile && myRsvps.has(gig.gig_id);

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

        <PublicScrapbookPreview ownerId={userId} isOwnProfile={isOwnProfile} />

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

        {isOwnProfile && (
          <div className="px-6 pb-12 pt-4">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 text-[13px] font-medium transition-colors"
              style={{
                color: "#A3A3A3",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
