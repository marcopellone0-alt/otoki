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
      .select("sender_id, receiver_id, content, created_at")
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
          last_message: msg.content,
          last_time: msg.created_at,
        });
      }
    }

    // Fetch partner profiles
    const partnerIds = Array.from(partners.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", partnerIds);

    const convos = Array.from(partners.values()).map(c => ({
      ...c,
      display_name: profiles?.find(p => p.id === c.partner_id)?.display_name || "Anonymous",
    }));

    setConversations(convos);
  };

  const openChat = async (partnerId: string) => {
    if (!user) return;

    // Get partner profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", partnerId)
      .single();

    setActiveChat({
      partner_id: partnerId,
      display_name: profile?.display_name || "Anonymous",
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
            onKeyDown={e => e.key === "Enter" && sendMessage()}
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
                className="w-full bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex justify-between items-center hover:bg-neutral-800 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-bold">{convo.display_name}</p>
                  <p className="text-neutral-500 text-sm truncate">{convo.last_message}</p>
                </div>
                <p className="text-neutral-600 text-xs shrink-0 ml-3">
                  {new Date(convo.last_time).toLocaleDateString("en-AU")}
                </p>
              </button>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
