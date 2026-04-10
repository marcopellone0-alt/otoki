"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

export default function Messages() {
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef<any>(null);

  // Keep a ref to activeChat so the realtime callback sees the current value
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/auth";
        return;
      }
      setUser(user);
      await loadConversations(user.id);
      setLoading(false);
    };
    load();
  }, []);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as any;
          const currentChat = activeChatRef.current;

          // If we're in the chat with this sender, append and mark as read
          if (currentChat && currentChat.partner_id === newMsg.sender_id) {
            setMessages(prev => [...prev, newMsg]);
            await supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          }

          // Always reload conversations list to update previews and unread counts
          loadConversations(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Check URL for ?to= param (coming from a profile page)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const toId = params.get("to");
    if (toId) {
      openChat(toId);
    }
  }, [user]);

  const loadConversations = async (userId: string) => {
    // Get all messages involving this user
    const { data: allMessages } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at, read_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!allMessages || allMessages.length === 0) {
      setConversations([]);
      return;
    }

    // Group by conversation partner
    const partners = new Map<string, any>();
    for (const msg of allMessages) {
      const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!partners.has(partnerId)) {
        partners.set(partnerId, {
          partner_id: partnerId,
          last_message: msg.sender_id === userId ? "You: " + msg.content : msg.content,
          last_time: msg.created_at,
          unread_count: 0,
        });
      }
      // Count unread messages (sent to me, not yet read)
      if (msg.receiver_id === userId && !msg.read_at) {
        const convo = partners.get(partnerId);
        convo.unread_count += 1;
      }
    }

    // Fetch partner profiles
    const partnerIds = Array.from(partners.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", partnerIds);

    const convos = Array.from(partners.values()).map(c => ({
      ...c,
      display_name: profiles?.find(p => p.id === c.partner_id)?.display_name || "Anonymous",
      avatar_url: profiles?.find(p => p.id === c.partner_id)?.avatar_url || null,
    }));

    setConversations(convos);
  };

  const openChat = async (partnerId: string) => {
    if (!user) return;

    // Get partner profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", partnerId)
      .single();

    setActiveChat({
      partner_id: partnerId,
      display_name: profile?.display_name || "Anonymous",
      avatar_url: profile?.avatar_url || null,
    });

    // Load messages between these two users
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    setMessages(data || []);

    // Mark unread messages as read
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", user.id)
      .is("read_at", null);

    // Refresh conversations to clear unread count
    loadConversations(user.id);

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !activeChat || sending) return;
    setSending(true);

    const msg = {
      sender_id: user.id,
      receiver_id: activeChat.partner_id,
      content: newMessage.trim(),
    };

    const { data, error } = await supabase.from("messages").insert(msg).select().single();

    if (!error && data) {
      setMessages(prev => [...prev, data]);
      setNewMessage("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  // Chat view
  if (activeChat) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex flex-col">
        {/* Header */}
        <div className="border-b border-neutral-800 p-4 flex items-center gap-3">
          <button
            onClick={() => { setActiveChat(null); if (user) loadConversations(user.id); }}
            className="text-neutral-500 hover:text-white transition-colors"
          >
            ←
          </button>
          {activeChat.avatar_url ? (
            <img src={activeChat.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-sm font-bold text-neutral-400">
              {activeChat.display_name ? activeChat.display_name[0].toUpperCase() : "?"}
            </div>
          )}
          <a href={`/profile/${activeChat.partner_id}`} className="font-bold hover:text-red-400 transition-colors">
            {activeChat.display_name}
          </a>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-neutral-500 text-center py-8">
              Say hi! You're both going to the same gig.
            </p>
          )}
          {messages.map((msg: any) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                  msg.sender_id === user?.id
                    ? "bg-[#FF0000] text-white rounded-br-md"
                    : "bg-neutral-800 text-white rounded-bl-md"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className="text-[10px] opacity-50 mt-1">
                  {new Date(msg.created_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-neutral-800 p-4 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message..."
            className="flex-1 bg-neutral-900 border border-neutral-800 text-white rounded-full px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FF0000] placeholder:text-neutral-600"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className={`px-5 py-3 rounded-full font-bold text-sm transition-colors ${
              !newMessage.trim() || sending
                ? "bg-neutral-800 text-neutral-500"
                : "bg-[#FF0000] hover:bg-[#CC0000] text-white"
            }`}
          >
            Send
          </button>
        </div>
      </main>
    );
  }

  // Conversations list
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex flex-col items-center p-6 pt-12">
      <div className="max-w-md w-full space-y-6">

        <div className="space-y-2">
          <a href="/" className="text-neutral-500 hover:text-white text-sm transition-colors">
            ← Back to gigs
          </a>
          <h1 className="text-3xl font-black tracking-tighter">Messages</h1>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-neutral-500">No messages yet.</p>
            <p className="text-neutral-600 text-sm">
              RSVP to a gig and tap on other attendees to start a chat!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((convo: any) => (
              <button
                key={convo.partner_id}
                onClick={() => openChat(convo.partner_id)}
                className="w-full bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex items-center gap-3 hover:bg-neutral-800 transition-colors text-left"
              >
                {convo.avatar_url ? (
                  <img src={convo.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-lg font-bold text-neutral-400 shrink-0">
                    {convo.display_name ? convo.display_name[0].toUpperCase() : "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate ${convo.unread_count > 0 ? "font-bold" : "font-semibold"}`}>
                      {convo.display_name}
                    </p>
                    <p className="text-neutral-600 text-xs shrink-0">
                      {new Date(convo.last_time).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className={`text-sm truncate ${convo.unread_count > 0 ? "text-white" : "text-neutral-500"}`}>
                      {convo.last_message}
                    </p>
                    {convo.unread_count > 0 && (
                      <span className="bg-[#FF0000] text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0 min-w-[20px] text-center">
                        {convo.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
