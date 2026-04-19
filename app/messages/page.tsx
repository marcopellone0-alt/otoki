"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { ArrowLeft, Send } from "lucide-react";

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

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("otoki:chat-active", {
        detail: { active: !!activeChat },
      })
    );
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

          if (currentChat && currentChat.partner_id === newMsg.sender_id) {
            setMessages((prev) => [...prev, newMsg]);
            await supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", newMsg.id);
            setTimeout(
              () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
              50
            );
          }

          loadConversations(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const toId = params.get("to");
    if (toId) {
      openChat(toId);
    }
  }, [user]);

  const loadConversations = async (userId: string) => {
    const { data: allMessages } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at, read_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!allMessages || allMessages.length === 0) {
      setConversations([]);
      return;
    }

    const partners = new Map<string, any>();
    for (const msg of allMessages) {
      const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      if (!partners.has(partnerId)) {
        partners.set(partnerId, {
          partner_id: partnerId,
          last_message:
            msg.sender_id === userId ? "You: " + msg.content : msg.content,
          last_time: msg.created_at,
          unread_count: 0,
        });
      }
      if (msg.receiver_id === userId && !msg.read_at) {
        const convo = partners.get(partnerId);
        convo.unread_count += 1;
      }
    }

    const partnerIds = Array.from(partners.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", partnerIds);

    const convos = Array.from(partners.values()).map((c) => ({
      ...c,
      display_name:
        profiles?.find((p) => p.id === c.partner_id)?.display_name ||
        "Anonymous",
      avatar_url:
        profiles?.find((p) => p.id === c.partner_id)?.avatar_url || null,
    }));

    setConversations(convos);
  };

  const openChat = async (partnerId: string) => {
    if (!user) return;

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

    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    setMessages(data || []);

    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", user.id)
      .is("read_at", null);

    loadConversations(user.id);

    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100
    );
  };

  /**
   * Send a message. If the insert fails for any reason — most importantly
   * because the receiver has blocked the sender (RLS rejects) — we still
   * show the message in the sender's local UI as if it sent successfully.
   *
   * This is the silent-block pattern used by iMessage, WhatsApp, and
   * Instagram DMs. Without it, the blocked sender immediately knows they're
   * blocked because their messages don't appear in their own chat. With it,
   * they see the message, eventually wonder why no reply ever comes, and
   * are left with plausible-deniability ambiguity.
   *
   * Page reload truth-tells (the synthetic message isn't in the DB so it
   * disappears) but that's an acceptable trade.
   */
  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !activeChat || sending) return;
    setSending(true);

    const content = newMessage.trim();
    const msg = {
      sender_id: user.id,
      receiver_id: activeChat.partner_id,
      content,
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(msg)
      .select()
      .single();

    if (!error && data) {
      // Real insert succeeded — use the returned row.
      setMessages((prev) => [...prev, data]);
    } else {
      // Insert failed (likely a block, possibly a network error). Show a
      // synthetic message in the sender's local state so the UX matches a
      // successful send. The synthetic id is prefixed 'local-' so we know
      // it's not a real message — won't survive a page reload.
      const fakeMsg = {
        id: `local-${Date.now()}`,
        sender_id: user.id,
        receiver_id: activeChat.partner_id,
        content,
        created_at: new Date().toISOString(),
        read_at: null,
      };
      setMessages((prev) => [...prev, fakeMsg]);
    }

    setNewMessage("");
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50
    );
    setSending(false);
  };

  const groupMessagesByDay = (msgs: any[]) => {
    const groups: { dateLabel: string; messages: any[] }[] = [];
    let currentLabel = "";

    for (const msg of msgs) {
      const date = new Date(msg.created_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const msgDay = new Date(date);
      msgDay.setHours(0, 0, 0, 0);

      let label: string;
      if (msgDay.getTime() === today.getTime()) {
        label = "TODAY";
      } else if (msgDay.getTime() === yesterday.getTime()) {
        label = "YESTERDAY";
      } else {
        label = date
          .toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
          .toUpperCase();
      }

      if (label !== currentLabel) {
        groups.push({ dateLabel: label, messages: [msg] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    }

    return groups;
  };

  const formatConvoTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDay = new Date(date);
    msgDay.setHours(0, 0, 0, 0);

    if (msgDay.getTime() === today.getTime()) {
      return date.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (msgDay.getTime() === yesterday.getTime()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  if (loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0A0A0A" }}
      >
        <p style={{ color: "#525252" }}>Loading...</p>
      </main>
    );
  }

  if (activeChat) {
    const groupedMessages = groupMessagesByDay(messages);

    return (
      <main
        className="flex flex-col"
        style={{
          backgroundColor: "#0A0A0A",
          height: "100dvh",
          marginBottom: "-80px",
        }}
      >
          <div
            className="flex items-center gap-3 px-4"
            style={{
              backgroundColor: "#0A0A0A",
              borderBottom: "1px solid #171717",
              height: "56px",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => {
                setActiveChat(null);
                if (user) loadConversations(user.id);
                window.history.replaceState({}, "", "/messages");
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{ color: "#A3A3A3" }}
            >
              <ArrowLeft size={20} />
            </button>

            {activeChat.avatar_url ? (
              <img
                src={activeChat.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[14px]"
                style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
              >
                {activeChat.display_name
                  ? activeChat.display_name[0].toUpperCase()
                  : "?"}
              </div>
            )}

            <a
              href={`/profile/${activeChat.partner_id}`}
              className="font-extrabold text-[16px] tracking-[-0.01em] flex-1 min-w-0 truncate transition-colors"
              style={{ color: "#FAFAFA" }}
            >
              {activeChat.display_name}
            </a>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ overscrollBehavior: "contain" }}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center px-6 text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: "#171717" }}
                >
                  <Send size={24} color="#525252" />
                </div>
                <p
                  className="font-extrabold text-[18px] mb-2"
                  style={{ color: "#FAFAFA" }}
                >
                  Say hi
                </p>
                <p className="text-[14px]" style={{ color: "#A3A3A3" }}>
                  Break the ice with{" "}
                  {activeChat.display_name.split(" ")[0] || "them"}.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedMessages.map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    <div className="flex items-center justify-center my-2">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.15em]"
                        style={{ color: "#525252" }}
                      >
                        {group.dateLabel}
                      </p>
                    </div>

                    {group.messages.map((msg: any, mi: number) => {
                      const isMine = msg.sender_id === user?.id;
                      const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
                      const nextMsg =
                        mi < group.messages.length - 1
                          ? group.messages[mi + 1]
                          : null;
                      const isFirstInGroup =
                        !prevMsg || prevMsg.sender_id !== msg.sender_id;
                      const isLastInGroup =
                        !nextMsg || nextMsg.sender_id !== msg.sender_id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          style={{ marginTop: isFirstInGroup ? "8px" : "2px" }}
                        >
                          <div
                            className="max-w-[78%] px-4 py-2.5"
                            style={{
                              backgroundColor: isMine ? "#FF0033" : "#171717",
                              color: "#FFFFFF",
                              borderRadius: "20px",
                              borderTopLeftRadius:
                                !isMine && !isFirstInGroup ? "6px" : "20px",
                              borderBottomLeftRadius:
                                !isMine && !isLastInGroup ? "6px" : "20px",
                              borderTopRightRadius:
                                isMine && !isFirstInGroup ? "6px" : "20px",
                              borderBottomRightRadius:
                                isMine && !isLastInGroup ? "6px" : "20px",
                            }}
                          >
                            <p className="text-[15px] leading-[1.4] break-words">
                              {msg.content}
                            </p>
                            {isLastInGroup && (
                              <p
                                className="text-[10px] mt-1"
                                style={{
                                  color: isMine
                                    ? "rgba(255, 255, 255, 0.7)"
                                    : "#525252",
                                  textAlign: isMine ? "right" : "left",
                                }}
                              >
                                {new Date(msg.created_at).toLocaleTimeString(
                                  "en-AU",
                                  { hour: "2-digit", minute: "2-digit" }
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div
            className="flex items-end gap-2 px-3 py-3"
            style={{
              backgroundColor: "#0A0A0A",
              borderTop: "1px solid #171717",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
              flexShrink: 0,
            }}
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message..."
              className="flex-1 text-[15px] focus:outline-none"
              style={{
                backgroundColor: "#171717",
                border: "1px solid #262626",
                color: "#FAFAFA",
                borderRadius: "20px",
                padding: "10px 16px",
                minWidth: 0,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="shrink-0 flex items-center justify-center transition-colors"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                backgroundColor: !newMessage.trim() || sending
                  ? "#171717"
                  : "#FF0033",
                color: !newMessage.trim() || sending ? "#525252" : "#FFFFFF",
                cursor:
                  !newMessage.trim() || sending ? "not-allowed" : "pointer",
              }}
            >
              <Send size={16} strokeWidth={2.5} />
            </button>
          </div>
        </main>
    );
  }

  return (
    <main
      className="min-h-screen text-white"
      style={{ backgroundColor: "#0A0A0A" }}
    >
      <div className="px-6 pt-12 pb-8">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-3"
          style={{ color: "#525252" }}
        >
          Inbox
        </p>
        <h1
          className="font-black tracking-[-0.02em] leading-[1.05]"
          style={{ fontSize: "40px", color: "#FAFAFA" }}
        >
          MESSAGES
        </h1>
      </div>

      <div className="px-6">
        {conversations.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: "#171717",
              border: "1px dashed #262626",
            }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#0A0A0A" }}
            >
              <Send size={20} color="#525252" />
            </div>
            <p
              className="font-extrabold text-[16px] mb-2"
              style={{ color: "#FAFAFA" }}
            >
              No messages yet
            </p>
            <p className="text-[14px] mb-4" style={{ color: "#A3A3A3" }}>
              RSVP to a gig and message other gig-goers from their profile.
            </p>
            <a
              href="/"
              className="inline-block text-[12px] font-semibold uppercase tracking-wider transition-colors"
              style={{ color: "#FF0033" }}
            >
              Find gigs →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((convo: any) => (
              <button
                key={convo.partner_id}
                onClick={() => openChat(convo.partner_id)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl transition-colors text-left"
                style={{
                  backgroundColor: "#171717",
                }}
              >
                <div className="relative shrink-0">
                  {convo.avatar_url ? (
                    <img
                      src={convo.avatar_url}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-[18px] font-bold"
                      style={{ backgroundColor: "#262626", color: "#A3A3A3" }}
                    >
                      {convo.display_name
                        ? convo.display_name[0].toUpperCase()
                        : "?"}
                    </div>
                  )}
                  {convo.unread_count > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: "#FF0033",
                        border: "2px solid #171717",
                      }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="font-extrabold text-[15px] truncate tracking-[-0.01em]"
                      style={{ color: "#FAFAFA" }}
                    >
                      {convo.display_name}
                    </p>
                    <p
                      className="text-[11px] shrink-0"
                      style={{
                        color: convo.unread_count > 0 ? "#FF0033" : "#525252",
                        fontWeight: convo.unread_count > 0 ? 600 : 400,
                      }}
                    >
                      {formatConvoTime(convo.last_time)}
                    </p>
                  </div>
                  <p
                    className="text-[14px] truncate mt-0.5"
                    style={{
                      color: convo.unread_count > 0 ? "#FAFAFA" : "#A3A3A3",
                      fontWeight: convo.unread_count > 0 ? 500 : 400,
                    }}
                  >
                    {convo.last_message}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
