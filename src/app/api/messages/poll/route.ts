import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/messages/poll?convId=X&type=direct|group&since=ISO_TIMESTAMP
 * Returns only NEW messages from OTHER users since `since`.
 * The caller's own messages are handled optimistically — no need to refetch them.
 */
export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const convId = parseInt(searchParams.get("convId") ?? "0");
  const type = searchParams.get("type") ?? "direct";
  const since = searchParams.get("since");

  if (!convId || !since) return NextResponse.json([]);

  let sinceDate: Date;
  try {
    sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) return NextResponse.json([]);
  } catch {
    return NextResponse.json([]);
  }

  if (type === "group") {
    // Verify membership
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: convId, userId } },
      select: { id: true },
    });
    if (!member) return NextResponse.json([], { status: 403 });

    const messages = await prisma.groupMessage.findMany({
      where: {
        groupId: convId,
        senderId: { not: userId }, // caller already owns their own messages optimistically
        createdAt: { gt: sinceDate },
      },
      include: {
        reactions: true,
        poll: { include: { options: true, votes: true } },
        replyTo: { select: { id: true, content: true, senderId: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(messages);
  } else {
    // Direct message — verify membership
    const conv = await prisma.conversation.findFirst({
      where: {
        id: convId,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: { id: true },
    });
    if (!conv) return NextResponse.json([], { status: 403 });

    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId: convId,
        senderId: { not: userId }, // caller already owns their own messages optimistically
        createdAt: { gt: sinceDate },
      },
      include: {
        reactions: true,
        poll: { include: { options: true, votes: true } },
        replyTo: { select: { id: true, content: true, senderId: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(messages);
  }
}
