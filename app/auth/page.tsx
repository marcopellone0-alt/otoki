"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e?: any) => {
    if (e) e.preventDefault();
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    const passInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    const finalEmail = email || emailInput?.value || "";
    const finalPassword = password || passInput?.value || "";
    if (!finalEmail || !finalPassword) return;
    setLoading(true);
    setMessage("");

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: finalEmail,
          password: finalPassword,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            display_name: displayName || finalEmail.split("@")[0],
          });
          setMessage("Account created! Check your email to confirm, then log in.");
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: finalEmail,
          password: finalPassword,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        window.location.href = "/";
      }
    } catch (err) {
      setMessage("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-8">

        <div className="text-center space-y-2">
          <a href="/" className="text-5xl font-black tracking-tighter hover:opacity-80 transition-opacity">
            OTOKI
          </a>
          <p className="text-neutral-400 text-sm">
            {isSignUp ? "Join the Melbourne gig scene." : "Welcome back."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {isSignUp && (
            <div className="space-y-1">
              <label className="text-neutral-500 text-xs uppercase tracking-wider">Name</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-neutral-500 text-xs uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-neutral-900 border border-neutral-800 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600"
            />
          </div>

          {message && (
            <p className={`text-sm text-center ${message.includes("created") ? "text-green-400" : "text-red-400"}`}>
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full font-extrabold text-lg rounded-full py-4 transition-colors ${
              loading
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-[#FF0000] hover:bg-[#CC0000] text-white shadow-lg shadow-[#FF0000]/20"
            }`}
          >
            {loading
              ? (isSignUp ? "CREATING ACCOUNT..." : "SIGNING IN...")
              : (isSignUp ? "CREATE ACCOUNT" : "SIGN IN")}
          </button>

        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setMessage(""); }}
            className="text-neutral-500 hover:text-white text-sm transition-colors"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </div>

      </div>
    </main>
  );
}