"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, User } from "lucide-react";
import { supabase } from "../../lib/supabase";

/**
 * Persistent bottom tab bar shown on the main app screens.
 *
 * Visibility rules:
 * - Hidden on /auth (logged-out users)
 * - Hidden on /privacy (standalone doc page)
 * - Hidden when an active chat view is open (auto-detected via custom window
 *   event 'otoki:chat-active' which the messages page dispatches)
 *
 * Active state is based on the current pathname.
 * A red dot appears on the Messages tab when there are unread messages.
 */
export default function TabBar() {
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);
  const [chatActive, setChatActive] = useState(false);

  // Hook 1: Listen for chat-active state from messages page
  useEffect(() => {
    const handleChatActive = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setChatActive(!!detail?.active);
    };
    window.addEventListener("otoki:chat-active", handleChatActive);
    return () =>
      window.removeEventListener("otoki:chat-active", handleChatActive);
  }, []);

  // Hook 2: When navigating away from messages entirely, reset chat state
  useEffect(() => {
    if (!pathname.startsWith("/messages")) {
      setChatActive(false);
    }
  }, [pathname]);

  // Hook 3: Unread messages subscription
  useEffect(() => {
    let mounted = true;
    let channel: any = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const loadUnread = async () => {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("receiver_id", user.id)
          .is("read_at", null);
        if (mounted) setHasUnread((count || 0) > 0);
      };

      loadUnread();

      channel = supabase
        .channel("tabbar-unread")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => loadUnread()
        )
        .subscribe();
    };

    setup();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // ALL HOOKS ABOVE THIS LINE. Early returns only after hooks.
  const hiddenOnRoute = pathname === "/auth" || pathname === "/privacy";
  if (hiddenOnRoute || chatActive) return null;

  const tabs = [
    { href: "/", label: "Gigs", icon: Home, match: (p: string) => p === "/" },
    {
      href: "/messages",
      label: "Messages",
      icon: MessageCircle,
      match: (p: string) => p.startsWith("/messages"),
      showDot: hasUnread,
    },
    {
      href: "/profile",
      label: "Profile",
      icon: User,
      match: (p: string) => p.startsWith("/profile"),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl"
      style={{
        backgroundColor: "rgba(10, 10, 10, 0.85)",
        borderColor: "#262626",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="max-w-md mx-auto flex items-stretch">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <a
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors"
              style={{
                color: active ? "#FAFAFA" : "#525252",
              }}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {tab.showDot && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ backgroundColor: "#FF0033" }}
                  />
                )}
              </div>
              <span
                className="text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: active ? "#FAFAFA" : "#525252" }}
              >
                {tab.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
