"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Entry = {
  id: string;
  user_id: string;
  gig_name: string | null;
  gig_date: string | null;
  venue_name: string | null;
  memory: string | null;
  visibility: "public" | "friends" | "private";
};

const MEMORY_MAX = 280;

export default function ScrapbookEntryPage() {
  const params = useParams();
  const entryId = params.entryId as string;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [memory, setMemory] = useState("");
  const [visibility, setVisibility] =
    useState<Entry["visibility"]>("friends");
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

      setEntry(data as Entry);
      setIsOwner(user.id === data.user_id);
      setMemory(data.memory || "");
      setVisibility(data.visibility || "friends");
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
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Date unknown";
    const date = new Date(d);
    return date.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
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
      <div className="max-w-md mx-auto px-6 pt-12 pb-24">
        <a
          href="/scrapbook"
          className="text-sm"
          style={{ color: "#A3A3A3" }}
        >
          ← Back to scrapbook
        </a>

        <div className="mt-6 mb-8">
          <h1 className="text-2xl font-black tracking-tighter leading-tight">
            {entry.gig_name || "Untitled gig"}
          </h1>
          {entry.venue_name && (
            <p className="text-sm mt-1" style={{ color: "#A3A3A3" }}>
              {entry.venue_name}
            </p>
          )}
          <p
            className="text-[11px] font-semibold tracking-wider uppercase mt-1"
            style={{ color: "#525252" }}
          >
            {formatDate(entry.gig_date)}
          </p>
        </div>

        {isOwner ? (
          <>
            <div className="mb-6">
              <label
                className="block text-[11px] font-semibold tracking-wider uppercase mb-2"
                style={{ color: "#A3A3A3" }}
              >
                Memory
              </label>
              <textarea
                value={memory}
                onChange={(e) =>
                  setMemory(e.target.value.slice(0, MEMORY_MAX))
                }
                placeholder="What do you want to remember about this gig?"
                rows={5}
                className="w-full rounded-xl p-4 text-sm resize-none focus:outline-none"
                style={{
                  backgroundColor: "#171717",
                  border: "1px solid #262626",
                  color: "#FAFAFA",
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
                className="block text-[11px] font-semibold tracking-wider uppercase mb-2"
                style={{ color: "#A3A3A3" }}
              >
                Who can see this
              </label>
              <div className="flex gap-2">
                {(["public", "friends", "private"] as const).map((v) => (
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
                {visibility === "friends" &&
                  "Only people you tag as companions can see it."}
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
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: "#FAFAFA" }}
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
