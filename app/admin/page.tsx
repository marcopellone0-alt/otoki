"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Trash2, Calendar, MapPin, Ticket, Music, Loader2, Check, Layers } from "lucide-react";

const ADMIN_USER_ID = "84bc8318-7103-469d-960e-00ef456d6853";

type ParsedGig = {
  name: string;
  gig_date: string;
  venue_name: string;
  artist_name: string;
  ticket_url: string;
  raw: string; // original line for error reporting
  error?: string;
};

// Parse a single pipe-separated line into a ParsedGig
const parseGigLine = (line: string): ParsedGig => {
  const parts = line.split("|").map((p) => p.trim());
  const raw = line;

  if (parts.length < 3) {
    return {
      name: "",
      gig_date: "",
      venue_name: "",
      artist_name: "",
      ticket_url: "",
      raw,
      error: "Need at least Name | Date | Venue",
    };
  }

  const [name, gig_date, venue_name, artist_name = "", ticket_url = ""] = parts;

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gig_date)) {
    return {
      name,
      gig_date,
      venue_name,
      artist_name,
      ticket_url,
      raw,
      error: `Date must be YYYY-MM-DD (got "${gig_date}")`,
    };
  }

  if (!name) return { name, gig_date, venue_name, artist_name, ticket_url, raw, error: "Name is empty" };
  if (!venue_name)
    return { name, gig_date, venue_name, artist_name, ticket_url, raw, error: "Venue is empty" };

  return { name, gig_date, venue_name, artist_name, ticket_url, raw };
};

