import { NextResponse } from 'next/server';
export async function GET(request: Request) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const { searchParams } = new URL(request.url);
  
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0];
  const to = searchParams.get('to') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const startDateTime = `${from}T00:00:00Z`;
  const endDateTime = `${to}T23:59:59Z`;
  const tmUrl = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&stateCode=VIC&countryCode=AU&classificationName=Music&size=50&sort=date,asc&startDateTime=${startDateTime}&endDateTime=${endDateTime}`;
  try {
    const response = await fetch(tmUrl);
    const data = await response.json();
    
    // Filter out non-music events that slip through Ticketmaster's classification
    const events = data._embedded?.events || [];
    const musicOnly = events.filter((event: any) => {
      const attractions = event._embedded?.attractions;
      if (!attractions || attractions.length === 0) return false;
      return attractions.some((a: any) =>
        a.classifications?.some((c: any) => c.segment?.name === 'Music')
      );
    });
    
    return NextResponse.json({
      ...data,
      _embedded: { ...data._embedded, events: musicOnly }
    });
  } catch (error) {
    console.error("Ticketmaster error:", error);
    return NextResponse.json({ error: "Failed to pull gigs" }, { status: 500 });
  }
}