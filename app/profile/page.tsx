"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

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

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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
        setDisplayName(profile.display_name || "");
        setBio(profile.bio || "");
        setSelectedGenres(profile.favourite_genres || []);
        setSelectedVenues(profile.favourite_venues || []);
        setAvatarUrl(profile.avatar_url || "");
      }
      setLoading(false);
    };
    load();
  }, []);

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const toggleVenue = (venue: string) => {
    setSelectedVenues(prev =>
      prev.includes(venue) ? prev.filter(v => v !== venue) : [...prev, venue]
    );
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const filePath = `${user.id}/avatar.${file.name.split('.').pop()}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        display_name: displayName,
        bio,
        favourite_genres: selectedGenres,
        favourite_venues: selectedVenues,
        avatar_url: avatarUrl,
      });

    if (error) {
      setMessage("Failed to save. Try again.");
    } else {
      setMessage("Profile saved!");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
      <div className="max-w-md w-full space-y-8">

        <div className="space-y-2">
          <a href="/" className="text-neutral-500 hover:text-white text-sm transition-colors">
            ← Back to gigs
          </a>
          <h1 className="text-3xl font-black tracking-tighter">Your profile</h1>
          <p className="text-neutral-500 text-sm">
            This is what other gig-goers will see.
          </p>
        </div>

        <div className="space-y-6">
{/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-neutral-800 overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-600 text-3xl font-bold">
                  {displayName ? displayName[0].toUpperCase() : "?"}
                </div>
              )}
            </div>
            <label className={`text-sm px-4 py-1.5 rounded-full cursor-pointer transition-colors ${
              uploading ? "bg-neutral-800 text-neutral-500" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}>
              {uploading ? "Uploading..." : "Change photo"}
              <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            </label>
          </div>
          {/* Display Name */}
          <div className="space-y-1">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="What should people call you?"
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600"
            />
          </div>

          {/* Bio */}
          <div className="space-y-1">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="A bit about you and what you're into..."
              rows={3}
              maxLength={200}
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600 resize-none"
            />
            <p className="text-neutral-600 text-xs text-right">{bio.length}/200</p>
          </div>

          {/* Favourite Genres */}
          <div className="space-y-2">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Music you're into</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(genre => (
                <button
                  key={genre}
                  onClick={() => toggleGenre(genre)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedGenres.includes(genre)
                      ? "bg-[#FF0000] text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Favourite Venues */}
          <div className="space-y-2">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Your go-to venues</label>
            <div className="flex flex-wrap gap-2">
              {VENUES.map(venue => (
                <button
                  key={venue}
                  onClick={() => toggleVenue(venue)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedVenues.includes(venue)
                      ? "bg-[#FF0000] text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {venue}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          {message && (
            <p className={`text-sm text-center ${message.includes("saved") ? "text-green-400" : "text-red-400"}`}>
              {message}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full font-extrabold text-lg rounded-full py-4 transition-colors ${
              saving
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-[#FF0000] hover:bg-[#CC0000] text-white shadow-lg shadow-[#FF0000]/20"
            }`}
          >
            {saving ? "SAVING..." : "SAVE PROFILE"}
          </button>

        </div>

      </div>
    </main>
  );
}
