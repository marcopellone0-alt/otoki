"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import PhotoUploader from "../../components/PhotoUploader";
import CompanionTagger from "../../components/CompanionTagger";

type Entry = {
  id: string;
  user_id: string;
  gig_name: string | null;
  gig_date: string | null;
  venue_name: string | null;
  memory: string | null;
  visibility: "public" | "private";
};

const MEMORY_MAX = 280;

const FONT_STACK_SERIF =
  "var(--font-serif), Georgia, 'Times New Roman', serif";

const MEMORY_PROMPTS = [
  "What do you want to remember about this gig?",
  "What was the moment you knew this was going to be a good one?",
  "Who was with you, and what made them the right person for this show?",
  "What did the crowd feel like?",
  "What's the song you'll hear in 10 years and be taken straight back?",
  "Describe the walk home.",
  "What surprised you about the night?",
  "If you could tell someone one thing about this gig, what would it be?",
];

export default function ScrapbookEntryPage() {
  const params = useParams();
  const entryId = params.entryId as string;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [promptIndex] = useState(() =>
    Math.floor(Math.random() * MEMORY_PROMPTS.length)
  );

  const [memory, setMemory] = useState("");
  const [visibility, setVisibility] = useState<Entry["visibility"]>("public");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      const { data, error } = await supabase
        .from("scrapbook_entries")
        .select(
          "id, user_id, gig_name, gig_date, venue_name, memory, visibility"
        )
        .eq("id", entryId)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Defensive coerce: any legacy 'friends' tier becomes 'public' in the UI.
      // The backfill SQL flips these in the DB too, but this protects us if a
      // user opens the page mid-migration.
      const rawVisibility = (data as any).visibility;
      const normalisedVisibility: Entry["visibility"] =
        rawVisibility === "private" ? "private" : "public";

      const normalised: Entry = { ...(data as any), visibility: normalisedVisibility };

      setEntry(normalised);
      setIsOwner(user.id === normalised.user_id);
      setMemory(normalised.memory || "");
      setVisibility(normalised.visibility);
      setLoading(false);
    };
    load();
  }, [entryId]);

  const save = async () => {
    if (!entry || !isOwner) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from("scrapbook_entries")
      .update({
        memory: memory.trim() || null,
        visibility,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      console.error("[entry] save error:", error);
    }
  };

  const dateVenueLine = () => {
    if (!entry) return "";
    const parts: string[] = [];
    if (entry.gig_date) {
      const date = new Date(entry.gig_date);
      parts.push(
        date.toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
    }
    if (entry.venue_name) parts.push(entry.venue_name);
    return parts.join(" · ");
  };

  if (loading) {
    return (
      <main
        className="min-h-screen"
        style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
      >
        <div className="max-w-md mx-auto px-6 pt-12 pb-24">
          <p style={{ color: "#525252" }}>Loading…</p>
        </div>
      </main>
    );
  }

  if (notFound || !entry) {
    return (
      <main
        className="min-h-screen"
        style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
      >
        <div className="max-w-md mx-auto px-6 pt-12 pb-24">
          <a
            href="/scrapbook"
            className="text-sm"
            style={{ color: "#A3A3A3" }}
          >
            ← Back to scrapbook
          </a>
          <p className="mt-8" style={{ color: "#A3A3A3" }}>
            Entry not found, or you don't have permission to view it.
          </p>
        </div>
      </main>
    );
  }

  const memoryRemaining = MEMORY_MAX - memory.length;

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#0A0A0A", color: "#FAFAFA" }}
    >
      <div className="max-w-md mx-auto px-6 pt-8 pb-24">
        <a
          href="/scrapbook"
          className="text-sm"
          style={{ color: "#A3A3A3" }}
        >
          ← Back to scrapbook
        </a>

        {/* Headline block */}
        <div className="mt-8 mb-8">
          <p
            className="text-[10px] font-semibold tracking-[0.15em] uppercase mb-2"
            style={{ color: "#525252" }}
          >
            {dateVenueLine()}
          </p>
          <h1
            className="font-medium tracking-tight"
            style={{
              fontSize: "34px",
              color: "#FAFAFA",
              lineHeight: "1",
              letterSpacing: "-0.02em",
            }}
          >
            {entry.gig_name || "Untitled gig"}
          </h1>
        </div>

        {/* Photos */}
        <PhotoUploader
          entryId={entry.id}
          userId={entry.user_id}
          canEdit={isOwner}
        />

        {/* Companions — both edit and read-only modes are handled inside */}
        <CompanionTagger
          entryId={entry.id}
          ownerId={entry.user_id}
          canEdit={isOwner}
        />

        {isOwner ? (
          <>
            <div className="mb-6">
              <label
                className="block text-[10px] font-semibold tracking-[0.15em] uppercase mb-2"
                style={{ color: "#A3A3A3" }}
              >
                Memory
              </label>
              <textarea
                value={memory}
                onChange={(e) =>
                  setMemory(e.target.value.slice(0, MEMORY_MAX))
                }
                placeholder={MEMORY_PROMPTS[promptIndex]}
                rows={5}
                className="w-full rounded-xl p-4 resize-none focus:outline-none"
                style={{
                  backgroundColor: "#171717",
                  border: "1px solid #262626",
                  color: "#FAFAFA",
                  fontFamily: FONT_STACK_SERIF,
                  fontSize: "17px",
                  lineHeight: "1.6",
                }}
              />
              <p
                className="text-[11px] mt-1 text-right"
                style={{
                  color: memoryRemaining < 20 ? "#FF0033" : "#525252",
                }}
              >
                {memoryRemaining} left
              </p>
            </div>

            <div className="mb-8">
              <label
                className="block text-[10px] font-semibold tracking-[0.15em] uppercase mb-2"
                style={{ color: "#A3A3A3" }}
              >
                Who can see this
              </label>
              <div className="flex gap-2">
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className="flex-1 py-2 rounded-full text-xs font-bold capitalize transition-colors"
                    style={{
                      backgroundColor: visibility === v ? "#FAFAFA" : "#171717",
                      color: visibility === v ? "#0A0A0A" : "#A3A3A3",
                      border: "1px solid #262626",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p
                className="text-[11px] mt-2"
                style={{ color: "#525252" }}
              >
                {visibility === "public" &&
                  "Anyone can see this entry on your profile."}
                {visibility === "private" &&
                  "Only you can see this entry."}
              </p>
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="w-full py-3 rounded-full font-bold text-sm transition-colors"
              style={{
                backgroundColor: saving ? "#262626" : "#FAFAFA",
                color: saving ? "#525252" : "#0A0A0A",
              }}
            >
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          </>
        ) : (
          <>
            {entry.memory ? (
              <p
                style={{
                  fontFamily: FONT_STACK_SERIF,
                  fontSize: "17px",
                  color: "#FAFAFA",
                  lineHeight: "1.7",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {entry.memory}
              </p>
            ) : (
              <p className="text-sm" style={{ color: "#525252" }}>
                No memory added yet.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
