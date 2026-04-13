"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Camera, LogOut, Check } from "lucide-react";

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

// Helper: format a gig date for the stacked date block on cards
const formatGigDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return { day: "TBA", date: "", month: "" };
  const date = new Date(dateStr + "T00:00:00");
  return {
    day: date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
    date: date.getDate().toString(),
    month: date.toLocaleDateString("en-AU", { month: "short" }).toUpperCase(),
  };
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
  const [uploading, setUploading] = useState(false);

  // Baseline snapshot of saved values — used to detect unsaved changes
  const [baseline, setBaseline] = useState<{
    displayName: string;
    bio: string;
    selectedGenres: string[];
    selectedVenues: string[];
    avatarUrl: string;
  } | null>(null);

  const [upcomingGigs, setUpcomingGigs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }
      setUser(user);

      // Load existing profile
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
        setDisplayName(name);
        setBio(b);
        setSelectedGenres(genres);
        setSelectedVenues(venues);
        setAvatarUrl(avatar);
        setBaseline({
          displayName: name,
          bio: b,
          selectedGenres: genres,
          selectedVenues: venues,
          avatarUrl: avatar,
        });
      }

      // Load own upcoming RSVPs
      const { data: rsvpData } = await supabase
        .from("gig_rsvps")
        .select("*")
        .eq("user_id", user.id)
        .gte("gig_date", new Date().toISOString().split("T")[0])
        .order("gig_date", { ascending: true });

      setUpcomingGigs(rsvpData || []);

      setLoading(false);
    };
    load();
  }, []);

  // Compute dirty state — true if any field differs from baseline
  const hasUnsavedChanges = baseline
    ? displayName !== baseline.displayName ||
      bio !== baseline.bio ||
      JSON.stringify(selectedGenres.slice().sort()) !==
        JSON.stringify(baseline.selectedGenres.slice().sort()) ||
      JSON.stringify(selectedVenues.slice().sort()) !==
        JSON.stringify(baseline.selectedVenues.slice().sort()) ||
      avatarUrl.split("?")[0] !== baseline.avatarUrl
    : false;

  // Auto-clear "saved" indicator after 2 seconds
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
      // Cache-bust the URL so the new avatar shows immediately
      setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const cleanAvatarUrl = avatarUrl.split("?")[0]; // strip cache-bust param
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName,
        bio,
        favourite_genres: selectedGenres,
        favourite_venues: selectedVenues,
        avatar_url: cleanAvatarUrl,
      });

    if (!error) {
      setSavedAt(Date.now());
      // Reset baseline to current values so dirty state clears
      setBaseline({
        displayName,
        bio,
        selectedGenres: [...selectedGenres],
        selectedVenues: [...selectedVenues],
        avatarUrl: cleanAvatarUrl,
      });
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("Log out of Otoki?");
    if (!confirmed) return;
    await supabase.auth.signOut();
    window.location.href = "/";
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

  return (
    <main
      className="min-h-screen text-white"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      {/* ================ HEADER ================ */}
      <div className="px-6 pt-12 pb-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
          style={{ color: "#525252" }}
        >
          Your profile
        </p>
        <h1
          className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
          style={{ fontSize: "36px", color: "#FAFAFA" }}
        >
          EDIT
        </h1>
        <p className="text-[14px]" style={{ color: "#A3A3A3" }}>
          This is what other gig-goers will see.
        </p>
      </div>

      {/* ================ AVATAR + NAME BLOCK ================ */}
      <div className="px-6 pt-8 pb-8">
        <div className="flex items-start gap-4 mb-6">
          {/* Avatar with edit overlay */}
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
            {/* Camera icon overlay */}
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

          {/* Name input — styled to look like display text but is an input */}
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
                borderBottom: "1px solid #262626",
                paddingBottom: "4px",
              }}
            />
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.1em] mt-2"
              style={{ color: "#525252" }}
            >
              {uploading ? "Uploading photo..." : "Tap photo to change"}
            </p>
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6">
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
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
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
          <p
            className="text-[11px] text-right mt-1"
            style={{ color: "#525252" }}
          >
            {bio.length}/200
          </p>
        </div>
      </div>

      {/* ================ GOING TO SECTION ================ */}
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
              backgroundColor: "#171717",
              border: "1px dashed #262626",
            }}
          >
            <p className="text-[14px]" style={{ color: "#A3A3A3" }}>
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
                    backgroundColor: "#171717",
                    borderRadius: "16px",
                    borderLeft: "3px solid #FF0033",
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

      {/* ================ GENRES ================ */}
      <div className="px-6 pb-8">
        <h2
          className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
          style={{ fontSize: "20px", color: "#FAFAFA" }}
        >
          MUSIC YOU'RE INTO
        </h2>
        <p
          className="text-[12px] mb-4"
          style={{ color: "#525252" }}
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
                  backgroundColor: selected ? "#FF0033" : "transparent",
                  border: selected ? "1px solid #FF0033" : "1px solid #262626",
                  color: selected ? "#FFFFFF" : "#A3A3A3",
                }}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================ VENUES ================ */}
      <div className="px-6 pb-8">
        <h2
          className="font-black tracking-[-0.02em] leading-[1.05] mb-2"
          style={{ fontSize: "20px", color: "#FAFAFA" }}
        >
          GO-TO VENUES
        </h2>
        <p
          className="text-[12px] mb-4"
          style={{ color: "#525252" }}
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
                  backgroundColor: selected ? "#FF0033" : "transparent",
                  border: selected ? "1px solid #FF0033" : "1px solid #262626",
                  color: selected ? "#FFFFFF" : "#A3A3A3",
                }}
              >
                {venue}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================ LOGOUT (footer, now in normal flow) ================ */}
      <div
        className="px-6 py-8 mt-2 text-center"
        style={{ borderTop: "1px solid #171717" }}
      >
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: "#525252" }}
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>

      {/* Spacer to reserve room for the floating save bar when it's visible */}
      {(hasUnsavedChanges || saving || savedAt) && (
        <div aria-hidden style={{ height: "88px" }} />
      )}

      {/* ================ FLOATING SAVE BAR ================ */}
      {/* Positioned fixed, sits above the tab bar (tab bar = ~80px tall) */}
      {/* Only visible when there are unsaved changes, or during save, or briefly after save */}
      {(hasUnsavedChanges || saving || savedAt) && (
        <div
          className="fixed left-0 right-0 z-40 px-6 py-4"
          style={{
            bottom: "80px", // sit above tab bar
            backgroundColor: "#0A0A0A",
            borderTop: "1px solid #171717",
            boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.8)",
          }}
        >
          <div className="max-w-md mx-auto">
            {/* Unsaved changes indicator */}
            {hasUnsavedChanges && !saving && !savedAt && (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2 text-center"
                style={{ color: "#FF0033" }}
              >
                ● Unsaved changes
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving || (!hasUnsavedChanges && !savedAt)}
              className="w-full font-extrabold text-[15px] rounded-full py-4 tracking-wide transition-colors flex items-center justify-center gap-2"
              style={{
                backgroundColor: savedAt
                  ? "#171717"
                  : saving
                  ? "#262626"
                  : "#FF0033",
                color: savedAt
                  ? "#A3A3A3"
                  : saving
                  ? "#525252"
                  : "#FFFFFF",
                border: savedAt ? "1px solid #262626" : "none",
                boxShadow:
                  saving || savedAt
                    ? "none"
                    : "0 8px 24px rgba(255, 0, 51, 0.35)",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {savedAt ? (
                <>
                  <Check size={16} />
                  SAVED
                </>
              ) : saving ? (
                "SAVING..."
              ) : (
                "SAVE CHANGES"
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
