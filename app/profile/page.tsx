"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Camera, Check, Music, X, ArrowLeft } from "lucide-react";
import { extractYouTubeId, getYouTubeThumbnail } from "../lib/youtube";
import SongPicker from "../components/SongPicker";

const GENRES = [
  "Rock", "Indie", "Pop", "Electronic", "Hip Hop", "R&B", "Jazz",
  "Folk", "Country", "Metal", "Punk", "Soul", "Latin", "World", "Classical"
];

const VENUES = [
  "The Corner Hotel", "Northcote Theatre", "170 Russell", "The Night Cat",
  "Brunswick Ballroom", "The Tote", "The Curtin", "Bar Open",
  "The Espy", "Forum Melbourne", "Howler", "Colour Club",
  "Croxton Bandroom", "Retreat Hotel", "The Workers Club"
];

const formatGigDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return { day: "TBA", date: "", month: "" };
  const date = new Date(dateStr + "T00:00:00");
  return {
    day: date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
    date: date.getDate().toString(),
    month: date.toLocaleDateString("en-AU", { month: "short" }).toUpperCase(),
  };
};

type BlockedUser = {
  block_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [favouriteSongUrl, setFavouriteSongUrl] = useState("");
  const [favouriteSongTitle, setFavouriteSongTitle] = useState<string | null>(null);
  const [favouriteSongArtworkUrl, setFavouriteSongArtworkUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [baseline, setBaseline] = useState<{
    displayName: string;
    bio: string;
    selectedGenres: string[];
    selectedVenues: string[];
    avatarUrl: string;
    favouriteSongUrl: string;
    favouriteSongArtworkUrl: string;
  } | null>(null);

  const [upcomingGigs, setUpcomingGigs] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        const name = profile.display_name || "";
        const b = profile.bio || "";
        const genres = profile.favourite_genres || [];
        const venues = profile.favourite_venues || [];
        const avatar = profile.avatar_url || "";
        const song = profile.favourite_song_url || "";
        const artwork = profile.favourite_song_artwork_url || "";
        setDisplayName(name);
        setBio(b);
        setSelectedGenres(genres);
        setSelectedVenues(venues);
        setAvatarUrl(avatar);
        setFavouriteSongUrl(song);
        setFavouriteSongArtworkUrl(artwork || null);
        setBaseline({
          displayName: name,
          bio: b,
          selectedGenres: genres,
          selectedVenues: venues,
          avatarUrl: avatar,
          favouriteSongUrl: song,
          favouriteSongArtworkUrl: artwork,
        });
      }

      const { data: rsvpData } = await supabase
        .from("gig_rsvps")
        .select("*")
        .eq("user_id", user.id)
        .gte("gig_date", new Date().toISOString().split("T")[0])
        .order("gig_date", { ascending: true });

      setUpcomingGigs(rsvpData || []);

      // Load blocked users for the unblock list at the bottom of this page.
      await loadBlockedUsers(user.id);

      setLoading(false);
    };
    load();
  }, []);

  /**
   * Fetch the list of users the current user has blocked, hydrated with
   * display_name and avatar_url for the unblock list UI.
   */
  const loadBlockedUsers = async (uid: string) => {
    const { data: blocks, error } = await supabase
      .from("blocks")
      .select("id, blocked_id, created_at")
      .eq("blocker_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[blocks] load error:", error);
      return;
    }

    if (!blocks || blocks.length === 0) {
      setBlockedUsers([]);
      return;
    }

    const blockedIds = blocks.map((b: any) => b.blocked_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", blockedIds);

    const profileMap = new Map(
      (profiles || []).map((p: any) => [p.id, p])
    );

    setBlockedUsers(
      blocks.map((b: any) => {
        const p = profileMap.get(b.blocked_id);
        return {
          block_id: b.id,
          user_id: b.blocked_id,
          display_name: p?.display_name || "Unknown user",
          avatar_url: p?.avatar_url || null,
        };
      })
    );
  };

  const unblock = async (blockId: string, displayName: string) => {
    const ok = window.confirm(`Unblock ${displayName}?`);
    if (!ok) return;

    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("id", blockId);

    if (error) {
      console.error("[blocks] unblock error:", error);
      window.alert("Couldn't unblock. Please try again.");
      return;
    }

    setBlockedUsers((prev) => prev.filter((b) => b.block_id !== blockId));
  };

  const hasUnsavedChanges = baseline
    ? displayName !== baseline.displayName ||
      bio !== baseline.bio ||
      JSON.stringify(selectedGenres.slice().sort()) !==
        JSON.stringify(baseline.selectedGenres.slice().sort()) ||
      JSON.stringify(selectedVenues.slice().sort()) !==
        JSON.stringify(baseline.selectedVenues.slice().sort()) ||
      avatarUrl.split("?")[0] !== baseline.avatarUrl ||
      favouriteSongUrl !== baseline.favouriteSongUrl ||
      (favouriteSongArtworkUrl || "") !== baseline.favouriteSongArtworkUrl
    : false;

  useEffect(() => {
    if (savedAt) {
      const timer = setTimeout(() => setSavedAt(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [savedAt]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleVenue = (venue: string) => {
    setSelectedVenues((prev) =>
      prev.includes(venue) ? prev.filter((v) => v !== venue) : [...prev, venue]
    );
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const filePath = `${user.id}/avatar.${file.name.split(".").pop()}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    }
    setUploading(false);
  };

  const handleSongSelect = (
    videoId: string,
    title: string,
    artworkUrl: string | null
  ) => {
    setFavouriteSongUrl(`https://www.youtube.com/watch?v=${videoId}`);
    setFavouriteSongTitle(title);
    setFavouriteSongArtworkUrl(artworkUrl);
    setPickerOpen(false);
  };

  const handleSongRemove = () => {
    setFavouriteSongUrl("");
    setFavouriteSongTitle(null);
    setFavouriteSongArtworkUrl(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const cleanAvatarUrl = avatarUrl.split("?")[0];
    const cleanSongUrl = favouriteSongUrl.trim() || null;
    const cleanArtworkUrl = cleanSongUrl ? favouriteSongArtworkUrl : null;

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName,
        bio,
        favourite_genres: selectedGenres,
        favourite_venues: selectedVenues,
        avatar_url: cleanAvatarUrl,
        favourite_song_url: cleanSongUrl,
        favourite_song_artwork_url: cleanArtworkUrl,
      });

    if (!error) {
      setSavedAt(Date.now());
      setBaseline({
        displayName,
        bio,
        selectedGenres: [...selectedGenres],
        selectedVenues: [...selectedVenues],
        avatarUrl: cleanAvatarUrl,
        favouriteSongUrl: cleanSongUrl || "",
        favouriteSongArtworkUrl: cleanArtworkUrl || "",
      });
    }
    setSaving(false);
  };

  const handleBack = () => {
    if (!user) return;
    if (hasUnsavedChanges) {
      const ok = window.confirm("You have unsaved changes. Leave anyway?");
      if (!ok) return;
    }
    window.location.href = `/profile/${user.id}`;
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

  const songVideoId = favouriteSongUrl
    ? extractYouTubeId(favouriteSongUrl)
    : null;
  const songPreviewImage =
    favouriteSongArtworkUrl ||
    (songVideoId ? getYouTubeThumbnail(songVideoId) : null);
  const backgroundImage = songPreviewImage;

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
        <div
          className="sticky top-0 z-30 flex items-center justify-between px-6"
          style={{
            backgroundColor: "rgba(10, 10, 10, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(23, 23, 23, 0.85)",
            height: "56px",
          }}
        >
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
            style={{
              color: "#A3A3A3",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <p
            className="text-[11px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: "#A3A3A3" }}
          >
            Edit profile
          </p>

          <button
            onClick={handleSave}
            disabled={saving || (!hasUnsavedChanges && !savedAt)}
            className="font-extrabold text-[13px] uppercase tracking-[0.1em] transition-colors flex items-center gap-1.5"
            style={{
              color: savedAt
                ? "#A3A3A3"
                : saving
                ? "#525252"
                : hasUnsavedChanges
                ? "#FF0033"
                : "#525252",
              cursor:
                saving || (!hasUnsavedChanges && !savedAt)
                  ? "default"
                  : "pointer",
            }}
          >
            {savedAt ? (
              <>
                <Check size={14} />
                Saved
              </>
            ) : saving ? (
              "Saving..."
            ) : (
              "Save"
            )}
          </button>
        </div>

        <div className="px-6 pt-8 pb-2">
          <h1
            className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
            style={{ fontSize: "36px", color: "#FAFAFA" }}
          >
            EDIT
          </h1>
          <p className="text-[14px]" style={{ color: "#FAFAFA" }}>
            This is what other gig-goers will see.
          </p>
        </div>

        <div className="px-6 pt-8 pb-8">
          <div className="flex items-start gap-4 mb-6">
            <label
              className="relative shrink-0 cursor-pointer group"
              style={{ width: "80px", height: "80px" }}
            >
              <div
                className="w-full h-full rounded-full overflow-hidden"
                style={{
                  backgroundColor: "#171717",
                  border: "1px solid #262626",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center font-black"
                    style={{ fontSize: "32px", color: "#525252" }}
                  >
                    {displayName ? displayName[0].toUpperCase() : "?"}
                  </div>
                )}
              </div>
              <div
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "#FF0033",
                  border: "2px solid #0A0A0A",
                }}
              >
                <Camera size={14} color="#FFFFFF" />
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={uploadAvatar}
                className="hidden"
              />
            </label>

            <div className="flex-1 min-w-0 pt-1">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full font-black tracking-[-0.02em] leading-[1.05] focus:outline-none bg-transparent"
                style={{
                  fontSize: "32px",
                  color: "#FAFAFA",
                  padding: 0,
                  border: "none",
                  borderBottom: "1px solid rgba(38, 38, 38, 0.85)",
                  paddingBottom: "4px",
                }}
              />
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mt-2"
                style={{ color: "#A3A3A3" }}
              >
                {uploading ? "Uploading photo..." : "Tap photo to change"}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
              style={{ color: "#A3A3A3" }}
            >
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A bit about you and what you're into..."
              rows={3}
              maxLength={200}
              className="w-full text-[15px] leading-[1.5] rounded-xl px-4 py-3 focus:outline-none resize-none"
              style={{
                backgroundColor: "rgba(23, 23, 23, 0.85)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid #262626",
                color: "#FAFAFA",
              }}
            />
            <p
              className="text-[11px] text-right mt-1"
              style={{ color: "#A3A3A3" }}
            >
              {bio.length}/200
            </p>
          </div>

          <div className="mt-6">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
              style={{ color: "#A3A3A3" }}
            >
              Favourite song
            </label>

            {songVideoId ? (
              <div
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  backgroundColor: "rgba(23, 23, 23, 0.85)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid #262626",
                }}
              >
                {songPreviewImage && (
                  <img
                    src={songPreviewImage}
                    alt=""
                    className="shrink-0 object-cover"
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "6px",
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-semibold truncate"
                    style={{ color: "#FAFAFA" }}
                  >
                    {favouriteSongTitle || "Selected song"}
                  </p>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="text-[11px] font-semibold uppercase tracking-wider mt-0.5 transition-colors"
                    style={{ color: "#FF0033" }}
                  >
                    Change
                  </button>
                </div>
                <button
                  onClick={handleSongRemove}
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ color: "#A3A3A3" }}
                  aria-label="Remove song"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-colors"
                style={{
                  backgroundColor: "rgba(23, 23, 23, 0.85)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px dashed #262626",
                  color: "#A3A3A3",
                }}
              >
                <Music size={16} />
                <span className="text-[14px] font-semibold">
                  Choose a song
                </span>
              </button>
            )}

            <p
              className="text-[11px] mt-1.5"
              style={{ color: "#A3A3A3" }}
            >
              One song that says something about you.
            </p>
          </div>
        </div>

        <div className="px-6 pb-10">
          <h2
            className="font-black tracking-[-0.02em] leading-[1.05] mb-5"
            style={{ fontSize: "28px", color: "#FAFAFA" }}
          >
            GOING TO
          </h2>

          {upcomingGigs.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                backgroundColor: "rgba(23, 23, 23, 0.85)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px dashed #262626",
              }}
            >
              <p className="text-[14px]" style={{ color: "#FAFAFA" }}>
                No upcoming gigs yet.
              </p>
              <a
                href="/"
                className="inline-block text-[12px] font-semibold uppercase tracking-wider mt-3 transition-colors"
                style={{ color: "#FF0033" }}
              >
                Find gigs →
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingGigs.map((gig: any) => {
                const dateInfo = formatGigDate(gig.gig_date);
                return (
                  <article
                    key={gig.id}
                    className="relative overflow-hidden"
                    style={{
                      backgroundColor: "rgba(23, 23, 23, 0.85)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      borderRadius: "16px",
                      borderLeft: "3px solid #FF0033",
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
                        <p className="text-[13px] mt-1" style={{ color: "#A3A3A3" }}>
                          {gig.venue_name || "Venue TBA"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 pb-8">
          <h2
            className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
            style={{ fontSize: "20px", color: "#FAFAFA" }}
          >
            MUSIC YOU'RE INTO
          </h2>
          <p
            className="text-[12px] mb-4"
            style={{ color: "#A3A3A3" }}
          >
            Tap to select. These show on your public profile.
          </p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => {
              const selected = selectedGenres.includes(genre);
              return (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className="text-[13px] font-semibold px-4 py-2 rounded-full transition-colors"
                  style={{
                    backgroundColor: selected
                      ? "#FF0033"
                      : "rgba(23, 23, 23, 0.85)",
                    backdropFilter: selected ? "none" : "blur(8px)",
                    WebkitBackdropFilter: selected ? "none" : "blur(8px)",
                    border: selected ? "1px solid #FF0033" : "1px solid #262626",
                    color: selected ? "#FFFFFF" : "#FAFAFA",
                  }}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-8">
          <h2
            className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
            style={{ fontSize: "20px", color: "#FAFAFA" }}
          >
            GO-TO VENUES
          </h2>
          <p
            className="text-[12px] mb-4"
            style={{ color: "#A3A3A3" }}
          >
            Where you usually catch shows.
          </p>
          <div className="flex flex-wrap gap-2">
            {VENUES.map((venue) => {
              const selected = selectedVenues.includes(venue);
              return (
                <button
                  key={venue}
                  onClick={() => toggleVenue(venue)}
                  className="text-[13px] font-semibold px-4 py-2 rounded-full transition-colors"
                  style={{
                    backgroundColor: selected
                      ? "#FF0033"
                      : "rgba(23, 23, 23, 0.85)",
                    backdropFilter: selected ? "none" : "blur(8px)",
                    WebkitBackdropFilter: selected ? "none" : "blur(8px)",
                    border: selected ? "1px solid #FF0033" : "1px solid #262626",
                    color: selected ? "#FFFFFF" : "#FAFAFA",
                  }}
                >
                  {venue}
                </button>
              );
            })}
          </div>
        </div>

        {/*
          BLOCKED USERS section — only renders if there's at least one block.
          Sits at the bottom of the edit page so the user can find it but it
          doesn't clutter the page for users who never block anyone.
        */}
        {blockedUsers.length > 0 && (
          <div
            className="px-6 pb-8 pt-6"
            style={{ borderTop: "1px solid rgba(23, 23, 23, 0.85)" }}
          >
            <h2
              className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
              style={{ fontSize: "20px", color: "#FAFAFA" }}
            >
              BLOCKED
            </h2>
            <p
              className="text-[12px] mb-4"
              style={{ color: "#A3A3A3" }}
            >
              People you've blocked. Tap unblock to undo.
            </p>
            <div className="space-y-2">
              {blockedUsers.map((b) => (
                <div
                  key={b.block_id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{
                    backgroundColor: "rgba(23, 23, 23, 0.85)",
                    border: "1px solid #262626",
                  }}
                >
                  {b.avatar_url ? (
                    <img
                      src={b.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[14px]"
                      style={{
                        backgroundColor: "#262626",
                        color: "#A3A3A3",
                      }}
                    >
                      {b.display_name[0].toUpperCase()}
                    </div>
                  )}
                  <p
                    className="flex-1 text-[14px] font-semibold truncate"
                    style={{ color: "#FAFAFA" }}
                  >
                    {b.display_name}
                  </p>
                  <button
                    onClick={() => unblock(b.block_id, b.display_name)}
                    className="text-[12px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      backgroundColor: "transparent",
                      border: "1px solid #262626",
                      color: "#A3A3A3",
                      cursor: "pointer",
                    }}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <SongPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSongSelect}
        />
      </div>
    </main>
  );
}
