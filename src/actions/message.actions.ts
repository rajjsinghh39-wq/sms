"use server";

import prisma from "../lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

async function getBlockStatus(viewerId: string, otherId: string) {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: otherId },
        { blockerId: otherId, blockedId: viewerId },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });

  return {
    isBlocked: !!block,
    isBlockedByMe: block?.blockerId === viewerId,
    hasBlockedMe: block?.blockerId === otherId,
  };
}

export async function verifyAccessCode(code: string) {
  const { userId: currentUserId } = auth();
  if (!currentUserId) throw new Error("Unauthorized");

  const student = await prisma.student.findUnique({ where: { accessCode: code }, select: { id: true, username: true, name: true, surname: true } });
  if (student) return { id: student.id, username: student.username, name: student.name, surname: student.surname, role: "student" };

  const teacher = await prisma.teacher.findUnique({ where: { accessCode: code }, select: { id: true, username: true, name: true, surname: true } });
  if (teacher) return { id: teacher.id, username: teacher.username, name: teacher.name, surname: teacher.surname, role: "teacher" };

  const parent = await prisma.parent.findUnique({ where: { accessCode: code }, select: { id: true, username: true, name: true, surname: true } });
  if (parent) return { id: parent.id, username: parent.username, name: parent.name, surname: parent.surname, role: "parent" };

  const admin = await prisma.admin.findUnique({ where: { accessCode: code }, select: { id: true, username: true } });
  if (admin) return { id: admin.id, username: admin.username, name: "Admin", surname: "", role: "admin" };

  return null;
}

export async function startConversation(targetUserId: string) {
  const { userId: currentUserId } = auth();
  if (!currentUserId) throw new Error("Unauthorized");

  const blockStatus = await getBlockStatus(currentUserId, targetUserId);
  if (blockStatus.isBlocked) {
    throw new Error(
      blockStatus.isBlockedByMe
        ? "You blocked this user."
        : "You can't start a conversation with this user."
    );
  }

  // Sort IDs to ensure uniqueness in @@unique([user1Id, user2Id])
  const [user1Id, user2Id] = [currentUserId, targetUserId].sort();

  const conversation = await prisma.conversation.upsert({
    where: {
      user1Id_user2Id: { user1Id, user2Id },
    },
    update: {},
    create: {
      user1Id,
      user2Id,
    },
  });

  revalidatePath("/messages");
  return conversation.id;
}

export async function getConversations() {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedByMe = new Set(blocks.filter(b => b.blockerId === userId).map(b => b.blockedId));
  const hasBlockedMe = new Set(blocks.filter(b => b.blockedId === userId).map(b => b.blockerId));

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Batch all role lookups — 4 parallel queries regardless of conversation count
  const otherIds = conversations.map((conv) =>
    conv.user1Id === userId ? conv.user2Id : conv.user1Id
  );

  const [students, teachers, parents, admins, unreadRows] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, username: true, name: true, surname: true },
    }),
    prisma.teacher.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, username: true, name: true, surname: true },
    }),
    prisma.parent.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, username: true, name: true, surname: true },
    }),
    prisma.admin.findMany({
      where: { id: { in: otherIds } },
      select: { id: true, username: true },
    }),
    // Single groupBy replaces N count() calls
    prisma.directMessage.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: userId },
        isRead: false,
      },
      _count: { id: true },
    }),
  ]);

  // Build lookup maps
  const userMap = new Map<string, { username: string; name: string; surname: string; role: string }>();
  for (const s of students) userMap.set(s.id, { ...s, role: "student" });
  for (const t of teachers) userMap.set(t.id, { ...t, role: "teacher" });
  for (const p of parents) userMap.set(p.id, { ...p, role: "parent" });
  for (const a of admins) userMap.set(a.id, { username: a.username, name: "Admin", surname: "", role: "admin" });
  const unreadMap = new Map(unreadRows.map((r) => [r.conversationId, r._count.id]));

  const enrichedConversations = conversations.map((conv) => {
    const otherId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
    const otherUser = userMap.get(otherId);
    return {
      ...conv,
      unreadCount: unreadMap.get(conv.id) ?? 0,
      otherUser: {
        id: otherId,
        username: otherUser?.username ?? "Unknown",
        name: otherUser?.name ?? "",
        surname: otherUser?.surname ?? "",
        role: otherUser?.role ?? "student",
        isBlockedByMe: blockedByMe.has(otherId),
        hasBlockedMe: hasBlockedMe.has(otherId),
      },
    };
  });

  return enrichedConversations;
}

