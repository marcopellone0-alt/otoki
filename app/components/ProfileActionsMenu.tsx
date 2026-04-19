"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Shield, Flag, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Props = {
  targetUserId: string;
  targetDisplayName: string;
};

const REPORT_REASONS = [
  "Harassment or abuse",
  "Spam or scam",
  "Inappropriate content",
  "Impersonation",
  "Underage user",
  "Something else",
];

/**
 * Three-dot actions menu shown on public profile pages for users OTHER than
 * the viewer. Offers Block and Report.
 *
 * Block is bidirectional at enforcement time: the blocked party sees nothing
 * disappear (standard UX) but all messages / profile visibility / scrapbook
 * tagging are mutually filtered by is_blocked_between().
 *
 * Report is append-only, no immediate in-app effect. Marco reviews reports
 * via the Supabase dashboard.
 */
export default function ProfileActionsMenu({
  targetUserId,
  targetDisplayName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleBlock = async () => {
    setOpen(false);
    const ok = window.confirm(
      `Block ${targetDisplayName}? You won't see each other on Otoki anymore. You can unblock them anytime from your profile settings.`
    );
    if (!ok) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: user.id, blocked_id: targetUserId });

    if (error) {
      console.error("[block] error:", error);
      window.alert("Couldn't block this user. Please try again.");
      return;
    }

    // Hard nav home — avoids trying to re-render a profile the user can no
    // longer see.
    window.location.href = "/";
  };

  const submitReport = async () => {
    setSubmitting(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setError("You need to be signed in to report.");
      return;
    }

    const { error: insertError } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_id: targetUserId,
      reason,
      notes: notes.trim() || null,
      context_type: "profile",
      context_id: targetUserId,
    });

    setSubmitting(false);

    if (insertError) {
      console.error("[report] error:", insertError);
      setError("Couldn't file the report. Please try again.");
      return;
    }

    setSubmitted(true);
    setTimeout(() => {
      setReportOpen(false);
      setSubmitted(false);
      setReason(REPORT_REASONS[0]);
      setNotes("");
    }, 1500);
  };

  return (
    <>
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{
            backgroundColor: "rgba(23, 23, 23, 0.85)",
            border: "1px solid #262626",
            color: "#A3A3A3",
          }}
          aria-label="More actions"
        >
          <MoreVertical size={18} />
        </button>

        {open && (
          <div
            className="absolute right-0 top-12 rounded-xl overflow-hidden"
            style={{
              backgroundColor: "#171717",
              border: "1px solid #262626",
              minWidth: "180px",
              zIndex: 50,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            }}
          >
            <button
              onClick={handleBlock}
              className="w-full flex items-center gap-3 text-left px-4 py-3 transition-colors"
              style={{
                background: "transparent",
                border: "none",
                color: "#FAFAFA",
                fontSize: "14px",
                borderBottom: "0.5px solid #262626",
                cursor: "pointer",
              }}
            >
              <Shield size={15} color="#A3A3A3" />
              Block
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
              className="w-full flex items-center gap-3 text-left px-4 py-3 transition-colors"
              style={{
                background: "transparent",
                border: "none",
                color: "#FAFAFA",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <Flag size={15} color="#A3A3A3" />
              Report
            </button>
          </div>
        )}
      </div>

      {/* REPORT MODAL */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
          onClick={() => {
            if (!submitting) setReportOpen(false);
          }}
        >
          <div
            className="w-full max-w-md p-6"
            style={{
              backgroundColor: "#171717",
              borderTopLeftRadius: "24px",
              borderTopRightRadius: "24px",
              borderRadius: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                  style={{ color: "#525252" }}
                >
                  Report
                </p>
                <h3
                  className="text-[22px] font-extrabold tracking-[-0.01em] leading-[1.15]"
                  style={{ color: "#FAFAFA" }}
                >
                  {targetDisplayName}
                </h3>
              </div>
              {!submitting && (
                <button
                  onClick={() => setReportOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {submitted ? (
              <div style={{ padding: "24px 0" }}>
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: "#FAFAFA" }}
                >
                  Report submitted.
                </p>
                <p
                  className="text-[13px] mt-2"
                  style={{ color: "#A3A3A3" }}
                >
                  Thanks — we'll take a look.
                </p>
              </div>
            ) : (
              <>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                  style={{ color: "#A3A3A3" }}
                >
                  Reason
                </label>
                <div
                  className="flex flex-col gap-2 mb-4"
                  style={{ marginBottom: "16px" }}
                >
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className="text-left px-4 py-2.5 rounded-xl text-[14px] transition-colors"
                      style={{
                        backgroundColor:
                          reason === r ? "#FAFAFA" : "#0A0A0A",
                        color: reason === r ? "#0A0A0A" : "#FAFAFA",
                        border:
                          reason === r
                            ? "1px solid #FAFAFA"
                            : "1px solid #262626",
                        cursor: "pointer",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <label
                  className="block text-[11px] font-semibold uppercase tracking-[0.1em] mb-2"
                  style={{ color: "#A3A3A3" }}
                >
                  Extra context (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                  placeholder="Anything else we should know?"
                  rows={3}
                  className="w-full rounded-xl p-3 text-[14px] resize-none focus:outline-none"
                  style={{
                    backgroundColor: "#0A0A0A",
                    border: "1px solid #262626",
                    color: "#FAFAFA",
                    marginBottom: "16px",
                  }}
                />

                {error && (
                  <p
                    className="text-[12px] mb-3"
                    style={{ color: "#FF0033" }}
                  >
                    {error}
                  </p>
                )}

                <button
                  onClick={submitReport}
                  disabled={submitting}
                  className="w-full py-3 rounded-full font-bold text-[14px] uppercase tracking-wider transition-colors"
                  style={{
                    backgroundColor: submitting ? "#262626" : "#FF0033",
                    color: submitting ? "#525252" : "#FFFFFF",
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Submitting…" : "Submit report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
