"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const FONT_STACK_SERIF =
  "var(--font-serif), Georgia, 'Times New Roman', serif";

type SharedGig = {
  gig_id: string;
  gig_name: string;
  gig_date: string; // ISO date
  venue_name: string | null;
  is_past: boolean;
};

type Props = {
  /** The profile being viewed. */
  targetUserId: string;
  /** The currently logged-in user. If null, hero is hidden entirely. */
  viewerUserId: string | null;
};

/**
 * Hybrid time formatting per locked vision:
 *   - Within last 7 days  → "last week"
 *   - 8-14 days           → "two weeks ago"
 *   - 15-30 days          → "last month"
 *   - 31+ days past       → specific date "on 11 Apr 2026"
 *   - Future, within 7d   → "this week"
 *   - Future, within 30d  → "next month"
 *   - Future, 31+ days    → specific date "on 12 Jun 2026"
 */
function formatRelativeTime(gigDate: string, isPast: boolean): string {
  const date = new Date(gigDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (isPast) {
    const daysAgo = Math.abs(diffDays);
    if (daysAgo <= 7) return "last week";
    if (daysAgo <= 14) return "two weeks ago";
    if (daysAgo <= 30) return "last month";
    // Older than 30 days → specific date
    return `on ${date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }

  // Future
  if (diffDays <= 7) return "this week";
  if (diffDays <= 30) return "next month";
  return `on ${date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

/**
 * Build the past-gigs sentence:
 *   1 gig:  "You were both at Santiago Motorizado last week."
 *   2 gigs: "You were both at Santiago Motorizado last week. And NGAIIRE the week before."
 *   3+:     "You were both at Santiago Motorizado, NGAIIRE, and 4 others."
 */
function buildPastSentence(past: SharedGig[]): string {
  if (past.length === 0) return "";
  const first = past[0];
  if (past.length === 1) {
    return `You were both at ${first.gig_name} ${formatRelativeTime(
      first.gig_date,
      true
    )}.`;
  }
  if (past.length === 2) {
    const second = past[1];
    return `You were both at ${first.gig_name} ${formatRelativeTime(
      first.gig_date,
      true
    )}. And ${second.gig_name} ${formatRelativeTime(second.gig_date, true)}.`;
  }
  // 3 or more: name the two most recent, summarise the rest.
  const second = past[1];
  const otherCount = past.length - 2;
  return `You were both at ${first.gig_name}, ${second.gig_name}, and ${otherCount} other${
    otherCount === 1 ? "" : "s"
  }.`;
}

/**
 * Build the future-gigs sentence:
 *   1 gig:  "You're both going to NGAIIRE this week."
 *   2 gigs: "You're both going to NGAIIRE this week. And Beach House next month."
 *   3+:     "You're both going to NGAIIRE, Beach House, and 2 others."
 */
function buildFutureSentence(future: SharedGig[]): string {
  if (future.length === 0) return "";
  // Sort future ascending so "soonest first" reads naturally.
  const sorted = [...future].sort((a, b) =>
    a.gig_date.localeCompare(b.gig_date)
  );
  const first = sorted[0];
  if (sorted.length === 1) {
    return `You're both going to ${first.gig_name} ${formatRelativeTime(
      first.gig_date,
      false
    )}.`;
  }
  if (sorted.length === 2) {
    const second = sorted[1];
    return `You're both going to ${first.gig_name} ${formatRelativeTime(
      first.gig_date,
      false
    )}. And ${second.gig_name} ${formatRelativeTime(second.gig_date, false)}.`;
  }
  const second = sorted[1];
  const otherCount = sorted.length - 2;
  return `You're both going to ${first.gig_name}, ${second.gig_name}, and ${otherCount} other${
    otherCount === 1 ? "" : "s"
  }.`;
}

export default function SharedHistoryHero({
  targetUserId,
  viewerUserId,
}: Props) {
  const [shared, setShared] = useState<SharedGig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerUserId) {
      setLoading(false);
      return;
    }
    // Don't compute shared history with yourself — saves a useless query.
    if (viewerUserId === targetUserId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data, error } = await supabase.rpc("get_shared_gigs", {
        viewer_id: viewerUserId,
        target_id: targetUserId,
      });
      if (error) {
        console.error("[shared-history] rpc error:", error);
        setLoading(false);
        return;
      }
      setShared((data || []) as SharedGig[]);
      setLoading(false);
    };
    load();
  }, [targetUserId, viewerUserId]);

  // Per locked vision: when zero overlap, render nothing. No empty state.
  if (loading || shared.length === 0) return null;

  const past = shared.filter((g) => g.is_past);
  const future = shared.filter((g) => !g.is_past);

  const pastSentence = buildPastSentence(past);
  const futureSentence = buildFutureSentence(future);

  return (
    <div
      style={{
        marginBottom: "32px",
        paddingBottom: "24px",
        borderBottom: "0.5px solid #262626",
      }}
    >
      {/* Future first if it exists — it's the more actionable signal */}
      {futureSentence && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "20px",
            color: "#FAFAFA",
            lineHeight: "1.45",
            margin: 0,
            marginBottom: pastSentence ? "12px" : 0,
          }}
        >
          {futureSentence}
        </p>
      )}

      {pastSentence && (
        <p
          style={{
            fontFamily: FONT_STACK_SERIF,
            fontSize: "20px",
            color: futureSentence ? "#A3A3A3" : "#FAFAFA",
            lineHeight: "1.45",
            margin: 0,
          }}
        >
          {pastSentence}
        </p>
      )}
    </div>
  );
}
