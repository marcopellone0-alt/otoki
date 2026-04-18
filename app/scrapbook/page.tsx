"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Entry = {
  id: string;
  gig_name: string | null;
  gig_date: string | null;
  venue_name: string | null;
  memory: string | null;
  visibility: "public" | "friends" | "private";
  photos: string[]; // ordered by position asc, max 6
};

const FONT_STACK_SERIF =
  "var(--font-serif), Georgia, 'Times New Roman', serif";

export default function ScrapbookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) console.error("[scrapbook] auth error:", authError);
      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const today = new Date().toISOString().split("T")[0];

      const { data: entriesData, error: entriesError } = await supabase
        .from("scrapbook_entries")
        .select("id, gig_name, gig_date, venue_name, memory, visibility")
        .eq("user_id", user.id)
        .lt("gig_date", today)
        .order("gig_date", { ascending: false, nullsFirst: false });

      if (entriesError) {
        console.error("[scrapbook] query error:", entriesError);
        setLoading(false);
        return;
      }

      const list = (entriesData || []) as Omit<Entry, "photos">[];

      if (list.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const { data: photosData, error: photosError } = await supabase
        .from("scrapbook_photos")
        .select("entry_id, photo_url, position")
        .in(
          "entry_id",
          list.map((e) => e.id)
        )
        .order("position", { ascending: true });

      if (photosError) {
        console.error("[scrapbook] photos query error:", photosError);
      }

      const photosByEntry = new Map<string, string[]>();
      (photosData || []).forEach((p: any) => {
        if (!photosByEntry.has(p.entry_id)) photosByEntry.set(p.entry_id, []);
        photosByEntry.get(p.entry_id)!.push(p.photo_url);
      });

      const withPhotos: Entry[] = list.map((e) => ({
        ...e,
        photos: photosByEntry.get(e.id) || [],
      }));

      setEntries(withPhotos);
      setLoading(false);
    };
    load();
  }, []);

  const formatDateLine = (d: string | null, venue: string | null) => {
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
  };

  const headerSummary = () => {
    if (entries.length === 0) return { count: 0, range: "" };
    const dates = entries
      .map((e) => e.gig_date)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d));

    if (dates.length === 0) return { count: entries.length, range: "" };

    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));

    const sameMonth =
      earliest.getMonth() === latest.getMonth() &&
      earliest.getFullYear() === latest.getFullYear();
    const sameYear = earliest.getFullYear() === latest.getFullYear();

    if (sameMonth) {
      return {
        count: entries.length,
        range: `from ${latest.toLocaleDateString("en-AU", {
          month: "long",
          year: "numeric",
        })}.`,
      };
    }
    if (sameYear) {
      return {
        count: entries.length,
        range: `across ${latest.getFullYear()}.`,
      };
    }
    return {
      count: entries.length,
      range: `across ${earliest.getFullYear()}–${latest.getFullYear()}.`,
    };
  };

  const summary = headerSummary();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
    >
      <div className="max-w-md mx-auto px-6 pt-12 pb-24">
        {/* Scrapbook header */}
        <div style={{ marginBottom: "40px" }}>
          <p
            className="text-[10px] font-semibold tracking-[0.15em] uppercase"
            style={{ color: "#525252", marginBottom: "4px" }}
          >
            Scrapbook
          </p>
          {loading ? (
            <h1
              className="font-medium tracking-tight leading-none"
              style={{ fontSize: "32px", color: "#FAFAFA" }}
            >
              Loading…
            </h1>
          ) : summary.count === 0 ? (
            <h1
              className="font-medium tracking-tight leading-none"
              style={{ fontSize: "32px", color: "#FAFAFA" }}
            >
              Your gigs,
              <br />
              remembered.
            </h1>
          ) : (
            <>
              <h1
                className="font-medium tracking-tight leading-none"
                style={{ fontSize: "32px", color: "#FAFAFA" }}
              >
                {summary.count} {summary.count === 1 ? "gig" : "gigs"}
              </h1>
              {summary.range && (
                <p
                  className="text-sm"
                  style={{ color: "#A3A3A3", marginTop: "4px" }}
                >
                  {summary.range}
                </p>
              )}
            </>
          )}
        </div>

        {!loading && entries.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
            }}
          >
            <p className="font-semibold mb-2" style={{ color: "#FAFAFA" }}>
              Nothing to remember yet.
            </p>
            <p className="text-sm" style={{ color: "#A3A3A3" }}>
              Your scrapbook fills up after you go to gigs. RSVP to something,
              show up, and it'll land here the morning after.
            </p>
            <a
              href="/"
              className="inline-block mt-6 px-5 py-2 rounded-full font-bold text-sm"
              style={{ backgroundColor: "#FAFAFA", color: "#0A0A0A" }}
            >
              Find a gig
            </a>
          </div>
        )}

        {!loading &&
          entries.map((entry, i) => (
            <EntryBlock
              key={entry.id}
              entry={entry}
              formatDateLine={formatDateLine}
              isFirst={i === 0}
            />
          ))}
      </div>
    </main>
  );
}

