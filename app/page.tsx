"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [gigs, setGigs] = useState<any[]>([]);
  const [isBuildingMixtape, setIsBuildingMixtape] = useState(false);

  // Default date range: today → 7 days from now
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(nextWeek);
  const [user, setUser] = useState<any>(null);
  const [rsvps, setRsvps] = useState<Set<string>>(new Set());
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // Load RSVP counts for all gigs, and user's own RSVPs
  const loadRsvps = async (gigList: any[]) => {
    const gigIds = gigList.map((g: any) => g.id);
    
    // Get counts for each gig
    const { data: allRsvps } = await supabase
      .from('gig_rsvps')
      .select('gig_id')
      .in('gig_id', gigIds);
    
    const counts: Record<string, number> = {};
    allRsvps?.forEach(r => {
      counts[r.gig_id] = (counts[r.gig_id] || 0) + 1;
    });
    setRsvpCounts(counts);

    // Get current user's RSVPs
    if (user) {
      const { data: myRsvps } = await supabase
        .from('gig_rsvps')
        .select('gig_id')
        .eq('user_id', user.id)
        .in('gig_id', gigIds);
      
      setRsvps(new Set(myRsvps?.map(r => r.gig_id) || []));
    }
  };

  const toggleRsvp = async (gig: any) => {
    if (!user) {
      window.location.href = '/auth';
      return;
    }

    const gigId = gig.id;
    
    if (rsvps.has(gigId)) {
      // Remove RSVP
      await supabase.from('gig_rsvps').delete().match({ user_id: user.id, gig_id: gigId });
      rsvps.delete(gigId);
      setRsvps(new Set(rsvps));
      setRsvpCounts(prev => ({ ...prev, [gigId]: (prev[gigId] || 1) - 1 }));
    } else {
      // Add RSVP
      await supabase.from('gig_rsvps').insert({
        user_id: user.id,
        gig_id: gigId,
        gig_name: gig.name,
        gig_date: gig.dates?.start?.localDate || null,
        venue_name: gig._embedded?.venues?.[0]?.name || null,
      });
      rsvps.add(gigId);
      setRsvps(new Set(rsvps));
      setRsvpCounts(prev => ({ ...prev, [gigId]: (prev[gigId] || 0) + 1 }));
    }
  };

  useEffect(() => {
    const stashedGigs = sessionStorage.getItem("otoki_recovery_gigs");
    if (stashedGigs) {
      try {
        const parsedGigs = JSON.parse(stashedGigs);
        setGigs(parsedGigs);
        setShowDashboard(true);
        sessionStorage.removeItem("otoki_recovery_gigs");
      } catch (error) {
        console.error("Failed to parse recovered gigs:", error);
      }
    }
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Pass the date range to the API
      const response = await fetch(`/api/gigs?from=${fromDate}&to=${toDate}`);
      const data = await response.json();
      const liveEvents = data._embedded?.events || [];
      
      const uniqueGigs = Array.from(
        new Map(liveEvents.map((gig: any) => [gig.name, gig])).values()
      );
      
      setGigs(uniqueGigs);
      setShowDashboard(true);
      loadRsvps(uniqueGigs);
    } catch (error) {
      console.error("Error fetching gigs:", error);
      alert("Whoops, couldn't grab the gigs. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBuildMixtape = async () => {
    setIsBuildingMixtape(true);
    try {
      const response = await fetch('/api/yt-mixtape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gigs })
      });

      if (response.status === 401) {
        sessionStorage.setItem("otoki_recovery_gigs", JSON.stringify(gigs));
        window.location.href = '/api/yt-login';
        return;
      }

      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        alert("Something went wrong building the mixtape.");
      }
    } catch (error) {
      console.error("Crashed while building:", error);
      alert("Crashed while building.");
    } finally {
      setIsBuildingMixtape(false);
    }
  };

  if (showDashboard) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
        <div className="max-w-md w-full space-y-8">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Your gig playlist is ready.</h2>
            <p className="text-neutral-400">
              Melbourne • {new Date(fromDate + 'T00:00:00').toLocaleDateString('en-AU')} → {new Date(toDate + 'T00:00:00').toLocaleDateString('en-AU')}
            </p>
          </div>

          <button 
            onClick={handleBuildMixtape}
            disabled={isBuildingMixtape}
            className={`w-full font-extrabold text-xl rounded-full py-5 flex items-center justify-center transition-colors ${
              isBuildingMixtape 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" 
                : "bg-[#FF0000] hover:bg-[#CC0000] text-white shadow-lg shadow-[#FF0000]/20"
            }`}
          >
            {isBuildingMixtape ? "BUILDING MIXTAPE..." : "SAVE MIXTAPE TO YOUTUBE MUSIC"}
          </button>

          <div className="space-y-4 pt-4">
            <h3 className="text-neutral-500 font-semibold tracking-wider text-sm uppercase">Playing Soon</h3>
            
            {gigs.length > 0 ? (
              gigs.map((gig: any) => (
                <div key={gig.id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex justify-between items-center">
                  <div className="pr-4">
                    <p className="font-bold text-lg line-clamp-1" title={gig.name}>{gig.name}</p>
                     <p className="text-neutral-400 text-sm line-clamp-1">
                      {gig.dates?.start?.localDate
                        ? new Date(gig.dates.start.localDate + 'T00:00:00').toLocaleDateString('en-AU')
                        : ""}{" "}
                      · {gig._embedded?.venues?.[0]?.name || "Venue TBA"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => toggleRsvp(gig)}
                      className={`font-bold px-4 py-2 rounded-full text-sm transition-colors ${
                        rsvps.has(gig.id)
                          ? "bg-[#FF0000] text-white"
                          : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                      }`}
                    >
                      {rsvps.has(gig.id) ? "Going ✓" : "I'm going"}
                      {rsvpCounts[gig.id] ? ` · ${rsvpCounts[gig.id]}` : ""}
                    </button>
                    <a 
                      href={gig.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-white text-black font-bold px-4 py-2 rounded-full text-sm hover:bg-neutral-200 text-center"
                    >
                      Tickets
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-neutral-500 text-center">No gigs found in that range.</p>
            )}
          </div>

        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-10">
        
        <div className="space-y-3">
          <h1 className="text-6xl font-black tracking-tighter">OTOKI</h1>
          <p className="text-neutral-400 font-medium text-lg">
            Hear who's playing near you tonight.
          </p>
            {user ? (
              <button 
                onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
                className="text-neutral-500 hover:text-white text-sm transition-colors"
              >
                Signed in as {user.email} · Log out
              </button>
            ) : (
              <a href="/auth" className="text-neutral-500 hover:text-white text-sm transition-colors">
                Sign in
              </a>
            )}
        </div>

        <div className="space-y-4">
          <select className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-4 text-center focus:outline-none focus:ring-2 focus:ring-[#FF0000] appearance-none">
            <option value="CBD">Melbourne CBD</option>
            <option value="Inner North">Inner North</option>
            <option value="Werribee">Werribee</option>
          </select>

          {/* Date range pickers */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-neutral-500 text-xs uppercase tracking-wider">From</label>
              <input
                type="date"
                value={fromDate}
                min={today}
                onChange={e => setFromDate(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000]"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-neutral-500 text-xs uppercase tracking-wider">To</label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000]"
              />
            </div>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full font-extrabold text-xl rounded-full py-5 transition-colors ${
              isGenerating 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" 
                : "bg-[#FF0000] hover:bg-[#CC0000] text-white shadow-lg shadow-[#FF0000]/20"
            }`}
          >
            {isGenerating ? "FINDING GIGS..." : "GENERATE PLAYLIST"}
          </button>
        </div>

</div>
      <footer className="absolute bottom-6">
        <a href="/privacy" className="text-neutral-600 hover:text-neutral-400 text-xs transition-colors">
          Privacy Policy
        </a>
      </footer>
    </main>
  );
}