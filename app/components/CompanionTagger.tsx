"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Companion = {
  id: string;
  entry_id: string;
  tagged_user_id: string | null;
  tagged_name: string | null;
  // Hydrated client-side from profiles join when tagged_user_id is set
  display_name?: string | null;
  avatar_url?: string | null;
};

type ProfileSearchResult = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  entryId: string;
  /** Owner of the parent entry. Only the owner gets edit affordances. */
  ownerId: string;
  /** If false, render only the companion byline (no add/remove). */
  canEdit: boolean;
};

const MAX_COMPANIONS = 8;

export default function CompanionTagger({ entryId, ownerId, canEdit }: Props) {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load: fetch companions, then hydrate display names for any
  // companions linked to a real Otoki user.
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("scrapbook_companions")
        .select("id, entry_id, tagged_user_id, tagged_name")
        .eq("entry_id", entryId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[companions] load error:", error);
        setLoading(false);
        return;
      }

      const list = (data || []) as Companion[];

      const userIds = list
        .map((c) => c.tagged_user_id)
        .filter((id): id is string => !!id);

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);

        const profileMap = new Map(
          (profiles || []).map((p: any) => [p.id, p])
        );

        list.forEach((c) => {
          if (c.tagged_user_id && profileMap.has(c.tagged_user_id)) {
            const p = profileMap.get(c.tagged_user_id);
            c.display_name = p.display_name;
            c.avatar_url = p.avatar_url;
          }
        });
      }

      setCompanions(list);
      setLoading(false);
    };
    load();
  }, [entryId]);

  // Debounced profile search. Runs only when add-mode is open + query > 1 char.
  useEffect(() => {
    if (!adding || query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${query.trim()}%`)
        .neq("id", ownerId) // exclude self
        .limit(8);

      if (error) {
        console.error("[companions] search error:", error);
        setResults([]);
      } else {
        // Filter out users already tagged
        const taggedIds = new Set(
          companions.map((c) => c.tagged_user_id).filter(Boolean)
        );
        setResults(
          ((data || []) as ProfileSearchResult[]).filter(
            (p) => !taggedIds.has(p.id)
          )
        );
      }
      setSearching(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, adding, companions, ownerId]);

  const addUserCompanion = async (profile: ProfileSearchResult) => {
    if (companions.length >= MAX_COMPANIONS) {
      setError(`Max ${MAX_COMPANIONS} companions per entry.`);
      return;
    }

    const { data, error } = await supabase
      .from("scrapbook_companions")
      .insert({
        entry_id: entryId,
        tagged_user_id: profile.id,
        tagged_name: null,
      })
      .select()
      .single();

    if (error) {
      console.error("[companions] add user error:", error);
      setError(error.message);
      return;
    }

    if (data) {
      setCompanions((prev) => [
        ...prev,
        {
          ...(data as Companion),
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
      ]);
      setQuery("");
      setResults([]);
    }
  };

  const addFreeTextCompanion = async () => {
    const name = query.trim();
    if (!name) return;
    if (companions.length >= MAX_COMPANIONS) {
      setError(`Max ${MAX_COMPANIONS} companions per entry.`);
      return;
    }

    const { data, error } = await supabase
      .from("scrapbook_companions")
      .insert({
        entry_id: entryId,
        tagged_user_id: null,
        tagged_name: name,
      })
      .select()
      .single();

    if (error) {
      console.error("[companions] add free-text error:", error);
      setError(error.message);
      return;
    }

    if (data) {
      setCompanions((prev) => [...prev, data as Companion]);
      setQuery("");
      setResults([]);
    }
  };

  const removeCompanion = async (companionId: string) => {
    // Optimistic remove
    const previous = companions;
    setCompanions((prev) => prev.filter((c) => c.id !== companionId));

    const { error } = await supabase
      .from("scrapbook_companions")
      .delete()
      .eq("id", companionId);

    if (error) {
      console.error("[companions] remove error:", error);
      setCompanions(previous);
      setError(error.message);
    }
  };

  const renderName = (c: Companion) =>
    c.display_name || c.tagged_name || "Someone";

  // Read-only view (viewing someone else's entry): just the byline, nothing else.
  if (!canEdit) {
    if (loading || companions.length === 0) return null;

    return (
      <div style={{ marginBottom: "20px" }}>
        <p
          className="text-[10px] font-semibold tracking-[0.15em] uppercase"
          style={{ color: "#525252", marginBottom: "6px" }}
        >
          With
        </p>
        <p
          className="text-sm"
          style={{ color: "#A3A3A3", margin: 0 }}
        >
          {companions.map(renderName).join(" · ")}
        </p>
      </div>
    );
  }

  // Owner view: editable list + add controls.
  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        className="flex items-baseline justify-between"
        style={{ marginBottom: "8px" }}
      >
        <p
          className="text-[10px] font-semibold tracking-[0.15em] uppercase"
          style={{ color: "#A3A3A3", margin: 0 }}
        >
          Who was with you
        </p>
        <p className="text-[11px]" style={{ color: "#525252" }}>
          {companions.length} / {MAX_COMPANIONS}
        </p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "#525252" }}>Loading…</p>
      ) : (
        <>
          {/* Existing companions as removable chips */}
          {companions.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
              style={{ marginBottom: "12px" }}
            >
              {companions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2"
                  style={{
                    backgroundColor: "#171717",
                    border: "1px solid #262626",
                    borderRadius: "999px",
                    padding: "4px 6px 4px 10px",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ color: "#FAFAFA" }}>{renderName(c)}</span>
                  {!c.tagged_user_id && (
                    <span
                      className="text-[10px]"
                      style={{ color: "#525252" }}
                    >
                      not on Otoki
                    </span>
                  )}
                  <button
                    onClick={() => removeCompanion(c.id)}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: "#262626",
                      color: "#A3A3A3",
                    }}
                    aria-label={`Remove ${renderName(c)}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add control */}
          {companions.length < MAX_COMPANIONS && (
            <>
              {!adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{
                    color: "#A3A3A3",
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <UserPlus size={14} />
                  Add a companion
                </button>
              ) : (
                <div>
                  <div
                    className="flex items-center gap-2 rounded-xl"
                    style={{
                      backgroundColor: "#171717",
                      border: "1px solid #262626",
                      padding: "10px 12px",
                    }}
                  >
                    <Search size={14} style={{ color: "#525252" }} />
                    <input
                      autoFocus
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search Otoki, or type any name"
                      className="flex-1 bg-transparent text-sm focus:outline-none"
                      style={{ color: "#FAFAFA" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && results.length === 0) {
                          addFreeTextCompanion();
                        }
                        if (e.key === "Escape") {
                          setAdding(false);
                          setQuery("");
                          setResults([]);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        setAdding(false);
                        setQuery("");
                        setResults([]);
                      }}
                      className="text-[11px]"
                      style={{
                        color: "#525252",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Search results dropdown */}
                  {query.trim().length >= 2 && (
                    <div
                      className="rounded-xl"
                      style={{
                        backgroundColor: "#171717",
                        border: "1px solid #262626",
                        marginTop: "6px",
                        overflow: "hidden",
                      }}
                    >
                      {searching ? (
                        <p
                          className="text-sm"
                          style={{ color: "#525252", padding: "10px 12px" }}
                        >
                          Searching…
                        </p>
                      ) : results.length > 0 ? (
                        results.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addUserCompanion(p)}
                            className="w-full flex items-center gap-3 text-left"
                            style={{
                              padding: "10px 12px",
                              background: "transparent",
                              border: "none",
                              borderBottom: "0.5px solid #262626",
                              color: "#FAFAFA",
                              cursor: "pointer",
                            }}
                          >
                            {p.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.avatar_url}
                                alt=""
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "999px",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "999px",
                                  backgroundColor: "#262626",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "12px",
                                  color: "#A3A3A3",
                                  fontWeight: 600,
                                }}
                              >
                                {(p.display_name || "?")[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm">
                              {p.display_name || "Unnamed"}
                            </span>
                          </button>
                        ))
                      ) : (
                        <button
                          onClick={addFreeTextCompanion}
                          className="w-full text-left"
                          style={{
                            padding: "10px 12px",
                            background: "transparent",
                            border: "none",
                            color: "#FAFAFA",
                            cursor: "pointer",
                            fontSize: "13px",
                          }}
                        >
                          Add{" "}
                          <span style={{ color: "#FAFAFA", fontWeight: 600 }}>
                            "{query.trim()}"
                          </span>{" "}
                          <span
                            className="text-[11px]"
                            style={{ color: "#525252" }}
                          >
                            — not on Otoki
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p
              className="text-[11px]"
              style={{ color: "#FF0033", marginTop: "8px" }}
            >
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
