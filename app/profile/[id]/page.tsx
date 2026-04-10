"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

export default function PublicProfile() {
  const params = useParams();
  const userId = params.id as string;

  const [profile, setProfile] = useState<any>(null);
  const [upcomingGigs, setUpcomingGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      // Get current user (to know if viewing own profile)
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // If viewing own profile, redirect to editable version
      if (user && user.id === userId) {
        window.location.href = "/profile";
        return;
      }

      // Load the profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      setProfile(profileData);

      // Load their upcoming RSVPs
      const { data: rsvpData } = await supabase
        .from("gig_rsvps")
        .select("*")
        .eq("user_id", userId)
        .gte("gig_date", new Date().toISOString().split("T")[0])
        .order("gig_date", { ascending: true });

      setUpcomingGigs(rsvpData || []);
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <p className="text-neutral-500">Profile not found.</p>
        <a href="/" className="text-neutral-500 hover:text-white text-sm mt-4 transition-colors">← Back to gigs</a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
      <div className="max-w-md w-full space-y-6">

        <a href="/" className="text-neutral-500 hover:text-white text-sm transition-colors">
          ← Back to gigs
        </a>

        {/* Name & Bio */}
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tighter">{profile.display_name || "Anonymous"}</h1>
          {profile.bio && (
            <p className="text-neutral-400">{profile.bio}</p>
          )}
        </div>

        {/* Genres */}
        {profile.favourite_genres?.length > 0 && (
          <div className="space-y-2">
            <p className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Into</p>
            <div className="flex flex-wrap gap-2">
              {profile.favourite_genres.map((g: string) => (
                <span key={g} className="bg-neutral-800 text-neutral-300 text-sm px-3 py-1.5 rounded-full">{g}</span>
              ))}
            </div>
          </div>
        )}

        {/* Venues */}
        {profile.favourite_venues?.length > 0 && (
          <div className="space-y-2">
            <p className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Go-to venues</p>
            <div className="flex flex-wrap gap-2">
              {profile.favourite_venues.map((v: string) => (
                <span key={v} className="bg-neutral-800 text-neutral-300 text-sm px-3 py-1.5 rounded-full">{v}</span>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming gigs */}
        {upcomingGigs.length > 0 && (
          <div className="space-y-3">
            <p className="text-neutral-500 text-xs uppercase tracking-wider font-semibold">Going to</p>
            {upcomingGigs.map((gig: any) => (
              <div key={gig.id} className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl">
                <p className="font-bold">{gig.gig_name}</p>
                <p className="text-neutral-500 text-sm">
                  {gig.gig_date
                    ? new Date(gig.gig_date + "T00:00:00").toLocaleDateString("en-AU")
                    : ""}{" "}
                  · {gig.venue_name || "Venue TBA"}
                </p>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
