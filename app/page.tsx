"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { X, EyeOff } from "lucide-react";

const ADMIN_USER_ID = "84bc8318-7103-469d-960e-00ef456d6853";

// ============================================================================
// Helpers
// ============================================================================

const getDateRange = () => {
  const from = new Date().toISOString().split("T")[0];
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { from, to };
};

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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const isRecentlyAdded = (createdAt: string | null | undefined): boolean => {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < SEVEN_DAYS_MS;
};

const groupGigsByDay = (gigs: any[]) => {
  const byKey = new Map<string, { label: string; sortKey: string; gigs: any[] }>();

  for (const gig of gigs) {
    const dateStr = gig.dates?.start?.localDate;
    if (!dateStr) {
      const key = "TBA";
      if (!byKey.has(key)) byKey.set(key, { label: "DATE TBA", sortKey: "9999", gigs: [] });
      byKey.get(key)!.gigs.push(gig);
      continue;
    }
    const f = formatGigDate(dateStr);
    let label: string;
    if (f.isToday) label = "TONIGHT";
    else if (f.isTomorrow) label = "TOMORROW";
    else label = `${f.day} ${f.date} ${f.month}`;

    if (!byKey.has(dateStr)) byKey.set(dateStr, { label, sortKey: dateStr, gigs: [] });
    byKey.get(dateStr)!.gigs.push(gig);
  }

  return Array.from(byKey.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
};

const curatedGigToTicketmasterShape = (curated: any) => ({
  id: `curated-${curated.id}`,
  _curatedDbId: curated.id,
  name: curated.name,
  url: curated.ticket_url || null,
  dates: { start: { localDate: curated.gig_date } },
  _embedded: {
    venues: [
      {
        name: curated.venue_name,
        address: curated.venue_address ? { line1: curated.venue_address } : null,
      },
    ],
    attractions: [],
  },
  images: curated.image_url ? [{ url: curated.image_url, ratio: "16_9" }] : [],
  _curated_created_at: curated.created_at,
  _curated_artist_name: curated.artist_name || null,
  _curated_youtube_video_id: curated.youtube_video_id || null,
});

const trimGigForPayload = (gig: any) => ({
  name: gig.name,
  dates: gig.dates,
  _embedded: {
    venues: gig._embedded?.venues?.map((v: any) => ({ name: v.name })) || [],
    attractions:
      gig._embedded?.attractions?.map((a: any) => ({
        name: a.name,
        classifications: a.classifications,
      })) || [],
  },
  _curated_artist_name: gig._curated_artist_name || null,
  _curated_youtube_video_id: gig._curated_youtube_video_id || null,
});

// ============================================================================
// Main Component
// ============================================================================

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [gigs, setGigs] = useState<any[]>([]);
  const [isBuildingMixtape, setIsBuildingMixtape] = useState(false);
  const [mixtapeUrl, setMixtapeUrl] = useState<string | null>(null);
  const [mixtapeStats, setMixtapeStats] = useState<{
    tracksAdded: number;
    totalArtists: number;
    missed: string[];
  } | null>(null);
  const [weeklyNote, setWeeklyNote] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [rsvps, setRsvps] = useState<Set<string>>(new Set());
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, number>>({});
  const [viewingGig, setViewingGig] = useState<any>(null);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [hidingGigId, setHidingGigId] = useState<string | null>(null);

  const isAdmin = user?.id === ADMIN_USER_ID;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const loadRsvps = async (gigList: any[]) => {
    const gigIds = gigList.map((g: any) => g.id);
    const { data: allRsvps } = await supabase
      .from("gig_rsvps")
      .select("gig_id")
      .in("gig_id", gigIds);
    const counts: Record<string, number> = {};
    allRsvps?.forEach((r) => {
      counts[r.gig_id] = (counts[r.gig_id] || 0) + 1;
    });
    setRsvpCounts(counts);

    if (user) {
      const { data: myRsvps } = await supabase
        .from("gig_rsvps")
        .select("gig_id")
        .eq("user_id", user.id)
        .in("gig_id", gigIds);
      setRsvps(new Set(myRsvps?.map((r) => r.gig_id) || []));
    }
  };

  const toggleRsvp = async (gig: any) => {
    if (!user) {
      window.location.href = "/auth";
      return;
    }
    const gigId = gig.id;
    if (rsvps.has(gigId)) {
      // Un-RSVP: delete gig_rsvps row. The ON DELETE CASCADE on scrapbook_entries.rsvp_id
      // will automatically remove the corresponding scrapbook entry.
      await supabase.from("gig_rsvps").delete().match({ user_id: user.id, gig_id: gigId });
      rsvps.delete(gigId);
      setRsvps(new Set(rsvps));
      setRsvpCounts((prev) => ({ ...prev, [gigId]: (prev[gigId] || 1) - 1 }));
    } else {
      // RSVP: insert gig_rsvps row, then auto-create a placeholder scrapbook entry
      // linked to it. The .select().single() chain returns the new row so we can
      // reference its id.
      const { data: rsvpData, error: rsvpError } = await supabase
        .from("gig_rsvps")
        .insert({
          user_id: user.id,
          gig_id: gigId,
          gig_name: gig.name,
          gig_date: gig.dates?.start?.localDate || null,
          venue_name: gig._embedded?.venues?.[0]?.name || null,
        })
        .select()
        .single();

      if (!rsvpError && rsvpData) {
        // Fire and forget. If this fails the RSVP still succeeded; the user
        // just won't have a scrapbook entry auto-created. Safe failure mode.
        supabase
          .from("scrapbook_entries")
          .insert({
            user_id: user.id,
            rsvp_id: rsvpData.id,
            gig_id: gigId,
            gig_name: gig.name,
            gig_date: gig.dates?.start?.localDate || null,
            venue_name: gig._embedded?.venues?.[0]?.name || null,
            visibility: "friends",
          })
          .then(({ error }) => {
            if (error) console.error("Failed to create scrapbook entry:", error);
          });
      }

      rsvps.add(gigId);
      setRsvps(new Set(rsvps));
      setRsvpCounts((prev) => ({ ...prev, [gigId]: (prev[gigId] || 0) + 1 }));
    }
  };

  const viewAttendees = async (gig: any) => {
    setViewingGig(gig);
    setLoadingAttendees(true);
    const { data } = await supabase
      .from("gig_rsvps")
      .select("user_id, profiles(display_name, bio, favourite_genres, favourite_venues)")
      .eq("gig_id", gig.id);
    setAttendees(data || []);
    setLoadingAttendees(false);
  };

  const hideGig = async (gig: any) => {
    if (!isAdmin) return;
    const isCurated = gig.id.startsWith("curated-");
    const confirmMsg = isCurated
      ? `Delete "${gig.name}" from curated gigs?`
      : `Hide "${gig.name}" from all users?`;
    if (!confirm(confirmMsg)) return;

    setHidingGigId(gig.id);

    try {
      if (isCurated) {
        await supabase.from("curated_gigs").delete().eq("id", gig._curatedDbId);
      } else {
        await supabase.from("hidden_events").insert({
          event_id: gig.id,
          event_name: gig.name,
          hidden_by: user.id,
        });
      }
      setGigs((prev) => prev.filter((g) => g.id !== gig.id));
    } catch (err) {
      console.error("Failed to hide gig:", err);
      alert("Failed to hide gig. Try again.");
    } finally {
      setHidingGigId(null);
    }
  };

  const preWarmArtists = (gigList: any[]) => {
    const trimmed = gigList.map(trimGigForPayload);
    fetch("/api/pre-warm-artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gigs: trimmed }),
    }).catch(() => {});
  };

  useEffect(() => {
    const stashedGigs = sessionStorage.getItem("otoki_recovery_gigs");
    if (stashedGigs) {
      try {
        const parsedGigs = JSON.parse(stashedGigs);
        setGigs(parsedGigs);
        setShowDashboard(true);
        sessionStorage.removeItem("otoki_recovery_gigs");
        preWarmArtists(parsedGigs);
      } catch (error) {
        console.error("Failed to parse recovered gigs:", error);
      }
    }
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMixtapeUrl(null);
    setMixtapeStats(null);

    const { from, to } = getDateRange();

    try {
      const [tmResponse, curatedResponse, hiddenResponse, noteResponse] = await Promise.all([
        fetch(`/api/gigs?from=${from}&to=${to}`),
        supabase
          .from("curated_gigs")
          .select("*")
          .gte("gig_date", from)
          .lte("gig_date", to),
        supabase
          .from("hidden_events")
          .select("event_id")
          .eq("hidden_by", ADMIN_USER_ID),
        supabase
          .from("weekly_notes")
          .select("note")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const tmData = await tmResponse.json();
      const liveEvents = tmData._embedded?.events || [];
      const curatedRaw = curatedResponse.data || [];
      const hiddenIds = new Set(
        (hiddenResponse.data || []).map((h: any) => h.event_id)
      );

      // Set editorial note
      if (noteResponse.data && noteResponse.data.length > 0) {
        setWeeklyNote(noteResponse.data[0].note);
      }

      const curatedReshaped = curatedRaw.map(curatedGigToTicketmasterShape);

      const allGigs = [...curatedReshaped, ...liveEvents];
      const uniqueGigs = Array.from(
        new Map(allGigs.map((gig: any) => [gig.name.toLowerCase(), gig])).values()
      ).filter((gig: any) => !hiddenIds.has(gig.id));

      setGigs(uniqueGigs);
      setShowDashboard(true);
      loadRsvps(uniqueGigs);
      preWarmArtists(uniqueGigs);
    } catch (error) {
      console.error("Error fetching gigs:", error);
      alert("Whoops, couldn't grab the gigs. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBuildMixtape = async () => {
    setIsBuildingMixtape(true);
    setMixtapeUrl(null);
    setMixtapeStats(null);

    const { from, to } = getDateRange();

    try {
      const trimmedGigs = gigs.map(trimGigForPayload);

      const response = await fetch("/api/yt-mixtape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gigs: trimmedGigs,
          dateRange: { from, to },
        }),
      });

      if (response.status === 401) {
        sessionStorage.setItem("otoki_recovery_gigs", JSON.stringify(gigs));
        window.location.href = "/api/yt-login";
        return;
      }

      const data = await response.json();

      if (data.url) {
        setMixtapeUrl(data.url);
        setMixtapeStats({
          tracksAdded: data.tracksAdded || 0,
          totalArtists: data.totalArtists || 0,
          missed: data.missed || [],
        });
      } else if (data.tracksAdded === 0) {
        setMixtapeStats({
          tracksAdded: 0,
          totalArtists: data.totalArtists || 0,
          missed: data.missed || [],
        });
        alert("No matching tracks found for these gigs.");
      } else {
        alert("Something went wrong building the mixtape.");
      }
    } catch (error) {
      console.error("Crashed while building:", error);
      alert("Crashed while building.");
    } finally {
      setIsBuildingMixtape(false);
    }
  };

  // ==========================================================================
  // DASHBOARD VIEW
  // ==========================================================================

  if (showDashboard) {
    const groupedGigs = groupGigsByDay(gigs);

    return (
      <main className="min-h-screen text-white" style={{ backgroundColor: "#0A0A0A" }}>
        {/* ================ ATTENDEES MODAL ================ */}
        {viewingGig && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
            onClick={() => setViewingGig(null)}
          >
            <div
              className="w-full max-w-md max-h-[85vh] overflow-y-auto p-6"
              style={{
                backgroundColor: "#171717",
                borderTopLeftRadius: "24px",
                borderTopRightRadius: "24px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="pr-4">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                    style={{ color: "#525252" }}
                  >
                    Who's going to
                  </p>
                  <h3 className="text-[24px] font-extrabold tracking-[-0.01em] leading-[1.15]">
                    {viewingGig.name}
                  </h3>
                  <p className="text-[14px] mt-1" style={{ color: "#A3A3A3" }}>
                    {viewingGig.dates?.start?.localDate
                      ? new Date(viewingGig.dates.start.localDate + "T00:00:00").toLocaleDateString(
                          "en-AU",
                          { weekday: "short", day: "numeric", month: "short" }
                        )
                      : ""}{" "}
                    · {viewingGig._embedded?.venues?.[0]?.name || "Venue TBA"}
                  </p>
                </div>
                <button
                  onClick={() => setViewingGig(null)}
                  className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
                >
                  <X size={18} />
                </button>
              </div>

              <p
                className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-4"
                style={{ color: "#FF0033" }}
              >
                {attendees.length} {attendees.length === 1 ? "person" : "people"} going
              </p>

              {loadingAttendees ? (
                <p className="text-center py-8" style={{ color: "#525252" }}>
                  Loading...
                </p>
              ) : attendees.length === 0 ? (
                <p className="text-center py-8" style={{ color: "#525252" }}>
                  No one yet — be the first!
                </p>
              ) : (
                <div className="space-y-3">
                  {attendees.map((a: any, i: number) => (
                    <div key={i} className="p-4 rounded-2xl" style={{ backgroundColor: "#0A0A0A" }}>
                      <a
                        href={`/profile/${a.user_id}`}
                        className="text-[16px] font-bold transition-colors"
                        style={{ color: "#FAFAFA" }}
                      >
                        {a.profiles?.display_name || "Anonymous"}
                      </a>
                      {a.profiles?.bio && (
                        <p className="text-[14px] mt-1" style={{ color: "#A3A3A3" }}>
                          {a.profiles.bio}
                        </p>
                      )}
                      {a.profiles?.favourite_genres?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {a.profiles.favourite_genres.map((g: string) => (
                            <span
                              key={g}
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================ HEADER ================ */}
        <div className="px-6 pt-12 pb-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
            style={{ color: "#525252" }}
          >
            This week
          </p>
          <h1
            className="font-black leading-[0.95] tracking-[-0.03em]"
            style={{ fontSize: "48px" }}
          >
            GIGS IN<br />
            NAARM
          </h1>
        </div>

        {/* ================ EDITORIAL BANNER ================ */}
        {weeklyNote && (
          <div className="px-6 pt-4 pb-2">
            <p
              className="text-[15px] leading-[1.5] italic"
              style={{ color: "#A3A3A3" }}
            >
              "{weeklyNote}"
            </p>
          </div>
        )}

        {/* ================ STICKY MIXTAPE BAR ================ */}
        <div
          className="sticky top-0 z-30 px-6 py-4"
          style={{
            backgroundColor: "#0A0A0A",
            borderBottom: "1px solid #171717",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
          }}
        >
          {mixtapeUrl ? (
            <div>
              <a
                href={mixtapeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center font-extrabold text-[15px] rounded-full py-4 tracking-wide transition-colors"
                style={{
                  backgroundColor: "#FF0033",
                  color: "#FFFFFF",
                  boxShadow: "0 8px 32px rgba(255, 0, 51, 0.25)",
                }}
              >
                OPEN IN YOUTUBE MUSIC ↗
              </a>
              {/* Admin-only debug stats */}
              {isAdmin && mixtapeStats && (
                <p
                  className="text-center text-[11px] mt-2 font-semibold"
                  style={{ color: "#525252" }}
                >
                  {mixtapeStats.tracksAdded} of {mixtapeStats.totalArtists} artists matched
                  {mixtapeStats.missed.length > 0 && (
                    <span> · Missed: {mixtapeStats.missed.join(", ")}</span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={handleBuildMixtape}
              disabled={isBuildingMixtape}
              className="w-full font-extrabold text-[15px] rounded-full py-4 tracking-wide transition-colors"
              style={{
                backgroundColor: isBuildingMixtape ? "#262626" : "#FF0033",
                color: isBuildingMixtape ? "#525252" : "#FFFFFF",
                boxShadow: isBuildingMixtape ? "none" : "0 8px 32px rgba(255, 0, 51, 0.25)",
                cursor: isBuildingMixtape ? "not-allowed" : "pointer",
              }}
            >
              {isBuildingMixtape ? "BUILDING MIXTAPE..." : "BUILD MIXTAPE FROM THESE GIGS"}
            </button>
          )}
        </div>

        {/* ================ GIG LIST ================ */}
        <div className="px-6 py-6 space-y-10">
          {groupedGigs.length === 0 ? (
            <p className="text-center py-12" style={{ color: "#525252" }}>
              No gigs this week.
            </p>
          ) : (
            groupedGigs.map((group) => (
              <section key={group.label} className="space-y-4">
                <h2
                  className="font-black tracking-[-0.02em] leading-[1.05]"
                  style={{
                    fontSize: "32px",
                    color: group.label === "TONIGHT" ? "#FF0033" : "#FAFAFA",
                  }}
                >
                  {group.label}
                </h2>

                <div className="space-y-3">
                  {group.gigs.map((gig: any) => {
                    const dateInfo = formatGigDate(gig.dates?.start?.localDate);
                    const isGoing = rsvps.has(gig.id);
                    const count = rsvpCounts[gig.id] || 0;
                    const isNew = isRecentlyAdded(gig._curated_created_at);
                    const isHiding = hidingGigId === gig.id;

                    return (
                      <article
                        key={gig.id}
                        className="relative overflow-hidden"
                        style={{
                          backgroundColor: "#171717",
                          borderRadius: "16px",
                          borderLeft: isGoing ? "3px solid #FF0033" : "3px solid transparent",
                          opacity: isHiding ? 0.4 : 1,
                          transition: "opacity 150ms",
                        }}
                      >
                        {isAdmin && (
                          <button
                            onClick={() => hideGig(gig)}
                            disabled={isHiding}
                            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                            style={{
                              backgroundColor: "rgba(10, 10, 10, 0.6)",
                              color: "#525252",
                              cursor: isHiding ? "not-allowed" : "pointer",
                            }}
                            aria-label="Hide this gig"
                          >
                            <EyeOff size={14} />
                          </button>
                        )}

                        <div
                          className="flex items-start gap-4 p-5 pb-3"
                          style={{ paddingRight: isAdmin ? "48px" : "20px" }}
                        >
                          <div
                            className="shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2.5"
                            style={{ backgroundColor: "#0A0A0A", minWidth: "56px" }}
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
                            <div className="flex items-start gap-2">
                              <h3
                                className="font-extrabold tracking-[-0.01em] leading-[1.2] flex-1"
                                style={{ fontSize: "18px", color: "#FAFAFA" }}
                              >
                                {gig.name}
                              </h3>
                              {isNew && (
                                <span
                                  className="shrink-0 text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full mt-1"
                                  style={{
                                    backgroundColor: "#FF0033",
                                    color: "#FFFFFF",
                                    letterSpacing: "0.1em",
                                  }}
                                >
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] mt-1" style={{ color: "#A3A3A3" }}>
                              {gig._embedded?.venues?.[0]?.name || "Venue TBA"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 px-5 pb-5" style={{ paddingTop: "4px" }}>
                          <button
                            onClick={() => toggleRsvp(gig)}
                            className="font-bold text-[12px] uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
                            style={{
                              backgroundColor: isGoing ? "#FF0033" : "#262626",
                              color: isGoing ? "#FFFFFF" : "#A3A3A3",
                            }}
                          >
                            {isGoing ? "GOING ✓" : "I'M GOING"}
                          </button>

                          {count > 0 && (
                            <button
                              onClick={() => viewAttendees(gig)}
                              className="font-bold text-[12px] px-3 py-2 rounded-full transition-colors"
                              style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
                            >
                              {count} going
                            </button>
                          )}

                          <div className="flex-1" />

                          {gig.url && (
                            <a
                              href={gig.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-[12px] uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
                              style={{ backgroundColor: "#FAFAFA", color: "#0A0A0A" }}
                            >
                              Tickets
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    );
  }

  // ==========================================================================
  // LANDING VIEW
  // ==========================================================================

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center text-white p-6"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      <div className="max-w-md w-full space-y-12">
        <div className="text-center space-y-3">
          <h1
            className="font-black tracking-[-0.04em] leading-[0.9]"
            style={{ fontSize: "72px" }}
          >
            OTOKI
          </h1>
          <p className="text-[16px] font-medium" style={{ color: "#A3A3A3" }}>
            Hear who's playing near you this week.
          </p>
          {!user && (
            <div className="pt-2">
              <a
                href="/auth"
                className="text-[13px] font-semibold transition-colors"
                style={{ color: "#525252" }}
              >
                Sign in →
              </a>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.1em] block"
              style={{ color: "#525252" }}
            >
              Location
            </label>
            <div
              className="w-full text-[15px] font-medium rounded-xl px-4 py-4"
              style={{
                backgroundColor: "#171717",
                border: "1px solid #262626",
                color: "#FAFAFA",
              }}
            >
              Naarm / Melbourne
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full font-extrabold text-[15px] rounded-full py-5 tracking-wide transition-colors mt-2"
            style={{
              backgroundColor: isGenerating ? "#262626" : "#FF0033",
              color: isGenerating ? "#525252" : "#FFFFFF",
              boxShadow: isGenerating ? "none" : "0 8px 32px rgba(255, 0, 51, 0.3)",
              cursor: isGenerating ? "not-allowed" : "pointer",
            }}
          >
            {isGenerating ? "FINDING GIGS..." : "FIND GIGS"}
          </button>
        </div>

        <div className="text-center pt-4">
          <a
            href="/privacy"
            className="text-[11px] transition-colors"
            style={{ color: "#525252" }}
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </main>
  );
}
