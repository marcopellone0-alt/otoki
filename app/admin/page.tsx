"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Trash2, Calendar, MapPin, Ticket, Music, Loader2, Check } from "lucide-react";

const ADMIN_USER_ID = "84bc8318-7103-469d-960e-00ef456d6853";

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [curatedGigs, setCuratedGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Weekly note state
  const [weeklyNote, setWeeklyNote] = useState("");
  const [existingNoteId, setExistingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [gigDate, setGigDate] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [artistName, setArtistName] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justAddedAt, setJustAddedAt] = useState<number | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setAuthChecking(false);

      if (user?.id === ADMIN_USER_ID) {
        await Promise.all([loadCuratedGigs(), loadWeeklyNote()]);
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const loadCuratedGigs = async () => {
    const { data } = await supabase
      .from("curated_gigs")
      .select("*")
      .order("gig_date", { ascending: true });
    setCuratedGigs(data || []);
  };

  const loadWeeklyNote = async () => {
    // Get the most recent note
    const { data } = await supabase
      .from("weekly_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setWeeklyNote(data[0].note);
      setExistingNoteId(data[0].id);
    }
  };

  const saveWeeklyNote = async () => {
    if (!user) return;
    setSavingNote(true);

    try {
      if (existingNoteId) {
        // Update existing
        await supabase
          .from("weekly_notes")
          .update({ note: weeklyNote.trim(), created_at: new Date().toISOString() })
          .eq("id", existingNoteId);
      } else {
        // Create new
        const { data } = await supabase
          .from("weekly_notes")
          .insert({ note: weeklyNote.trim(), created_by: user.id })
          .select()
          .single();
        if (data) setExistingNoteId(data.id);
      }
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (err) {
      alert("Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  useEffect(() => {
    if (justAddedAt) {
      const timer = setTimeout(() => setJustAddedAt(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [justAddedAt]);

  const handleSubmit = async () => {
    if (!user || !name.trim() || !gigDate || !venueName.trim()) return;
    setSubmitting(true);

    const { error } = await supabase.from("curated_gigs").insert({
      name: name.trim(),
      gig_date: gigDate,
      venue_name: venueName.trim(),
      venue_address: venueAddress.trim() || null,
      ticket_url: ticketUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      description: description.trim() || null,
      artist_name: artistName.trim() || null,
      youtube_video_id: youtubeVideoId.trim() || null,
      created_by: user.id,
    });

    if (!error) {
      setName("");
      setGigDate("");
      setVenueName("");
      setVenueAddress("");
      setTicketUrl("");
      setImageUrl("");
      setDescription("");
      setArtistName("");
      setYoutubeVideoId("");
      setJustAddedAt(Date.now());
      await loadCuratedGigs();
    } else {
      alert(`Failed to add gig: ${error.message}`);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gig?")) return;
    const { error } = await supabase
      .from("curated_gigs")
      .delete()
      .eq("id", id);
    if (!error) {
      await loadCuratedGigs();
    }
  };

  // ==========================================================================
  // AUTH GATE
  // ==========================================================================

  if (authChecking) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <p style={{ color: "#525252" }}>Loading...</p>
      </main>
    );
  }

  if (!user || user.id !== ADMIN_USER_ID) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <p className="font-black text-[48px] mb-2" style={{ color: "#FAFAFA" }}>
          404
        </p>
        <p style={{ color: "#525252" }}>Page not found.</p>
        <a
          href="/"
          className="text-[13px] mt-6 transition-colors"
          style={{ color: "#A3A3A3" }}
        >
          ← Back to gigs
        </a>
      </main>
    );
  }

  // ==========================================================================
  // ADMIN VIEW
  // ==========================================================================

  const canSubmit = name.trim() && gigDate && venueName.trim() && !submitting;

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: "#0A0A0A" }}>
      {/* ================ HEADER ================ */}
      <div className="px-6 pt-12 pb-6">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
          style={{ color: "#525252" }}
        >
          Curation
        </p>
        <h1
          className="font-black tracking-[-0.02em] leading-[1.05]"
          style={{ fontSize: "40px", color: "#FAFAFA" }}
        >
          ADD A GIG
        </h1>
        <p className="text-[14px] mt-2" style={{ color: "#A3A3A3" }}>
          Hand-pick gigs that aren't on Ticketmaster.
        </p>
      </div>

      {/* ================ WEEKLY NOTE ================ */}
      <div className="px-6 pb-8">
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: "#171717", border: "1px solid #262626" }}
        >
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-3"
            style={{ color: "#FF0033" }}
          >
            This week in Naarm
          </label>
          <textarea
            value={weeklyNote}
            onChange={(e) => setWeeklyNote(e.target.value)}
            placeholder="Big week in the inner north. Baker Boy at Northcote Theatre is the one to watch..."
            rows={3}
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none resize-none"
            style={{
              backgroundColor: "#0A0A0A",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px]" style={{ color: "#525252" }}>
              {weeklyNote.length}/300 · Shows at the top of the gig list
            </p>
            <button
              onClick={saveWeeklyNote}
              disabled={savingNote || !weeklyNote.trim()}
              className="font-bold text-[12px] uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
              style={{
                backgroundColor: noteSaved
                  ? "#262626"
                  : !weeklyNote.trim()
                  ? "#262626"
                  : "#FF0033",
                color: noteSaved
                  ? "#A3A3A3"
                  : !weeklyNote.trim()
                  ? "#525252"
                  : "#FFFFFF",
              }}
            >
              {noteSaved ? "SAVED ✓" : savingNote ? "SAVING..." : "SAVE NOTE"}
            </button>
          </div>
        </div>
      </div>

      {/* ================ ADD GIG FORM ================ */}
      <div className="px-6 pb-10 space-y-4">
        {/* Gig name */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Gig name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Máquina Peligrosa — Vinyl Launch"
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* Artist name */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Artist name
          </label>
          <input
            type="text"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            placeholder="e.g. Máquina Peligrosa (for mixtape matching)"
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
          <p className="text-[11px] mt-1" style={{ color: "#525252" }}>
            Separate multiple artists with +
          </p>
        </div>

        {/* Date */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Date *
          </label>
          <input
            type="date"
            value={gigDate}
            onChange={(e) => setGigDate(e.target.value)}
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
              WebkitAppearance: "none",
            }}
          />
        </div>

        {/* Venue */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Venue *
          </label>
          <input
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="e.g. The Tote"
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* Venue address */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Venue address
          </label>
          <input
            type="text"
            value={venueAddress}
            onChange={(e) => setVenueAddress(e.target.value)}
            placeholder="e.g. 67-71 Johnston St, Collingwood"
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* Ticket URL */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Ticket URL
          </label>
          <input
            type="url"
            value={ticketUrl}
            onChange={(e) => setTicketUrl(e.target.value)}
            placeholder="https://..."
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-[14px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* YouTube Video ID */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            YouTube video ID
          </label>
          <input
            type="text"
            value={youtubeVideoId}
            onChange={(e) => setYoutubeVideoId(e.target.value)}
            placeholder="e.g. dQw4w9WgXcQ (11 chars from the URL)"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-[14px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
          <p className="text-[11px] mt-1" style={{ color: "#525252" }}>
            Optional — guarantees this artist appears in the mixtape.
          </p>
        </div>

        {/* Image URL */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Image URL
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-[14px] rounded-xl px-4 py-3 focus:outline-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* Notes */}
        <div>
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
            style={{ color: "#525252" }}
          >
            Notes
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — supports, special notes, etc."
            rows={2}
            className="w-full text-[15px] rounded-xl px-4 py-3 focus:outline-none resize-none"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              color: "#FAFAFA",
            }}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full font-extrabold text-[15px] rounded-full py-4 tracking-wide transition-colors flex items-center justify-center gap-2 mt-2"
          style={{
            backgroundColor: justAddedAt ? "#262626" : !canSubmit ? "#262626" : "#FF0033",
            color: justAddedAt ? "#A3A3A3" : !canSubmit ? "#525252" : "#FFFFFF",
            boxShadow:
              !canSubmit || justAddedAt ? "none" : "0 8px 32px rgba(255, 0, 51, 0.25)",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {justAddedAt ? (
            <>
              <Check size={16} />
              ADDED
            </>
          ) : submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              ADDING...
            </>
          ) : (
            <>
              <Plus size={16} />
              ADD GIG
            </>
          )}
        </button>
      </div>

      {/* ================ CURATED GIGS LIST ================ */}
      <div className="px-6 pb-20">
        <h2
          className="font-black tracking-[-0.02em] leading-[1.05] mb-4"
          style={{ fontSize: "28px", color: "#FAFAFA" }}
        >
          CURATED ({curatedGigs.length})
        </h2>

        {loading ? (
          <p style={{ color: "#525252" }}>Loading...</p>
        ) : curatedGigs.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: "#171717", border: "1px dashed #262626" }}
          >
            <p className="text-[14px]" style={{ color: "#A3A3A3" }}>
              No curated gigs yet. Add the first one above.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {curatedGigs.map((gig) => (
              <div
                key={gig.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: "#171717", border: "1px solid #262626" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-extrabold text-[15px] leading-[1.2]"
                      style={{ color: "#FAFAFA" }}
                    >
                      {gig.name}
                    </p>
                    <div
                      className="flex items-center gap-3 mt-2 text-[12px] flex-wrap"
                      style={{ color: "#A3A3A3" }}
                    >
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(gig.gig_date + "T00:00:00").toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {gig.venue_name}
                      </span>
                      {gig.ticket_url && (
                        <a
                          href={gig.ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 transition-colors"
                          style={{ color: "#FF0033" }}
                        >
                          <Ticket size={12} />
                          Tickets
                        </a>
                      )}
                    </div>
                    {(gig.artist_name || gig.youtube_video_id) && (
                      <div
                        className="flex items-center gap-3 mt-1.5 text-[11px]"
                        style={{ color: "#525252" }}
                      >
                        {gig.artist_name && (
                          <span className="flex items-center gap-1">
                            <Music size={10} />
                            {gig.artist_name}
                          </span>
                        )}
                        {gig.youtube_video_id && <span>YT: {gig.youtube_video_id}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(gig.id)}
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                    style={{ color: "#525252" }}
                    aria-label="Delete gig"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