function EntryBlock({
  entry,
  formatDateLine,
  isFirst,
}: {
  entry: Entry;
  formatDateLine: (d: string | null, v: string | null) => string;
  isFirst: boolean;
}) {
  return (
    <a
      href={`/scrapbook/${entry.id}`}
      className="block"
      style={{
        marginBottom: "48px",
        paddingTop: isFirst ? 0 : "32px",
        borderTop: isFirst ? "none" : "0.5px solid #262626",
      }}
    >
      {/* Date + venue label */}
      <p
        className="text-[10px] font-semibold tracking-[0.15em] uppercase"
        style={{ color: "#525252", marginBottom: "4px" }}
      >
        {formatDateLine(entry.gig_date, entry.venue_name) || "Date unknown"}
      </p>

      {/* Gig title */}
      <h2
        className="font-medium tracking-tight"
        style={{
          fontSize: "24px",
          color: "#FAFAFA",
          lineHeight: "1.15",
          letterSpacing: "-0.015em",
          marginBottom: "16px",
        }}
      >
        {entry.gig_name || "Untitled gig"}
      </h2>

      {/* Photos — explicit bottom margin on the wrapper, not inside PhotoLayout */}
      {entry.photos.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <PhotoLayout photos={entry.photos} />
        </div>
      )}

      {/* Memory — forced top margin ensures separation from photos even if
          the parent flow tries to collapse. */}
      {entry.memory ? (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "17px",
            color: "#D4D4D4",
            lineHeight: "1.6",
            margin: 0,
            marginTop: entry.photos.length > 0 ? "4px" : 0,
          }}
        >
          {entry.memory}
        </p>
      ) : (
        <p
          className="text-sm italic"
          style={{ color: "#525252", margin: 0 }}
        >
          Add a memory →
        </p>
      )}
    </a>
  );
}

/**
 * Composition varies by photo count — see comments inside.
 * This function now only renders the photo grid itself; the parent is
 * responsible for bottom margin.
 */
function PhotoLayout({ photos }: { photos: string[] }) {
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
    return <div style={{ height: "220px" }}>{img(photos[0])}</div>;
  }

  if (photos.length === 2) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px",
          height: "160px",
        }}
      >
        <div>{img(photos[0])}</div>
        <div>{img(photos[1])}</div>
      </div>
    );
  }

  if (photos.length === 3) {
    return (
      <div>
        <div style={{ height: "200px", marginBottom: "6px" }}>
          {img(photos[0])}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            height: "110px",
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
      <div>
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

  // 6 photos
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: "6px",
        height: "220px",
      }}
    >
      {photos.slice(0, 6).map((p, i) => (
        <div key={i}>{img(p)}</div>
      ))}
    </div>
  );
}
