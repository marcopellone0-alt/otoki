import { NextResponse } from 'next/server';

export async function GET() {
  // 1. Grab your secret key securely from the vault
  const apiKey = process.env.TICKETMASTER_API_KEY;
  
  // 2. Ask Ticketmaster for the next 5 music events happening in Melbourne
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&city=Melbourne&classificationName=music&sort=date,asc&size=5`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // 3. Send the data back to our app
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch gigs" }, { status: 500 });
  }
}