export async function getConversationMessages(conversationId: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  return await prisma.directMessage.findMany({
    where: { conversationId },
    include: {
      reactions: true,
      poll: {
        include: {
          options: true,
          votes: true,
        },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          senderId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendDirectMessage(conversationId: number, content: string, replyToId?: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.isClosed) throw new Error("Conversation is closed or not found");

  const otherId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
  const blockStatus = await getBlockStatus(userId, otherId);
  if (blockStatus.isBlocked) {
    throw new Error(
      blockStatus.isBlockedByMe
        ? "You blocked this user."
        : "You can't message this user."
    );
  }

  const msg = await prisma.directMessage.create({
    data: {
      content,
      conversationId,
      senderId: userId,
      replyToId: replyToId || null,
    },
  });

  revalidatePath("/messages");
  return msg;
}

export async function sendDirectCommandMessage(
  conversationId: number,
  label: string,
  url: string,
  replyToId?: number
) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.isClosed) throw new Error("Conversation is closed or not found");

  const msg = await prisma.directMessage.create({
    data: {
      content: label,
      conversationId,
      senderId: userId,
      messageType: "COMMAND",
      commandKey: "ticket",
      commandLabel: label,
      commandUrl: url,
      replyToId: replyToId || null,
    },
  });
  revalidatePath("/messages");
  return msg;
}

export async function sendDirectPoll(
  conversationId: number,
  question: string,
  options: string[],
  replyToId?: number
) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  if (!question.trim()) throw new Error("Question is required");
  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  if (cleaned.length < 2) throw new Error("At least 2 options are required");

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.isClosed) throw new Error("Conversation is closed or not found");

  const otherId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
  const blockStatus = await getBlockStatus(userId, otherId);
  if (blockStatus.isBlocked) {
    throw new Error(
      blockStatus.isBlockedByMe ? "You blocked this user." : "You can't message this user."
    );
  }

  const msg = await prisma.directMessage.create({
    data: {
      content: question,
      conversationId,
      senderId: userId,
      replyToId: replyToId || null,
      poll: {
        create: {
          question,
          options: {
            create: cleaned.map((text) => ({ text })),
          },
        },
      },
    },
    include: {
      reactions: true,
      poll: { include: { options: true, votes: true } },
    },
  });

  revalidatePath("/messages");
  return msg;
}

export async function deleteDirectMessage(messageId: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const msg = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversation: { select: { user1Id: true, user2Id: true } } },
  });
  if (!msg) throw new Error("Message not found");
  const canDelete = msg.senderId === userId || msg.conversation.user1Id === userId || msg.conversation.user2Id === userId;
  if (!canDelete) throw new Error("Unauthorized");

  await prisma.directMessage.delete({ where: { id: messageId } });
  revalidatePath("/messages");
}

export async function voteOnPoll(pollId: number, optionId: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const option = await prisma.pollOption.findUnique({
    where: { id: optionId },
    select: { id: true, pollId: true },
  });
  if (!option || option.pollId !== pollId) throw new Error("Invalid option");

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId } },
    update: { optionId },
    create: { pollId, optionId, userId },
  });

  revalidatePath("/messages");
  return { ok: true };
}

