"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { User as UserIcon, SmilePlus, Hash, Users, Info, MoreVertical, Trash2 } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import { sendGroupMessage, sendGroupPoll, sendGroupCommandMessage, toggleGroupMessageReaction, deleteGroupMessage } from "@/actions/group.actions";
import { markGroupMessagesAsRead } from "@/actions/notification.actions";
import { useRouter } from "next/navigation";
import PollMessage from "./PollMessage";
import { defaultIcons } from "./SlashCommandMenu";
import RichMessageInput from "./RichMessageInput";
import MarkdownMessage from "./MarkdownMessage";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import GroupMembersPanel from "./GroupMembersPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const AVAILABLE_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

interface GroupChatViewProps {
  group: any;
  currentUserId: string;
}

export default function GroupChatView({ group, currentUserId }: GroupChatViewProps) {
  const [emojiToken, setEmojiToken] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [reactionMessageId, setReactionMessageId] = useState<number | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const reactionEmojiRef = useRef<HTMLDivElement>(null);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const inputEmojiRef = useRef<HTMLDivElement>(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [isSendingPoll, setIsSendingPoll] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null);
  const { theme } = useTheme();
  const router = useRouter();

  const [localMessages, setLocalMessages] = useState<any[]>(group.messages ?? []);
  const lastMsgTimeRef = useRef<string>(
    group.messages?.length
      ? new Date((group.messages as any[]).at(-1).createdAt).toISOString()
      : new Date().toISOString()
  );

  const me = group.members?.find((m: any) => m.userId === currentUserId);
  const isMuted = me?.isMuted || false;

  // Mark group as read — no router.refresh (sidebar handled by its own poller)
  useEffect(() => {
    markGroupMessagesAsRead(group.id);
  }, [group.id]);

  // Poll for new messages from other group members every 3 seconds
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const since = encodeURIComponent(lastMsgTimeRef.current);
        const res = await fetch(
          `/api/messages/poll?convId=${group.id}&type=group&since=${since}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const newMsgs: any[] = await res.json();
        if (newMsgs.length > 0 && !cancelled) {
          lastMsgTimeRef.current = new Date(
            newMsgs[newMsgs.length - 1].createdAt
          ).toISOString();
          setLocalMessages((prev) => {
            const ids = new Set(prev.map((m: any) => String(m.id)));
            const toAdd = newMsgs.filter((m: any) => !ids.has(String(m.id)));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });
        }
      } catch {}
    };

    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [group.id]);

  const updateIsNearBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // Consider "near bottom" within ~120px to avoid jitter.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < 120);
  }, []);

  useEffect(() => {
    updateIsNearBottom();
  }, [updateIsNearBottom]);

  const hasScrolledRef = useRef(false);
  
  useEffect(() => {
    if (!isNearBottom) {
      hasScrolledRef.current = false;
      return;
    }
    if (hasScrolledRef.current) return;
    
    const scroller = scrollerRef.current;
    if (scroller) {
      hasScrolledRef.current = true;
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [localMessages.length, isNearBottom]);

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

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isSending) return;
    if (content.trim().startsWith("/")) return;

    const tempId = `pending-${Date.now()}`;
    const capturedReply = replyToMessage;
    const replyTo = capturedReply
      ? { id: capturedReply.id, content: capturedReply.content, senderId: capturedReply.senderId }
      : null;
    const member = group.members?.find((m: any) => m.userId === currentUserId);

    const optimistic: any = {
      id: tempId,
      content,
      senderId: currentUserId,
      groupId: group.id,
      createdAt: new Date().toISOString(),
      messageType: "TEXT",
      commandKey: null, commandLabel: null, commandUrl: null,
      senderUsername: member?.username ?? "",
      senderRole: member?.userRole ?? "",
      replyToId: capturedReply?.id ?? null,
      replyTo,
      reactions: [],
      poll: null,
    };

    setLocalMessages((prev) => [...prev, optimistic]);
    setReplyToMessage(null);
    setIsSending(true);

    try {
      const saved = await sendGroupMessage(group.id, content, capturedReply?.id);
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...saved, reactions: [], poll: null, replyTo } : m
        )
      );
      lastMsgTimeRef.current = new Date(saved.createdAt).toISOString();
    } catch {
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  const openPoll = () => {
    setShowPollDialog(true);
    setPollQuestion("");
    setPollOptions(["", ""]);
  };

  const handleSendPoll = async () => {
    setIsSendingPoll(true);
    try {
      await sendGroupPoll(group.id, pollQuestion, pollOptions, replyToMessage?.id);
      setShowPollDialog(false);
      setReplyToMessage(null);
      router.refresh();
    } finally {
      setIsSendingPoll(false);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    setLocalMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await deleteGroupMessage(messageId);
    } catch {}
  };

  const handleReaction = async (messageId: number, emoji: string) => {
    // Optimistic toggle
    setLocalMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions: any[] = msg.reactions ?? [];
        const existing = reactions.find(
          (r: any) => r.userId === currentUserId && r.emoji === emoji
        );
        const newReactions = existing
          ? reactions.filter((r: any) => !(r.userId === currentUserId && r.emoji === emoji))
          : [...reactions, { id: -Date.now(), messageId, userId: currentUserId, emoji }];
        return { ...msg, reactions: newReactions };
      })
    );
    setReactionMessageId(null);
    try {
      await toggleGroupMessageReaction(messageId, emoji);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* HEADER */}
      <div className="px-4 py-3 md:px-6 md:py-4 border-b border-border flex justify-between items-center bg-background z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0 shadow-sm border border-border/50">
            <Hash className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] md:text-[18px] font-semibold tracking-tight text-foreground truncate">
              {group.name}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[11px] md:text-[12px] text-muted-foreground truncate max-w-[200px]">
                {group.description || "Group chat"}
              </p>
              <span className="text-[10px] text-muted-foreground/30"></span>
              <button
                onClick={() => setShowMembers(true)}
                className="flex items-center gap-1 text-[11px] md:text-[12px] text-blue-500 hover:underline font-medium"
              >
                <Users className="size-3" />
                {group.members?.length || 0} members
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMembers(true)}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
          >
            <Info className="size-5" />
          </button>
        </div>
      </div>

      {/* MESSAGES AREA */}
      <div
        ref={scrollerRef}
        onScroll={updateIsNearBottom}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#fafafa] dark:bg-[#111113] no-scrollbar"
      >
        {localMessages.map((msg: any) => {
          const isMe = msg.senderId === currentUserId;
          const reactionsByEmoji = (msg.reactions || []).reduce((acc: any, r: any) => {
            if (!acc[r.emoji]) acc[r.emoji] = [];
            acc[r.emoji].push(r);
            return acc;
          }, {});

          return (
            <div key={msg.id} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
            <div className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"} max-w-[85%]`}>
              {!isMe && (
                <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border/50 mt-1">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {msg.senderUsername?.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <div className={`flex-1 flex flex-col ${isMe ? "items-end" : "items-start"} min-w-0`}>
                {!isMe && (
                  <span className="text-[11px] font-medium text-muted-foreground mb-1 px-1 flex items-center gap-2">
                    {msg.senderUsername}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted border border-border/50 font-mono uppercase tracking-tighter">
                      {msg.senderRole}
                    </span>
                  </span>
                )}

                <div
                  onDoubleClick={() => setReplyToMessage(msg)}
                  className={`group relative p-3 rounded-2xl text-[14px] leading-relaxed shadow-sm transition-all duration-200 cursor-pointer ${isMe
                  ? "bg-foreground text-background rounded-tr-sm"
                  : "bg-card text-card-foreground border border-border/50 rounded-tl-sm"
                  }`}
                >
                  {msg.replyTo && (
                    <div className="mb-2 px-2 py-1 rounded-md border border-border/40 bg-background/40 text-[11px] text-muted-foreground">
                      Replying to: {msg.replyTo.content}
                    </div>
                  )}
                  {msg.poll ? (
                    <PollMessage
                      poll={msg.poll}
                      currentUserId={currentUserId}
                      isOwnMessage={isMe}
                      getVoterLabel={(uid) => group.members?.find((m: any) => m.userId === uid)?.displayName || uid}
                    />
                  ) : msg.messageType === "COMMAND" && msg.commandUrl ? (
                    <a
                      href={msg.commandUrl}
                      className="block rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[13px] text-blue-600 dark:text-blue-300 hover:bg-blue-500/15"
                    >
                      {msg.commandLabel || msg.content}
                    </a>
                  ) : (
                    <MarkdownMessage content={msg.content} />
                  )}

                  {/* REACTION PICKER OVERLAY */}
                  <div className={`absolute top-[-16px] ${isMe ? "right-0" : "left-0"} flex items-center p-1 rounded-full bg-card shadow-lg border border-border/30 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 gap-0.5 scale-90 group-hover:scale-100`}>
                    {AVAILABLE_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(msg.id, emoji)}
                        className="w-7 h-7 flex items-center justify-center text-[14px] hover:bg-muted rounded-full transition-colors active:scale-90"
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="w-[1px] h-4 bg-border mx-1" />
                    <button
                      onClick={() => setReactionMessageId(reactionMessageId === msg.id ? null : msg.id)}
                      className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                    >
                      <SmilePlus className="size-4" />
                    </button>
                    {(msg.senderId === currentUserId || group.members?.find((m: any) => m.userId === currentUserId)?.isOwner) && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  {reactionMessageId === msg.id && (
                    <div ref={reactionEmojiRef} className={`absolute z-50 ${isMe ? "right-0" : "left-0"} top-8 shadow-2xl`}>
                      <EmojiPicker
                        onEmojiClick={(emojiData) => handleReaction(msg.id, emojiData.emoji)}
                        width={280}
                        height={350}
                        theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                      />
                    </div>
                  )}
                </div>

                {/* REACTIONS DISPLAY WITH MEMBER POPOVER */}
                {Object.keys(reactionsByEmoji).length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? "justify-end" : "justify-start"}`}>
                    <TooltipProvider delayDuration={100}>
                      {Object.entries(reactionsByEmoji).map(([emoji, reacts]: [string, any]) => {
                        const hasReacted = reacts.some((r: any) => r.userId === currentUserId);
                        return (
                          <Tooltip key={emoji}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleReaction(msg.id, emoji)}
                                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border transition-all duration-200 ${hasReacted
                                  ? "bg-blue-500/10 border-blue-500/30 text-blue-500"
                                  : "bg-background border-border text-muted-foreground hover:bg-muted"
                                  }`}
                              >
                                <span>{emoji}</span>
                                <span className="font-semibold">{reacts.length}</span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="p-2 min-w-[120px] border-none shadow-2xl bg-background/95 backdrop-blur-md">
                              <div className="space-y-1">
                                <p className="text-[10px] font-medium text-muted-foreground  tracking-widest mb-1 border-b border-border/30 pb-1">
                                  Reacted with {emoji}
                                </p>
                                {reacts.map((r: any) => {
                                  const member = group.members?.find((m: any) => m.userId === r.userId);
                                  return (
                                    <div key={r.id} className="text-[11px] font-medium py-0.5">
                                      {member ? member.displayName : "Unknown Member"}
                                    </div>
                                  );
                                })}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                )}

                <div className="mt-1.5 text-[10px] text-muted-foreground/60 font-medium px-1 uppercase tracking-tight">
                  {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
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
          <div className="mb-2 px-3 py-2 rounded-md border border-border bg-muted/40 text-[12px] text-muted-foreground flex items-center justify-between gap-2 max-w-4xl mx-auto">
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
        <div className="flex gap-2 relative max-w-4xl mx-auto mb-2 justify-end">
          <button
            type="button"
            onClick={() => setShowInputEmoji(!showInputEmoji)}
            disabled={isMuted}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SmilePlus className="size-5" />
          </button>
        </div>
        <div className="max-w-4xl mx-auto">
          <RichMessageInput
            placeholder={isMuted ? "You are muted in this group." : "Message this group..."}
            onSubmit={handleSendMessage}
            disabled={isSending || isMuted}
            appendTextToken={emojiToken}
            onTokenConsumed={() => setEmojiToken(null)}
            onSlashCommands={[
              {
                id: "poll",
                title: "/poll",
                description: "Create a poll with 2+ options",
                keywords: ["vote", "survey"],
                icon: defaultIcons.poll,
                onSelect: openPoll,
              },
              {
                id: "ticket",
                title: "/ticket",
                description: "Send support-ticket redirect message",
                keywords: ["support", "helpdesk"],
                icon: defaultIcons.ticket,
                onSelect: async () => {
                  await sendGroupCommandMessage(group.id, "Open Support Tickets", "/support", replyToMessage?.id);
                  router.refresh();
                  setReplyToMessage(null);
                },
              },
              {
                id: "help",
                title: "/help",
                description: "Show available commands",
                keywords: ["commands", "slash"],
                icon: defaultIcons.help,
                onSelect: () => undefined,
              },
            ]}
          />
        </div>
      </div>

      {/* MEMBERS SIDE SHEET */}
      <Dialog open={showPollDialog} onOpenChange={setShowPollDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Poll</DialogTitle>
            <DialogDescription className="pt-2">
              Add a question and at least two options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest">
                Question
              </label>
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
                className="w-full h-10 px-3 rounded-md text-[14px] text-foreground bg-background outline-none shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest">
                Options
              </label>
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((p, i) => (i === idx ? e.target.value : p))
                        )
                      }
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 h-10 px-3 rounded-md text-[14px] text-foreground bg-background outline-none shadow-[rgba(0,0,0,0.08)_0px_0px_0px_1px] dark:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_1px]"
                    />
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={pollOptions.length <= 2}
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ""])}
                className="px-3 py-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
              >
                Add option
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <button
              onClick={() => setShowPollDialog(false)}
              className="px-4 py-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSendPoll}
              disabled={isSendingPoll}
              className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSendingPoll ? "Sending..." : "Send poll"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showMembers} onOpenChange={setShowMembers}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col border-none shadow-2xl bg-background/95 backdrop-blur-md">
          <SheetHeader className="p-6 border-b border-border/30 text-left">
            <SheetTitle className="text-[18px] font-semibold flex items-center gap-2">
              <Users className="size-5" />
              Group Members
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <GroupMembersPanel group={group} currentUserId={currentUserId} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
