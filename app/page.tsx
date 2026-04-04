"use client";

import { useState } from "react";

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [gigs, setGigs] = useState<any[]>([]); // This new "memory" holds the live Ticketmaster data

const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/gigs');
      const data = await response.json();
      
      const liveEvents = data._embedded?.events || [];
      
      // THE FIX: Filter out duplicates. 
      // This tells the app to only keep one gig per unique name.
      const uniqueGigs = Array.from(
        new Map(liveEvents.map((gig: any) => [gig.name, gig])).values()
      );
      
      setGigs(uniqueGigs);
      setShowDashboard(true);
    } catch (error) {
      console.error("Error fetching gigs:", error);
      alert("Whoops, couldn't grab the gigs. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- SUCCESS STATE (THE DASHBOARD) ---
  if (showDashboard) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
        <div className="max-w-md w-full space-y-8">
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">Your mixtape is live.</h2>
            <p className="text-neutral-400">Melbourne • Live Data</p>
          </div>

          <button className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-xl rounded-full py-5 flex items-center justify-center space-x-2 transition-colors">
            <span>OPEN IN SPOTIFY</span>
          </button>

          {/* The Live Gig List */}
          <div className="space-y-4 pt-4">
            <h3 className="text-neutral-500 font-semibold tracking-wider text-sm uppercase">Playing Soon</h3>
            
            {/* 4. We "map" over the live data to create a card for every real gig */}
            {gigs.length > 0 ? (
              gigs.map((gig: any) => (
                <div key={gig.id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex justify-between items-center">
                  <div className="pr-4">
                    <p className="font-bold text-lg line-clamp-1">{gig.name}</p>
                    <p className="text-neutral-400 text-sm line-clamp-1">
                      {gig._embedded?.venues?.[0]?.name || "Venue TBA"}
                    </p>
                  </div>
                  {/* 5. This is your future affiliate link button! */}
                  <a 
                    href={gig.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-white text-black font-bold px-4 py-2 rounded-full text-sm hover:bg-neutral-200 shrink-0"
                  >
                    Tickets
                  </a>
                </div>
              ))
            ) : (
              <p className="text-neutral-500 text-center">No gigs found tonight.</p>
            )}
          </div>

        </div>
      </main>
    );
  }

  // --- INPUT STATE (THE ORIGINAL SCREEN) ---
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-10">
        
        <div className="space-y-3">
          <h1 className="text-6xl font-black tracking-tighter">OTOKI</h1>
          <p className="text-neutral-400 font-medium text-lg">
            Hear who's playing near you tonight.
          </p>
        </div>

        <div className="space-y-6">
          <select className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-4 text-center focus:outline-none focus:ring-2 focus:ring-[#1DB954] appearance-none">
            <option value="CBD">Melbourne CBD</option>
            <option value="Inner North">Inner North</option>
            <option value="Werribee">Werribee</option>
          </select>

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full font-extrabold text-xl rounded-full py-5 transition-colors ${
              isGenerating 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" 
                : "bg-[#1DB954] hover:bg-[#1ed760] text-black shadow-lg shadow-[#1DB954]/20"
            }`}
          >
            {isGenerating ? "BUILDING MIXTAPE..." : "GENERATE PLAYLIST"}
          </button>
        </div>

      </div>
    </main>
  );
}