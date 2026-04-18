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
};

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

      // Show only gigs that have already happened.
      // A gig on today's date is still "upcoming" until tomorrow morning,
      // which lines up with the planned "How was last night?" nudge.
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("scrapbook_entries")
        .select("id, gig_name, gig_date, venue_name, memory, visibility")
        .eq("user_id", user.id)
        .lt("gig_date", today)
        .order("gig_date", { ascending: false, nullsFirst: false });

      console.log("[scrapbook] loaded", {
        userId: user.id,
        today,
        count: data?.length,
        error,
      });

      if (error) {
        console.error("[scrapbook] query error:", error);
      }

      if (data) setEntries(data as Entry[]);
      setLoading(false);
    };
    load();
  }, []);

  const formatDate = (d: string | null) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
    >
      <div className="max-w-md mx-auto px-6 pt-12 pb-24">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tighter">SCRAPBOOK</h1>
          <p className="text-sm mt-1" style={{ color: "#A3A3A3" }}>
            Your gigs, remembered.
          </p>
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
            <p
              className="font-semibold mb-2"
              style={{ color: "#FAFAFA" }}
            >
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
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {entries.map((entry) => (
              <a
                key={entry.id}
                href={`/scrapbook/${entry.id}`}
                className="rounded-xl p-4 block transition-colors hover:bg-neutral-800"
                style={{
                  backgroundColor: "#171717",
                  border: "1px solid #262626",
                  aspectRatio: "1 / 1",
                }}
              >
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <p
                      className="font-bold text-sm leading-tight line-clamp-3"
                      style={{ color: "#FAFAFA" }}
                    >
                      {entry.gig_name || "Untitled gig"}
                    </p>
                    {entry.venue_name && (
                      <p
                        className="text-xs mt-1 line-clamp-1"
                        style={{ color: "#A3A3A3" }}
                      >
                        {entry.venue_name}
                      </p>
                    )}
                  </div>
                  <div>
                    {entry.memory ? (
                      <p
                        className="text-xs line-clamp-2 mb-2"
                        style={{ color: "#A3A3A3" }}
                      >
                        {entry.memory}
                      </p>
                    ) : (
                      <p
                        className="text-xs mb-2"
                        style={{ color: "#525252" }}
                      >
                        Add a memory →
                      </p>
                    )}
                    <p
                      className="text-[10px] font-semibold tracking-wider uppercase"
                      style={{ color: "#525252" }}
                    >
                      {formatDate(entry.gig_date)}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