export async function blockUser(targetUserId: string, conversationId?: number) {
  const { userId: currentUserId } = auth();
  if (!currentUserId) throw new Error("Unauthorized");
  if (!targetUserId) throw new Error("Missing target user");
  if (targetUserId === currentUserId) throw new Error("You can't block yourself");

  await prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: {
        blockerId: currentUserId,
        blockedId: targetUserId,
      },
    },
    update: {},
    create: { blockerId: currentUserId, blockedId: targetUserId },
  });

  if (conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { user1Id: true, user2Id: true, isClosed: true },
    });
    if (conv && (conv.user1Id === currentUserId || conv.user2Id === currentUserId)) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isClosed: true, closedBy: currentUserId },
      });
    }
  }

  revalidatePath("/messages");
  return { ok: true };
}

export async function unblockUser(targetUserId: string) {
  const { userId: currentUserId } = auth();
  if (!currentUserId) throw new Error("Unauthorized");
  if (!targetUserId) throw new Error("Missing target user");
  if (targetUserId === currentUserId) throw new Error("You can't unblock yourself");

  await prisma.userBlock.deleteMany({
    where: { blockerId: currentUserId, blockedId: targetUserId },
  });

  revalidatePath("/messages");
  return { ok: true };
}

export async function toggleDMReaction(messageId: number, emoji: string) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const existingReaction = await prisma.directMessageReaction.findUnique({
    where: {
      messageId_userId_emoji: {
        messageId,
        userId,
        emoji,
      },
    },
  });

  if (existingReaction) {
    await prisma.directMessageReaction.delete({
      where: { id: existingReaction.id },
    });
  } else {
    await prisma.directMessageReaction.create({
      data: {
        messageId,
        userId,
        emoji,
      },
    });
  }

  revalidatePath("/messages");
}

export async function toggleConversationStatus(id: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) throw new Error("Conversation not found");

  await prisma.conversation.update({
    where: { id },
    data: {
      isClosed: !conv.isClosed,
      closedBy: !conv.isClosed ? userId : null,
    },
  });

  revalidatePath("/messages");
}

export async function deleteConversation(id: number) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  // Ensure the user is part of the conversation
  const conv = await prisma.conversation.findUnique({ 
    where: { id },
    select: { user1Id: true, user2Id: true }
  });

  if (!conv || (conv.user1Id !== userId && conv.user2Id !== userId)) {
    throw new Error("Conversation not found or unauthorized");
  }

  await prisma.conversation.delete({ where: { id } });

  revalidatePath("/messages");
}

export async function getUserAccessCode() {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  if (!userId || !role) throw new Error("Unauthorized");

  if (role === "student") {
    const student = await prisma.student.findUnique({ where: { id: userId }, select: { accessCode: true } });
    return student?.accessCode || null;
  }
  if (role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { id: userId }, select: { accessCode: true } });
    return teacher?.accessCode || null;
  }
  if (role === "parent") {
    const parent = await prisma.parent.findUnique({ where: { id: userId }, select: { accessCode: true } });
    return parent?.accessCode || null;
  }
  if (role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { id: userId }, select: { accessCode: true } });
    return admin?.accessCode || null;
  }

  return null;
}

export async function rerollAccessCode() {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  if (!userId || !role) throw new Error("Unauthorized");

  const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  if (role === "admin") {
    const user = await currentUser();
    const realUsername = user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "admin";

    // Admins might not have a DB record if they were created before this feature
    await prisma.admin.upsert({
      where: { id: userId },
      update: { accessCode: newCode, username: realUsername },
      create: { 
        id: userId, 
        username: realUsername, 
        accessCode: newCode 
      },
    });
  } else if (role === "student") {
    await prisma.student.update({ where: { id: userId }, data: { accessCode: newCode } });
  } else if (role === "teacher") {
    await prisma.teacher.update({ where: { id: userId }, data: { accessCode: newCode } });
  } else if (role === "parent") {
    await prisma.parent.update({ where: { id: userId }, data: { accessCode: newCode } });
  }

  revalidatePath("/settings");
  return newCode;
}
