"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../../../lib/supabase";

type Entry = {
  id: string;
  gig_name: string | null;
  gig_date: string | null;
  venue_name: string | null;
  memory: string | null;
  photos: string[];
  companions: string[];
};

type Chapter = {
  key: string;
  label: string;
  year: number;
  entries: Entry[];
};

const FONT_STACK_SERIF =
  "var(--font-serif), Georgia, 'Times New Roman', serif";

function formatDateLine(d: string | null, venue: string | null) {
  const parts: string[] = [];
  if (d) {
    const date = new Date(d);
    parts.push(
      date.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    );
  }
  if (venue) parts.push(venue);
  return parts.join(" · ");
}

function formatCompanionByline(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `with ${names[0]}`;
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(", ");
  return `with ${rest} and ${last}`;
}

export default function PublicUserScrapbookPage() {
  const params = useParams();
  const ownerId = params.id as string;

  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [showYearJumper, setShowYearJumper] = useState(false);

  const yearRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // Asymmetric block check via SECURITY DEFINER rpc.
      // Hide only if the OWNER blocked the VIEWER (so the blocker can still
      // see content of users they've blocked, to manage the relationship).
      if (user && user.id !== ownerId) {
        const { data: blockedByOwner } = await supabase.rpc(
          "user_has_blocked",
          {
            blocker_user_id: ownerId,
            blocked_user_id: user.id,
          }
        );
        if (blockedByOwner === true) {
          setBlocked(true);
          setLoading(false);
          return;
        }
      }

      const today = new Date().toISOString().split("T")[0];

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", ownerId)
        .maybeSingle();
      setOwnerName(profile?.display_name || "Someone");

      const { data: entriesData, error } = await supabase
        .from("scrapbook_entries")
        .select("id, gig_name, gig_date, venue_name, memory")
        .eq("user_id", ownerId)
        .eq("visibility", "public")
        .lt("gig_date", today)
        .order("gig_date", { ascending: false, nullsFirst: false });

      if (error) {
        console.error("[public-scrapbook-full] entries error:", error);
        setLoading(false);
        return;
      }

      const list = (entriesData || []) as Omit<Entry, "photos" | "companions">[];

      if (list.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const entryIds = list.map((e) => e.id);

      const [{ data: photosData }, { data: companionsData }] =
        await Promise.all([
          supabase
            .from("scrapbook_photos")
            .select("entry_id, photo_url, position")
            .in("entry_id", entryIds)
            .order("position", { ascending: true }),
          supabase
            .from("scrapbook_companions")
            .select("entry_id, tagged_user_id, tagged_name, created_at")
            .in("entry_id", entryIds)
            .order("created_at", { ascending: true }),
        ]);

      const photosByEntry = new Map<string, string[]>();
      (photosData || []).forEach((p: any) => {
        if (!photosByEntry.has(p.entry_id)) photosByEntry.set(p.entry_id, []);
        photosByEntry.get(p.entry_id)!.push(p.photo_url);
      });

      const userIds = (companionsData || [])
        .map((c: any) => c.tagged_user_id)
        .filter((id: string | null): id is string => !!id);

      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        (profiles || []).forEach((p: any) => {
          profileMap.set(p.id, p.display_name || "Someone");
        });
      }

      const companionsByEntry = new Map<string, string[]>();
      (companionsData || []).forEach((c: any) => {
        const name = c.tagged_user_id
          ? profileMap.get(c.tagged_user_id) || "Someone"
          : c.tagged_name || "Someone";
        if (!companionsByEntry.has(c.entry_id))
          companionsByEntry.set(c.entry_id, []);
        companionsByEntry.get(c.entry_id)!.push(name);
      });

      setEntries(
        list.map((e) => ({
          ...e,
          photos: photosByEntry.get(e.id) || [],
          companions: companionsByEntry.get(e.id) || [],
        }))
      );
      setLoading(false);
    };
    load();
  }, [ownerId]);

  const chapters = useMemo<Chapter[]>(() => {
    const byMonth = new Map<string, Chapter>();

    entries.forEach((entry) => {
      if (!entry.gig_date) return;
      const date = new Date(entry.gig_date);
      const year = date.getFullYear();
      const monthIdx = date.getMonth();
      const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-AU", {
        month: "long",
        year: "numeric",
      });

      if (!byMonth.has(key)) {
        byMonth.set(key, { key, label, year, entries: [] });
      }
      byMonth.get(key)!.entries.push(entry);
    });

    return Array.from(byMonth.values()).sort((a, b) =>
      b.key.localeCompare(a.key)
    );
  }, [entries]);

  const years = useMemo(() => {
    const set = new Set<number>();
    chapters.forEach((c) => set.add(c.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [chapters]);

  useEffect(() => {
    setShowYearJumper(years.length >= 2);
  }, [years]);

  const jumpToYear = (year: number) => {
    const el = yearRefs.current[String(year)];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  if (!loading && blocked) {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
      >
        <p style={{ color: "#525252" }}>Profile not found.</p>
        <a
          href="/"
          className="text-sm mt-4"
          style={{ color: "#A3A3A3" }}
        >
          ← Back to gigs
        </a>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
    >
      <div className="max-w-md mx-auto px-6 pt-8 pb-24">
        <a
          href={`/profile/${ownerId}`}
          className="inline-flex items-center gap-2 text-sm"
          style={{ color: "#A3A3A3" }}
        >
          <ArrowLeft size={16} />
          Back to {ownerName || "profile"}
        </a>

        <div style={{ marginTop: "24px", marginBottom: "32px" }}>
          <p
            className="text-[10px] font-semibold tracking-[0.15em] uppercase"
            style={{ color: "#525252", marginBottom: "4px" }}
          >
            {ownerName ? `${ownerName}'s` : "Their"}
          </p>
          <h1
            className="font-black tracking-tighter leading-none"
            style={{ fontSize: "32px", color: "#FAFAFA" }}
          >
            SCRAPBOOK
          </h1>
        </div>

        {loading ? (
          <p style={{ color: "#525252" }}>Loading…</p>
        ) : entries.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
            }}
          >
            <p className="font-semibold mb-2" style={{ color: "#FAFAFA" }}>
              Nothing public to show.
            </p>
            <p className="text-sm" style={{ color: "#A3A3A3" }}>
              {ownerName || "They"} hasn't shared any public entries yet.
            </p>
          </div>
        ) : (
          chapters.map((chapter, chapterIndex) => {
            const prevChapter = chapters[chapterIndex - 1];
            const isFirstOfYear =
              !prevChapter || prevChapter.year !== chapter.year;

            return (
              <section key={chapter.key} style={{ marginBottom: "24px" }}>
                <div
                  ref={(el) => {
                    if (isFirstOfYear) {
                      yearRefs.current[String(chapter.year)] = el;
                    }
                  }}
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: "#0A0A0A",
                    paddingTop: "16px",
                    paddingBottom: "12px",
                    marginBottom: "16px",
                    marginLeft: "-24px",
                    marginRight: "-24px",
                    paddingLeft: "24px",
                    paddingRight: "24px",
                    borderBottom: "0.5px solid #262626",
                  }}
                >
                  <p
                    className="text-[11px] font-semibold tracking-[0.15em] uppercase"
                    style={{ color: "#A3A3A3", margin: 0 }}
                  >
                    {chapter.label}
                  </p>
                </div>

                {chapter.entries.map((entry, entryIndex) => (
                  <EntryBlock
                    key={entry.id}
                    entry={entry}
                    isFirstInChapter={entryIndex === 0}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>

      {showYearJumper && !loading && (
        <div
          style={{
            position: "fixed",
            bottom: "88px",
            right: "16px",
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "6px",
            borderRadius: "999px",
            backgroundColor: "rgba(23, 23, 23, 0.9)",
            backdropFilter: "blur(12px)",
            border: "0.5px solid #262626",
          }}
        >
          {years.map((year) => (
            <button
              key={year}
              onClick={() => jumpToYear(year)}
              style={{
                padding: "6px 10px",
                borderRadius: "999px",
                backgroundColor: "transparent",
                color: "#A3A3A3",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.05em",
                border: "none",
                cursor: "pointer",
              }}
            >
              {year}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function EntryBlock({
  entry,
  isFirstInChapter,
}: {
  entry: Entry;
  isFirstInChapter: boolean;
}) {
  const hasPhotos = entry.photos.length > 0;
  const hasCompanions = entry.companions.length > 0;

  return (
    <a
      href={`/scrapbook/${entry.id}`}
      className="block"
      style={{
        marginBottom: "40px",
        paddingTop: isFirstInChapter ? 0 : "24px",
        borderTop: isFirstInChapter ? "none" : "0.5px solid #262626",
      }}
    >
      <p
        className="text-[10px] font-semibold tracking-[0.15em] uppercase"
        style={{ color: "#525252", marginBottom: "4px" }}
      >
        {formatDateLine(entry.gig_date, entry.venue_name) || "Date unknown"}
      </p>

      <h2
        className="font-medium tracking-tight"
        style={{
          fontSize: "24px",
          color: "#FAFAFA",
          lineHeight: "1.15",
          letterSpacing: "-0.015em",
          marginBottom: hasPhotos ? "16px" : "12px",
        }}
      >
        {entry.gig_name || "Untitled gig"}
      </h2>

      {hasPhotos && <PhotoLayout photos={entry.photos} />}

      {hasCompanions && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "14px",
            color: "#A3A3A3",
            fontStyle: "italic",
            margin: 0,
            marginBottom: entry.memory ? "12px" : 0,
          }}
        >
          {formatCompanionByline(entry.companions)}
        </p>
      )}

      {entry.memory && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "17px",
            color: "#D4D4D4",
            lineHeight: "1.6",
            margin: 0,
          }}
        >
          {entry.memory}
        </p>
      )}
    </a>
  );
}

function PhotoLayout({ photos }: { photos: string[] }) {
  const SPACING = "32px";

  const img = (src: string) => (
    <img
      src={src}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "4px",
        display: "block",
      }}
    />
  );

  if (photos.length === 1) {
    return (
      <div style={{ height: "220px", marginBottom: SPACING }}>
        {img(photos[0])}
      </div>
    );
  }

  if (photos.length === 2) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px",
          height: "160px",
          marginBottom: SPACING,
        }}
      >
        <div>{img(photos[0])}</div>
        <div>{img(photos[1])}</div>
      </div>
    );
  }

  if (photos.length === 3) {
    return (
      <div style={{ marginBottom: SPACING }}>
        <div style={{ height: "200px", marginBottom: "6px" }}>
          {img(photos[0])}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            height: "140px",
          }}
        >
          <div>{img(photos[1])}</div>
          <div>{img(photos[2])}</div>
        </div>
      </div>
    );
  }

  if (photos.length === 4) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "6px",
          height: "300px",
          marginBottom: SPACING,
        }}
      >
        {photos.map((p, i) => (
          <div key={i}>{img(p)}</div>
        ))}
      </div>
    );
  }

  if (photos.length === 5) {
    return (
      <div style={{ marginBottom: SPACING }}>
        <div style={{ height: "200px", marginBottom: "6px" }}>
          {img(photos[0])}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            height: "110px",
            marginBottom: "6px",
          }}
        >
          <div>{img(photos[1])}</div>
          <div>{img(photos[2])}</div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            height: "110px",
          }}
        >
          <div>{img(photos[3])}</div>
          <div>{img(photos[4])}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "6px",
        height: "220px",
        marginBottom: SPACING,
      }}
    >
      {photos.slice(0, 6).map((p, i) => (
        <div key={i}>{img(p)}</div>
      ))}
    </div>
  );
}
