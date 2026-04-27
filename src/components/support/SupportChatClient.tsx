"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendMessage, toggleReaction, createTicket, closeTicket, deleteTicketMessage } from "@/actions/support.actions";
import { markSupportTicketMessagesAsRead } from "@/actions/notification.actions";
import { Send, CheckCircle, PlusCircle, User as UserIcon, X, SmilePlus, Smile, Trash2, Calendar, AlertCircle, BookOpen, Clock, HelpCircle } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import RichMessageInput from "@/components/messages/RichMessageInput";
import MarkdownMessage from "@/components/messages/MarkdownMessage";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

type Ticket = any; // simplified for now
type TicketMessage = any;

const TICKET_CATEGORIES = [
  { value: "leave_request", label: "Leave Request", icon: Calendar, description: "Request time off or leave" },
  { value: "technical_issue", label: "Technical Issue", icon: AlertCircle, description: "Report a technical problem" },
  { value: "grade_dispute", label: "Grade Issues", icon: BookOpen, description: "Discuss grade concerns" },
  { value: "schedule_change", label: "Schedule Change", icon: Clock, description: "Request schedule modifications" },
  { value: "other", label: "Other / General", icon: HelpCircle, description: "Any other support request" },
];

interface SupportChatClientProps {
  tickets: Ticket[];
  selectedTicketData: Ticket | null;
  currentUserId: string;
  currentUserRole: string;
  defaultLayout?: number[];
}

