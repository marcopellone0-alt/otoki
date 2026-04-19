"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const FONT_STACK_SERIF =
  "var(--font-serif), Georgia, 'Times New Roman', serif";

const PREVIEW_LIMIT = 3;

type Entry = {
  id: string;
  gig_name: string | null;
  gig_date: string | null;
  venue_name: string | null;
  memory: string | null;
  photos: string[];
  companions: string[];
};

type Props = {
  ownerId: string;
  /** If true, render copy hints aimed at the owner ('Your featured gigs'). */
  isOwnProfile?: boolean;
};

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

export default function PublicScrapbookPreview({
  ownerId,
  isOwnProfile = false,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasFeatured, setHasFeatured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split("T")[0];

      // Total count of public past entries — for the "see all" link.
      const { count } = await supabase
        .from("scrapbook_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", ownerId)
        .eq("visibility", "public")
        .lt("gig_date", today);

      setTotalCount(count || 0);

      // Try featured entries first.
      const { data: featuredData, error: featuredError } = await supabase
        .from("scrapbook_entries")
        .select("id, gig_name, gig_date, venue_name, memory")
        .eq("user_id", ownerId)
        .eq("visibility", "public")
        .eq("featured_on_profile", true)
        .lt("gig_date", today)
        .order("gig_date", { ascending: false, nullsFirst: false })
        .limit(PREVIEW_LIMIT);

      if (featuredError) {
        console.error(
          "[public-scrapbook] featured query error:",
          featuredError
        );
      }

      let baseList = (featuredData || []) as Omit<
        Entry,
        "photos" | "companions"
      >[];
      const usingFeatured = baseList.length > 0;
      setHasFeatured(usingFeatured);

      // Fall back to most-recent if user hasn't featured anything.
      if (baseList.length === 0) {
        const { data: recentData, error: recentError } = await supabase
          .from("scrapbook_entries")
          .select("id, gig_name, gig_date, venue_name, memory")
          .eq("user_id", ownerId)
          .eq("visibility", "public")
          .lt("gig_date", today)
          .order("gig_date", { ascending: false, nullsFirst: false })
          .limit(PREVIEW_LIMIT);

        if (recentError) {
          console.error(
            "[public-scrapbook] recent fallback error:",
            recentError
          );
          setLoading(false);
          return;
        }

        baseList = (recentData || []) as Omit<Entry, "photos" | "companions">[];
      }

      if (baseList.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const entryIds = baseList.map((e) => e.id);

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
        baseList.map((e) => ({
          ...e,
          photos: photosByEntry.get(e.id) || [],
          companions: companionsByEntry.get(e.id) || [],
        }))
      );
      setLoading(false);
    };
    load();
  }, [ownerId]);

  if (loading) return null;
  if (entries.length === 0) return null;

  // Owner-facing heading nudges them toward curation.
  // Visitor-facing heading is just SCRAPBOOK.
  const heading = isOwnProfile && hasFeatured ? "FEATURED" : "SCRAPBOOK";

  return (
    <div className="px-6 pb-10">
      <div className="flex items-baseline justify-between mb-5">
        <h2
          className="font-black tracking-[-0.02em] leading-[1.05]"
          style={{ fontSize: "28px", color: "#FAFAFA" }}
        >
          {heading}
        </h2>
        {isOwnProfile && (
          <p
            className="text-[11px]"
            style={{ color: "#525252" }}
          >
            {hasFeatured
              ? "Star entries to feature them"
              : "Showing recent. Star entries to feature them"}
          </p>
        )}
      </div>

      <div>
        {entries.map((entry, i) => (
          <PreviewBlock
            key={entry.id}
            entry={entry}
            isFirst={i === 0}
          />
        ))}
      </div>

      {totalCount > entries.length && (
        <a
          href={`/scrapbook/user/${ownerId}`}
          style={{
            display: "inline-block",
            marginTop: "16px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#A3A3A3",
            textDecoration: "none",
          }}
        >
          See all {totalCount} entries →
        </a>
      )}
    </div>
  );
}

function PreviewBlock({ entry, isFirst }: { entry: Entry; isFirst: boolean }) {
  const hasPhotos = entry.photos.length > 0;
  const hasCompanions = entry.companions.length > 0;

  return (
    <a
      href={`/scrapbook/${entry.id}`}
      className="block"
      style={{
        marginBottom: "32px",
        paddingTop: isFirst ? 0 : "20px",
        borderTop: isFirst ? "none" : "0.5px solid #262626",
      }}
    >
      <p
        className="text-[10px] font-semibold tracking-[0.15em] uppercase"
        style={{ color: "#525252", marginBottom: "4px" }}
      >
        {formatDateLine(entry.gig_date, entry.venue_name) || "Date unknown"}
      </p>

      <h3
        className="font-medium tracking-tight"
        style={{
          fontSize: "20px",
          color: "#FAFAFA",
          lineHeight: "1.15",
          letterSpacing: "-0.015em",
          marginBottom: hasPhotos ? "14px" : "10px",
        }}
      >
        {entry.gig_name || "Untitled gig"}
      </h3>

      {hasPhotos && (
        <div style={{ height: "180px", marginBottom: "20px" }}>
          <img
            src={entry.photos[0]}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "4px",
              display: "block",
            }}
          />
        </div>
      )}

      {hasCompanions && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "13px",
            color: "#A3A3A3",
            fontStyle: "italic",
            margin: 0,
            marginBottom: entry.memory ? "10px" : 0,
          }}
        >
          {formatCompanionByline(entry.companions)}
        </p>
      )}

      {entry.memory && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "16px",
            color: "#D4D4D4",
            lineHeight: "1.55",
            margin: 0,
          }}
        >
          {entry.memory}
        </p>
      )}
    </a>
  );
}