export default function Admin() {
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [curatedGigs, setCuratedGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Weekly note
  const [weeklyNote, setWeeklyNote] = useState("");
  const [existingNoteId, setExistingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Mode toggle: single vs bulk
  const [inputMode, setInputMode] = useState<"single" | "bulk">("single");

  // Single form
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

  // Bulk form
  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    success: number;
    errors: ParsedGig[];
  } | null>(null);

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
        await supabase
          .from("weekly_notes")
          .update({ note: weeklyNote.trim(), created_at: new Date().toISOString() })
          .eq("id", existingNoteId);
      } else {
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

  const handleBulkSubmit = async () => {
    if (!user || !bulkText.trim()) return;
    setBulkSubmitting(true);
    setBulkResult(null);

    // Parse each non-empty line
    const lines = bulkText.split("\n").filter((l) => l.trim().length > 0);
    const parsed = lines.map(parseGigLine);

    const validGigs = parsed.filter((g) => !g.error);
    const errors = parsed.filter((g) => g.error);

    // Insert valid gigs
    let successCount = 0;
    if (validGigs.length > 0) {
      const rows = validGigs.map((g) => ({
        name: g.name,
        gig_date: g.gig_date,
        venue_name: g.venue_name,
        artist_name: g.artist_name || null,
        ticket_url: g.ticket_url || null,
        created_by: user.id,
      }));

      const { data, error } = await supabase
        .from("curated_gigs")
        .insert(rows)
        .select();

      if (error) {
        alert(`Bulk insert failed: ${error.message}`);
        setBulkSubmitting(false);
        return;
      }
      successCount = data?.length || 0;
    }

    setBulkResult({ success: successCount, errors });
    if (successCount > 0) {
      setBulkText("");
      await loadCuratedGigs();
    }
    setBulkSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gig?")) return;
    const { error } = await supabase.from("curated_gigs").delete().eq("id", id);
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
  const bulkLineCount = bulkText.split("\n").filter((l) => l.trim().length > 0).length;

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
                backgroundColor: noteSaved ? "#262626" : !weeklyNote.trim() ? "#262626" : "#FF0033",
                color: noteSaved ? "#A3A3A3" : !weeklyNote.trim() ? "#525252" : "#FFFFFF",
              }}
            >
              {noteSaved ? "SAVED ✓" : savingNote ? "SAVING..." : "SAVE NOTE"}
            </button>
          </div>
        </div>
      </div>

      {/* ================ MODE TOGGLE ================ */}
      <div className="px-6 pb-5">
        <div
          className="flex rounded-full p-1"
          style={{ backgroundColor: "#171717", border: "1px solid #262626" }}
        >
          <button
            onClick={() => setInputMode("single")}
            className="flex-1 font-bold text-[12px] uppercase tracking-wider py-2 rounded-full transition-colors"
            style={{
              backgroundColor: inputMode === "single" ? "#FF0033" : "transparent",
              color: inputMode === "single" ? "#FFFFFF" : "#A3A3A3",
            }}
          >
            Single
          </button>
          <button
            onClick={() => setInputMode("bulk")}
            className="flex-1 font-bold text-[12px] uppercase tracking-wider py-2 rounded-full transition-colors flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: inputMode === "bulk" ? "#FF0033" : "transparent",
              color: inputMode === "bulk" ? "#FFFFFF" : "#A3A3A3",
            }}
          >
            <Layers size={13} />
            Bulk Paste
          </button>
        </div>
      </div>

      {/* ================ BULK PASTE MODE ================ */}
      {inputMode === "bulk" && (
        <div className="px-6 pb-10 space-y-4">
          <div
            className="rounded-2xl p-4"
            style={{ backgroundColor: "#171717", border: "1px solid #262626" }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
              style={{ color: "#525252" }}
            >
              Format
            </p>
            <p
              className="text-[12px] leading-[1.5]"
              style={{ color: "#A3A3A3", fontFamily: "monospace" }}
            >
              Name | Date | Venue | Artist | Ticket URL
            </p>
            <p className="text-[11px] mt-2" style={{ color: "#525252" }}>
              One gig per line. Date format: YYYY-MM-DD. Artist + URL optional.
            </p>
          </div>

          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.1em] block mb-2"
              style={{ color: "#525252" }}
            >
              Paste gigs
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Máquina Peligrosa Vinyl Launch | 2026-04-20 | Railway Hotel | Máquina Peligrosa | https://...\nBaker Boy Tour | 2026-04-21 | Northcote Theatre | Baker Boy | https://...`}
              rows={10}
              spellCheck={false}
              className="w-full text-[13px] rounded-xl px-4 py-3 focus:outline-none resize-y"
              style={{
                backgroundColor: "#171717",
                border: "1px solid #262626",
                color: "#FAFAFA",
                fontFamily: "monospace",
                minHeight: "200px",
              }}
            />
            <p className="text-[11px] mt-2" style={{ color: "#525252" }}>
              {bulkLineCount} {bulkLineCount === 1 ? "gig" : "gigs"} ready to add
            </p>
          </div>

          <button
            onClick={handleBulkSubmit}
            disabled={bulkSubmitting || bulkLineCount === 0}
            className="w-full font-extrabold text-[15px] rounded-full py-4 tracking-wide transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                bulkSubmitting || bulkLineCount === 0 ? "#262626" : "#FF0033",
              color: bulkSubmitting || bulkLineCount === 0 ? "#525252" : "#FFFFFF",
              boxShadow:
                bulkSubmitting || bulkLineCount === 0
                  ? "none"
                  : "0 8px 32px rgba(255, 0, 51, 0.25)",
              cursor:
                bulkSubmitting || bulkLineCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {bulkSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                ADDING...
              </>
            ) : (
              <>
                <Plus size={16} />
                ADD {bulkLineCount} {bulkLineCount === 1 ? "GIG" : "GIGS"}
              </>
            )}
          </button>

          {/* Result feedback */}
          {bulkResult && (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{
                backgroundColor: "#171717",
                border: `1px solid ${bulkResult.errors.length > 0 ? "#FF0033" : "#262626"}`,
              }}
            >
              {bulkResult.success > 0 && (
                <p
                  className="text-[14px] font-semibold flex items-center gap-2"
                  style={{ color: "#10B981" }}
                >
                  <Check size={14} />
                  Added {bulkResult.success} {bulkResult.success === 1 ? "gig" : "gigs"}
                </p>
              )}
              {bulkResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p
                    className="text-[13px] font-semibold"
                    style={{ color: "#FF0033" }}
                  >
                    {bulkResult.errors.length} line(s) skipped:
                  </p>
                  {bulkResult.errors.map((err, i) => (
                    <div
                      key={i}
                      className="text-[11px] rounded px-3 py-2"
                      style={{
                        backgroundColor: "#0A0A0A",
                        color: "#A3A3A3",
                        fontFamily: "monospace",
                      }}
                    >
                      <p style={{ color: "#FF6B7A" }}>✗ {err.error}</p>
                      <p className="mt-1 truncate">{err.raw}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================ SINGLE MODE (EXISTING FORM) ================ */}
      {inputMode === "single" && (
        <div className="px-6 pb-10 space-y-4">
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
      )}

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