export default function SupportChatClient({
  tickets,
  selectedTicketData,
  currentUserId,
  currentUserRole,
  defaultLayout,
}: SupportChatClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [isCreating, setIsCreating] = useState(false);
  const [newCategory, setNewCategory] = useState("other");
  const [newSubject, setNewSubject] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [emojiToken, setEmojiToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [reactionMessageId, setReactionMessageId] = useState<number | null>(null);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const inputEmojiRef = useRef<HTMLDivElement>(null);
  const reactionEmojiRef = useRef<HTMLDivElement>(null);
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null);

  const onLayout = (sizes: number[]) => {
    document.cookie = `react-resizable-panels:support-layout=${JSON.stringify(sizes)}; path=/; max-age=31536000`;
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inputEmojiRef.current && !inputEmojiRef.current.contains(event.target as Node)) {
        setShowInputEmoji(false);
      }
      if (reactionEmojiRef.current && !reactionEmojiRef.current.contains(event.target as Node)) {
        setReactionMessageId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedTicketData?.messages]);

  useEffect(() => {
    if (selectedTicketData?.id) {
      markSupportTicketMessagesAsRead(selectedTicketData.id).then(() => router.refresh());
    }
  }, [selectedTicketData?.id, router]);

  const handleTicketClick = (id: number) => {
    setIsCreating(false);
    router.push(`/support?ticketId=${id}`);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDesc.trim()) return;
    await createTicket(newSubject, newDesc, newCategory);
    setIsCreating(false);
    setNewCategory("other");
    setNewSubject("");
    setNewDesc("");
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !selectedTicketData) return;
    await sendMessage(selectedTicketData.id, content, replyToMessage?.id);
    setReplyToMessage(null);
  };

  const handleReaction = async (messageId: number, emoji: string) => {
    await toggleReaction(messageId, emoji);
    setReactionMessageId(null);
  };

  const handleDeleteMessage = async (messageId: number) => {
    await deleteTicketMessage(messageId);
    router.refresh();
  };

  const AVAILABLE_EMOJIS = ["👍", "♥️", "🎉", "😭", "🙏"];

  const handleCloseTicket = async () => {
    if (!selectedTicketData) return;
    await closeTicket(selectedTicketData.id);
  };

  // Vercel UI style constants
  const shadowBorder = "shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px]";
  const shadowCard = "shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_2px_2px,#fafafa_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px,rgba(0,0,0,0.2)_0px_2px_2px]";

  const getCreatorName = (t: any) => {
    if (t.student) return t.student.username;
    if (t.teacher) return t.teacher.username;
    if (t.parent) return t.parent.username;
    return null;
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className={`w-full h-full rounded-lg ${shadowBorder} bg-background overflow-hidden flex flex-col md:flex-row`}
      onLayout={onLayout}
    >
      {/* SIDEBAR PANEL */}
      <ResizablePanel
        defaultSize={defaultLayout?.[0] ?? 33}
        minSize={20}
        maxSize={45}
        className={`flex-col ${shadowBorder} z-10 bg-[#fafafa] dark:bg-[#111113] ${(selectedTicketData || isCreating) ? 'hidden md:flex' : 'flex'} h-full`}
      >
        <div className="p-4 border-b border-border flex justify-between items-center bg-background shrink-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Tickets</h2>
          {currentUserRole !== "admin" && (
            <button
              onClick={() => setIsCreating(true)}
              className={`p-1.5 rounded-md ${shadowBorder} bg-background hover:bg-muted transition-colors`}
            >
              <PlusCircle className="size-4 text-foreground" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
          {tickets.length === 0 && (
            <p className="text-muted-foreground text-sm p-4 text-center">No tickets found.</p>
          )}
          {tickets.map((t) => {
            const category = TICKET_CATEGORIES.find(c => c.value === t.category) || TICKET_CATEGORIES[4];
            const Icon = category.icon;
            return (
              <div
                key={t.id}
                onClick={() => handleTicketClick(t.id)}
                className={`p-3 rounded-md cursor-pointer transition-colors ${selectedTicketData?.id === t.id
                  ? "bg-background shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.1)]"
                  : "hover:bg-accent hover:text-accent-foreground"
                  }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
                      <span className="opacity-70"><Icon className="w-3.5 h-3.5" /></span>
                      <span>{category.label}</span>
                    </div>
                    <h3 className="font-medium text-[13px] text-foreground line-clamp-1">
                      {t.subject}
                    </h3>
                  </div>
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${t.status === "OPEN" ? "text-blue-600 dark:text-blue-400 bg-blue-500/10" :
                    t.status === "CLOSED" ? "text-muted-foreground bg-muted" : "text-green-600 dark:text-green-400 bg-green-500/10"
                  }`}>
                    {t.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {t.messages?.[0]?.content || t.description}
                </p>
              </div>
            );
          })}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle className="hidden md:flex" />

      {/* MAIN VIEW PANEL */}
      <ResizablePanel
        defaultSize={defaultLayout?.[1] ?? 67}
        className={`flex-1 flex-col bg-background h-full relative ${(selectedTicketData || isCreating) ? 'flex' : 'hidden md:flex'}`}
      >
        {isCreating ? (
          <div className="flex-1 flex flex-col p-8 items-center justify-center overflow-y-auto">
            <div className={`w-full max-w-md p-6 rounded-xl bg-card ${shadowCard}`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[24px] font-semibold tracking-[-0.96px] text-foreground">New Support Ticket</h2>
                <button onClick={() => setIsCreating(false)}>
                  <X className="size-5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
              <form onSubmit={handleCreateTicket} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest">Ticket Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TICKET_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setNewCategory(cat.value)}
                          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${newCategory === cat.value ? "border-foreground bg-card shadow-sm" : "border-border bg-card/50 hover:border-foreground/40"}`}
                        >
                          <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${newCategory === cat.value ? "text-foreground" : "text-muted-foreground"}`} />
                          <div>
                            <p className={`text-sm font-medium ${newCategory === cat.value ? "text-foreground" : "text-muted-foreground"}`}>{cat.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest">Subject</label>
                  <input
                    required
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full h-10 px-3 rounded-md text-[14px] text-foreground bg-background outline-none shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px] focus:shadow-[0_0_0_2px_#171717] dark:focus:shadow-[0_0_0_2px_rgba(255,255,255,0.8)] transition-shadow"
                    placeholder="Brief summary of issue"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest">Description</label>
                  <textarea
                    required
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={4}
                    className="w-full p-3 rounded-md text-[14px] text-foreground bg-background outline-none shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px] focus:shadow-[0_0_0_2px_#171717] dark:focus:shadow-[0_0_0_2px_rgba(255,255,255,0.8)] transition-shadow resize-none"
                    placeholder="Please detail your issue..."
                  />
                </div>
                <button type="submit" className="w-full h-10 bg-foreground text-background rounded-md text-[14px] font-medium hover:opacity-90 transition-opacity">
                  Submit Ticket
                </button>
              </form>
            </div>
          </div>
        ) : selectedTicketData ? (
          <div className="flex flex-col h-full">
            {/* CHAT HEADER */}
            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border flex justify-between items-center bg-background z-10 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button for mobile */}
                <button
                  onClick={() => router.push('/support')}
                  className="md:hidden p-1.5 -ml-2 rounded-md hover:bg-accent text-muted-foreground"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div className="min-w-0">
                  <h2 className="text-[18px] md:text-[20px] font-semibold tracking-[-0.32px] text-foreground truncate">{selectedTicketData.subject}</h2>
                  <p className="text-[11px] md:text-[12px] text-muted-foreground mt-0.5">
                    {currentUserRole === "admin" ? `${getCreatorName(selectedTicketData)}  ` : ""}
                    Ticket #{selectedTicketData.id}  {new Date(selectedTicketData.createdAt).toLocaleDateString("en-US")}
                  </p>
                </div>
              </div>
              {currentUserRole === "admin" && selectedTicketData.status !== "CLOSED" && (
                <button
                  onClick={handleCloseTicket}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${shadowBorder} bg-background text-[13px] font-medium text-foreground hover:bg-accent transition-colors`}
                >
                  <CheckCircle className="size-3.5" />
                  Close Ticket
                </button>
              )}
            </div>

            {/* CHAT MESSAGES */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafafa] dark:bg-[#111113] flex flex-col no-scrollbar">
              {selectedTicketData.messages.map((msg: TicketMessage) => {
                const isMe = msg.senderId === currentUserId;
                const isAdmin = msg.senderRole === "admin";

                const reactionsByEmoji = (msg.reactions || []).reduce((acc: any, r: any) => {
                  if (!acc[r.emoji]) acc[r.emoji] = [];
                  acc[r.emoji].push(r);
                  return acc;
                }, {});

                return (
                  <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse self-end" : "flex-row self-start"} w-full max-w-[80%]`}>
                    {!isMe && (
                      <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${isAdmin ? "bg-foreground" : "bg-muted"}`}>
                        <UserIcon className={`size-4 ${isAdmin ? "text-background" : "text-muted-foreground"}`} />
                      </div>
                    )}
                    <div className={`flex-1 flex flex-col ${isMe ? "items-end" : "items-start"} min-w-0`}>
                      <div
                        onDoubleClick={() => setReplyToMessage(msg)}
                        className={`group relative p-3.5 rounded-xl text-[14px] cursor-pointer ${shadowCard} ${isMe
                          ? "bg-foreground text-background rounded-tr-sm"
                          : "bg-card text-card-foreground rounded-tl-sm"
                        }`}
                      >
                        {msg.replyTo && (
                          <div className="mb-2 px-2 py-1 rounded-md border border-border/40 bg-background/40 text-[11px] text-muted-foreground">
                            Replying to: {msg.replyTo.content}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        {/* Hover Reaction Bar */}
                        <div className={`absolute top-[-16px] ${isMe ? "right-0" : "left-0"} flex items-center p-1 rounded-full bg-card shadow-sm border border-border opacity-0 group-hover:opacity-100 transition-opacity z-10 gap-1`}>
                          {AVAILABLE_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji)}
                              className="w-7 h-7 flex items-center justify-center text-[14px] hover:bg-muted rounded-full transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                          <div className="w-[1px] h-4 bg-border mx-0.5" />
                          <button
                            onClick={() => setReactionMessageId(reactionMessageId === msg.id ? null : msg.id)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                          >
                            <SmilePlus className="size-4" />
                          </button>
                          {(isMe || currentUserRole === "admin") && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                        {reactionMessageId === msg.id && (
                          <div ref={reactionEmojiRef} className={`absolute z-50 ${isMe ? "right-0" : "left-0"} top-6`}>
                            <EmojiPicker
                              onEmojiClick={(emojiData) => handleReaction(msg.id, emojiData.emoji)}
                              width={280}
                              height={350}
                              theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                            />
                          </div>
                        )}
                      </div>

                      {/* Active Reactions */}
                      {Object.keys(reactionsByEmoji).length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                          {Object.entries(reactionsByEmoji).map(([emoji, reacts]: [string, any]) => {
                            const hasReacted = reacts.some((r: any) => r.userId === currentUserId);
                            return (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] border ${hasReacted
                                    ? "bg-blue-500/10 border-blue-500/30 text-blue-500"
                                    : "bg-card border-border text-muted-foreground hover:bg-muted"
                                  }`}
                              >
                                <span>{emoji}</span>
                                <span className="font-medium">{reacts.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-1.5 text-[11px] text-muted-foreground font-mono px-1">
                        {isAdmin ? "Admin" : msg.senderRole}  {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* CHAT INPUT */}
            {selectedTicketData.status !== "CLOSED" ? (
              <div className="p-4 bg-background border-t border-border shrink-0 relative">
                {showInputEmoji && (
                  <div ref={inputEmojiRef} className="absolute bottom-full mb-2 right-4 z-50">
                    <EmojiPicker
                      onEmojiClick={(emojiData) => setEmojiToken(emojiData.emoji)}
                      width={300}
                      height={400}
                      theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                    />
                  </div>
                )}
                {replyToMessage && (
                  <div className="mb-2 px-3 py-2 rounded-md border border-border bg-muted/40 text-[12px] text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">Replying to: {replyToMessage.content}</span>
                    <button
                      type="button"
                      onClick={() => setReplyToMessage(null)}
                      className="text-xs font-medium hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex gap-2 relative mb-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowInputEmoji(!showInputEmoji)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Smile className="size-5" />
                  </button>
                </div>
                <RichMessageInput
                  placeholder="Type a message..."
                  onSubmit={handleSendMessage}
                  disabled={selectedTicketData.status === "CLOSED"}
                  appendTextToken={emojiToken}
                  onTokenConsumed={() => setEmojiToken(null)}
                  onSlashCommands={[
                    {
                      id: "close",
                      title: "/close",
                      description: "Close this support ticket",
                      keywords: ["ticket", "resolve", "done"],
                      icon: <CheckCircle className="size-4" />,
                      onSelect: () => {
                        if (currentUserRole === "admin") {
                          void handleCloseTicket();
                        }
                      },
                    },
                  ]}
                />
              </div>
            ) : (
              <div className="p-4 bg-[#fafafa] dark:bg-[#111113] border-t border-border shrink-0 text-center">
                <p className="text-[13px] text-muted-foreground">This ticket has been closed.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#fafafa] dark:bg-[#111113]">
            <p className="text-[14px] text-muted-foreground">Select a ticket from the sidebar to view the conversation.</p>
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
