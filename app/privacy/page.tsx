import Link from "next/link";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
      <div className="max-w-2xl w-full space-y-8">

        <div className="space-y-2">
          <Link href="/" className="text-neutral-500 hover:text-white text-sm transition-colors">
            ← Back to Otoki
          </Link>
          <h1 className="text-4xl font-black tracking-tighter">Privacy Policy</h1>
          <p className="text-neutral-500 text-sm">Last updated: April 2026</p>
        </div>

        <div className="space-y-6 text-neutral-300 leading-relaxed">

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">What Otoki Does</h2>
            <p>
              Otoki is a live music discovery tool. It pulls upcoming gig listings
              from Ticketmaster for Victoria, Australia, and generates a Spotify
              playlist featuring a top track from each performing artist. You can
              save this playlist directly to your Spotify account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Data We Access</h2>
            <p>
              When you log in with Spotify, Otoki requests permission to read your
              basic profile information (your display name and email) and to create
              playlists on your behalf. We use Spotify's Authorization Code Flow
              to authenticate you securely.
            </p>
            <p>
              Specifically, Otoki accesses:
            </p>
            <p>
              Your Spotify display name and email address (to verify login),
              and the ability to create and add tracks to playlists in your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Data We Store</h2>
            <p>
              Otoki stores your Spotify access token in a secure, HTTP-only cookie
              for the duration of your session. This token is used solely to
              communicate with the Spotify API on your behalf. We do not store your
              Spotify password, and we do not maintain a user database or retain any
              personal data after your session ends.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Data We Share</h2>
            <p>
              We do not sell, rent, or share your personal information with any
              third parties. Your data is only transmitted between your browser,
              Otoki's server, and the Spotify API.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Third-Party Services</h2>
            <p>
              Otoki integrates with the Spotify Web API and the Ticketmaster
              Discovery API. Your use of these services is subject to their
              respective privacy policies. Otoki is hosted on Vercel.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Your Rights</h2>
            <p>
              You can revoke Otoki's access to your Spotify account at any time by
              visiting your Spotify account settings and removing Otoki from your
              connected apps. You can also clear your browser cookies to end your
              current session.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-white font-bold text-lg">Contact</h2>
            <p>
              If you have any questions about this privacy policy or how Otoki
              handles your data, you can reach out via the Otoki GitHub repository
              or contact the developer directly.
            </p>
          </section>

        </div>

        <div className="border-t border-neutral-800 pt-6 pb-12">
          <p className="text-neutral-600 text-sm">
            Otoki is an independent project and is not affiliated with or endorsed
            by Spotify or Ticketmaster.
          </p>
        </div>

      </div>
    </main>
  );
}
