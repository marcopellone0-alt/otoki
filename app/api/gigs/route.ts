import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  const { searchParams } = new URL(request.url);
  
  // Accept date range from frontend, default to today + 7 days
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0];
  const to = searchParams.get('to') ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Ticketmaster needs full ISO datetime strings
  const startDateTime = `${from}T00:00:00Z`;
  const endDateTime = `${to}T23:59:59Z`;

  // Changed from city=Melbourne to stateCode=VIC to catch all Melbourne suburbs
  const tmUrl = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&stateCode=VIC&countryCode=AU&classificationName=Music&size=50&sort=date,asc&startDateTime=${startDateTime}&endDateTime=${endDateTime}`;

  try {
    const response = await fetch(tmUrl);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Ticketmaster error:", error);
    return NextResponse.json({ error: "Failed to pull gigs" }, { status: 500 });
  }
}