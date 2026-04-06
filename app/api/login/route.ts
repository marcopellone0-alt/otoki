import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const client_id = process.env.SPOTIFY_CLIENT_ID || '';
  
  // THE FIX: Added base user scopes just to stop Spotify from being paranoid
  const scope = 'playlist-modify-public playlist-modify-private user-read-private user-read-email';
  
  const host = request.headers.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  
  const baseUrl = isLocal ? 'http://127.0.0.1:3000' : `https://${host}`;
  const redirect_uri = `${baseUrl}/api/callback`;
  
  const accountsDomain = ["accounts", "spotify", "com"].join(".");
  
  // THE NUKE: "show_dialog=true" forces Spotify to show the green AGREE screen again!
  const spotifyAuthUrl = `https://${accountsDomain}/authorize?response_type=code&client_id=${client_id}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect_uri)}&show_dialog=true`;

  return NextResponse.redirect(spotifyAuthUrl);
}