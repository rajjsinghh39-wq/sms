"use server";

import prisma from "../lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

type BadgeTone = "blue" | "yellow" | "red";

async function resolveRole(userId: string, roleFromClaims?: string) {
  if (roleFromClaims) return roleFromClaims;
  const [teacher, student, parent, admin] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.student.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.parent.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.admin.findUnique({ where: { id: userId }, select: { id: true } }),
  ]);
  if (teacher) return "teacher";
  if (student) return "student";
  if (parent) return "parent";
  if (admin) return "admin";
  return undefined;
}

function roleWhere(role: string, userId: string) {
  if (role === "student") return { studentId: userId };
  if (role === "teacher") return { teacherId: userId };
  if (role === "parent") return { parentId: userId };
  if (role === "admin") return { adminId: userId };
  return null;
}

export async function getUnreadCounts() {
  const { userId, sessionClaims } = auth();
  if (!userId) {
    return {
      messages: 0,
      tickets: 0,
      notifications: 0,
      teachers: 0,
      students: 0,
      parents: 0,
      grades: 0,
      classes: 0,
      lessons: 0,
      courses: 0,
      enrollments: 0,
      exams: 0,
      assignments: 0,
      results: 0,
      events: 0,
      announcements: 0,
      itemBadges: {},
    };
  }

  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = await resolveRole(userId, claimRole);

  // Direct Messages
  const unreadDMs = await prisma.directMessage.count({
    where: {
      senderId: { not: userId },
      isRead: false,
      conversation: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    },
  });

  // Group Messages
  // We check messages created after the member's lastReadAt
  const groups = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true, lastReadAt: true },
  });

  // Parallel counts — all group queries fire at once instead of one-by-one
  const groupCounts = await Promise.all(
    groups.map((group) =>
      prisma.groupMessage.count({
        where: {
          groupId: group.groupId,
          senderId: { not: userId },
          createdAt: { gt: group.lastReadAt },
        },
      })
    )
  );
  const unreadGroups = groupCounts.reduce((sum, c) => sum + c, 0);

  // Tickets (Support + Public Tickets)
  let unreadSupportTickets = 0;
  let unreadPublicTickets = 0;
  if (role === "admin") {
    unreadSupportTickets = await prisma.ticketMessage.count({
      where: {
        senderRole: { not: "admin" },
        isRead: false,
      },
    });
    unreadPublicTickets = await prisma.publicTicketMessage.count({
      where: {
        isAdminReply: false,
        isRead: false,
      },
    });
  } else {
    const supportTicketWhere =
      role === "student"
        ? { studentId: userId }
        : role === "teacher"
          ? { teacherId: userId }
          : role === "parent"
            ? { parentId: userId }
            : null;

    unreadSupportTickets = supportTicketWhere
      ? await prisma.ticketMessage.count({
          where: {
            isRead: false,
            senderRole: "admin",
            ticket: supportTicketWhere,
          },
        })
      : 0;

    unreadPublicTickets = await prisma.publicTicketMessage.count({
      where: {
        isAdminReply: true,
        isRead: false,
        ticket: {
          submitterUserId: userId,
        },
      },
    });
  }
  const unreadTickets = unreadSupportTickets + unreadPublicTickets;

  const notificationWhere = role ? roleWhere(role, userId) : null;
  
  // For non-message/ticket notifications, use isViewed instead of isRead
  const nonMessageTicketTypes = [
    "TEACHER_CREATED", "TEACHER_UPDATED", "TEACHER_DELETED",
    "STUDENT_CREATED", "STUDENT_UPDATED", "STUDENT_DELETED",
    "PARENT_CREATED", "PARENT_UPDATED", "PARENT_DELETED",
    "GRADE_CREATED", "GRADE_UPDATED", "GRADE_DELETED",
    "CLASS_CREATED", "CLASS_UPDATED", "CLASS_DELETED",
    "LESSON_CREATED", "LESSON_UPDATED", "LESSON_DELETED",
    "COURSE_SUBMITTED", "COURSE_APPROVED", "COURSE_REJECTED",
    "COURSE_EXPIRED", "COURSE_UPDATED", "COURSE_DELETED",
    "COURSE_ENROLLMENT",
    "EXAM_CREATED", "EXAM_UPDATED", "EXAM_DELETED",
    "ASSIGNMENT_CREATED", "ASSIGNMENT_UPDATED", "ASSIGNMENT_DELETED",
    "RESULT_POSTED", "RESULT_UPDATED", "RESULT_DELETED",
    "EVENT_CREATED", "EVENT_UPDATED", "EVENT_DELETED",
    "ANNOUNCEMENT_CREATED", "ANNOUNCEMENT_UPDATED", "ANNOUNCEMENT_DELETED",
  ] as any[];
  
  const unreadNotificationItems = notificationWhere
    ? await prisma.notification.findMany({
        where: {
          ...notificationWhere,
          OR: [
            { type: { notIn: nonMessageTicketTypes }, isRead: false },
            { type: { in: nonMessageTicketTypes }, isViewed: false } as any,
          ],
        },
        select: { type: true },
      })
    : [];

  const typeCounts = unreadNotificationItems.reduce(
    (acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const bucketByType = (types: string[]) =>
    types.reduce((sum, type) => sum + (typeCounts[type] ?? 0), 0);

  const toneForTypes = (types: string[]): BadgeTone => {
    const hasDelete = types.some((t) => t.endsWith("_DELETED") && (typeCounts[t] ?? 0) > 0);
    if (hasDelete) return "red";
    const hasUpdate = types.some((t) => t.endsWith("_UPDATED") && (typeCounts[t] ?? 0) > 0);
    if (hasUpdate) return "yellow";
    return "blue";
  };

  const unreadNotifications = unreadNotificationItems.length;

  const teachers = bucketByType(["TEACHER_CREATED", "TEACHER_UPDATED", "TEACHER_DELETED"]);
  const students = bucketByType(["STUDENT_CREATED", "STUDENT_UPDATED", "STUDENT_DELETED"]);
  const parents = bucketByType(["PARENT_CREATED", "PARENT_UPDATED", "PARENT_DELETED"]);
  const grades = bucketByType(["GRADE_CREATED", "GRADE_UPDATED", "GRADE_DELETED"]);
  const classes = bucketByType(["CLASS_CREATED", "CLASS_UPDATED", "CLASS_DELETED"]);
  const lessons = bucketByType(["LESSON_CREATED", "LESSON_UPDATED", "LESSON_DELETED"]);
  const courses = bucketByType([
    "COURSE_SUBMITTED",
    "COURSE_APPROVED",
    "COURSE_REJECTED",
    "COURSE_EXPIRED",
    "COURSE_UPDATED",
    "COURSE_DELETED",
  ]);
  const enrollments = bucketByType(["COURSE_ENROLLMENT"]);
  const exams = bucketByType(["EXAM_CREATED", "EXAM_UPDATED", "EXAM_DELETED"]);
  const assignments = bucketByType(["ASSIGNMENT_CREATED", "ASSIGNMENT_UPDATED", "ASSIGNMENT_DELETED"]);
  const results = bucketByType(["RESULT_POSTED", "RESULT_UPDATED", "RESULT_DELETED"]);
  const events = bucketByType(["EVENT_CREATED", "EVENT_UPDATED", "EVENT_DELETED"]);
  const announcements = bucketByType([
    "ANNOUNCEMENT_CREATED",
    "ANNOUNCEMENT_UPDATED",
    "ANNOUNCEMENT_DELETED",
  ]);

  const itemBadges = {
    Teachers: { count: teachers, tone: toneForTypes(["TEACHER_CREATED", "TEACHER_UPDATED", "TEACHER_DELETED"]) },
    Students: { count: students, tone: toneForTypes(["STUDENT_CREATED", "STUDENT_UPDATED", "STUDENT_DELETED"]) },
    Parents: { count: parents, tone: toneForTypes(["PARENT_CREATED", "PARENT_UPDATED", "PARENT_DELETED"]) },
    Grades: { count: grades, tone: toneForTypes(["GRADE_CREATED", "GRADE_UPDATED", "GRADE_DELETED"]) },
    Classes: { count: classes, tone: toneForTypes(["CLASS_CREATED", "CLASS_UPDATED", "CLASS_DELETED"]) },
    Lessons: { count: lessons, tone: toneForTypes(["LESSON_CREATED", "LESSON_UPDATED", "LESSON_DELETED"]) },
    "All Courses": {
      count: courses,
      tone: toneForTypes(["COURSE_SUBMITTED", "COURSE_APPROVED", "COURSE_REJECTED", "COURSE_EXPIRED", "COURSE_UPDATED", "COURSE_DELETED"]),
    },
    Approvals: { count: bucketByType(["COURSE_SUBMITTED"]), tone: "blue" as BadgeTone },
    "Course Builder": { count: courses, tone: toneForTypes(["COURSE_SUBMITTED", "COURSE_APPROVED", "COURSE_REJECTED", "COURSE_EXPIRED", "COURSE_UPDATED", "COURSE_DELETED"]) },
    "My Students": { count: enrollments, tone: "blue" as BadgeTone },
    "My Courses": { count: courses, tone: toneForTypes(["COURSE_SUBMITTED", "COURSE_APPROVED", "COURSE_REJECTED", "COURSE_EXPIRED", "COURSE_UPDATED", "COURSE_DELETED"]) },
    "Course Catalog": { count: courses, tone: toneForTypes(["COURSE_SUBMITTED", "COURSE_APPROVED", "COURSE_REJECTED", "COURSE_EXPIRED", "COURSE_UPDATED", "COURSE_DELETED"]) },
    Enrollments: { count: enrollments, tone: "blue" as BadgeTone },
    Exams: { count: exams, tone: toneForTypes(["EXAM_CREATED", "EXAM_UPDATED", "EXAM_DELETED"]) },
    Assignments: { count: assignments, tone: toneForTypes(["ASSIGNMENT_CREATED", "ASSIGNMENT_UPDATED", "ASSIGNMENT_DELETED"]) },
    Results: { count: results, tone: toneForTypes(["RESULT_POSTED", "RESULT_UPDATED", "RESULT_DELETED"]) },
    Events: { count: events, tone: toneForTypes(["EVENT_CREATED", "EVENT_UPDATED", "EVENT_DELETED"]) },
    Announcements: {
      count: announcements,
      tone: toneForTypes(["ANNOUNCEMENT_CREATED", "ANNOUNCEMENT_UPDATED", "ANNOUNCEMENT_DELETED"]),
    },
    Messages: { count: unreadDMs + unreadGroups, tone: "blue" as BadgeTone },
    "Get Support": { count: unreadTickets, tone: "blue" as BadgeTone },
    "Support Tickets": { count: unreadTickets, tone: "blue" as BadgeTone },
    "Public Tickets": { count: unreadPublicTickets, tone: "blue" as BadgeTone },
  };

  return {
    messages: unreadDMs + unreadGroups,
    tickets: unreadTickets,
    notifications: unreadNotifications,
    teachers,
    students,
    parents,
    grades,
    classes,
    lessons,
    courses,
    enrollments,
    exams,
    assignments,
    results,
    events,
    announcements,
    itemBadges,
  };
}

export async function markDirectMessagesAsRead(conversationId: number) {
  const { userId } = auth();
  if (!userId) return;

  await prisma.directMessage.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      isRead: false,
    },
    data: { isRead: true },
  });

  revalidatePath("/", "layout");
  revalidatePath("/messages");
}

export async function markGroupMessagesAsRead(groupId: number) {
  const { userId } = auth();
  if (!userId) return;

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId } },
    data: { lastReadAt: new Date() },
  });

  revalidatePath("/", "layout");
  revalidatePath("/messages");
}

export async function markPublicTicketMessagesAsRead(ticketId: number) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId) return;

  if (role === "admin") {
    await prisma.publicTicketMessage.updateMany({
      where: {
        ticketId,
        isAdminReply: false,
        isRead: false,
      },
      data: { isRead: true },
    });
  } else {
    await prisma.publicTicketMessage.updateMany({
      where: {
        ticketId,
        isAdminReply: true,
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/public-tickets");
  revalidatePath("/tickets");
}

export async function markSupportTicketMessagesAsRead(ticketId: number) {
  const { userId, sessionClaims } = auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  if (!userId || !role) return;

  if (role === "admin") {
    await prisma.ticketMessage.updateMany({
      where: {
        ticketId,
        senderRole: { not: "admin" },
        isRead: false,
      },
      data: { isRead: true },
    });
  } else {
    const supportTicketWhere =
      role === "student"
        ? { studentId: userId }
        : role === "teacher"
          ? { teacherId: userId }
          : role === "parent"
            ? { parentId: userId }
            : null;
    if (!supportTicketWhere) return;

    await prisma.ticketMessage.updateMany({
      where: {
        ticketId,
        senderRole: "admin",
        isRead: false,
        ticket: supportTicketWhere,
      },
      data: { isRead: true },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/support");
}

export async function getMyNotifications(limit = 50) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return [];

  const where = roleWhere(role, userId);
  if (!where) return [];

  return prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationAsRead(id: number) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return;

  const where = roleWhere(role, userId);
  if (!where) return;

  await prisma.notification.updateMany({
    where: { id, ...where, isRead: false },
    data: { isRead: true },
  });
}

export async function markAllMyNotificationsAsRead() {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return;

  const where = roleWhere(role, userId);
  if (!where) return;

  await prisma.notification.updateMany({
    where: { ...where, isRead: false },
    data: { isRead: true },
  });

  revalidatePath("/", "layout");
}

export async function markNotificationsByTypesAsRead(types: string[]) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role || types.length === 0) return;

  const where = roleWhere(role, userId);
  if (!where) return;

  await prisma.notification.updateMany({
    where: {
      ...where,
      isRead: false,
      type: { in: types as any[] },
    },
    data: { isRead: true },
  });

  revalidatePath("/", "layout");
}

export async function getUnreadEntityBadgesByTypes(types: string[]) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role || types.length === 0) return {} as Record<string, { count: number; tone: "blue" | "yellow" | "red" }>;

  const where = roleWhere(role, userId);
  if (!where) return {} as Record<string, { count: number; tone: "blue" | "yellow" | "red" }>;

  const rows = await prisma.notification.findMany({
    where: {
      ...where,
      isRead: false,
      type: { in: types as any[] },
      entityId: { not: null },
    },
    select: { entityId: true, type: true },
  });

  const map: Record<string, { count: number; tone: "blue" | "yellow" | "red" }> = {};
  for (const row of rows) {
    if (!row.entityId) continue;
    const prev = map[row.entityId] ?? { count: 0, tone: "blue" as const };
    const tone =
      row.type.endsWith("_DELETED") ? "red" : row.type.endsWith("_UPDATED") ? "yellow" : prev.tone;
    map[row.entityId] = { count: prev.count + 1, tone };
  }

  return map;
}

export async function markAllMessagesAsRead() {
  const { userId } = auth();
  if (!userId) return;

  await prisma.directMessage.updateMany({
    where: {
      senderId: { not: userId },
      isRead: false,
      conversation: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    },
    data: { isRead: true },
  });

  await prisma.groupMember.updateMany({
    where: { userId },
    data: { lastReadAt: new Date() },
  });

  revalidatePath("/", "layout");
  revalidatePath("/messages");
}

export async function markAllTicketsAsRead() {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return;

  if (role === "admin") {
    await prisma.ticketMessage.updateMany({
      where: {
        senderRole: { not: "admin" },
        isRead: false,
      },
      data: { isRead: true },
    });
    await prisma.publicTicketMessage.updateMany({
      where: {
        isAdminReply: false,
        isRead: false,
      },
      data: { isRead: true },
    });
    await markNotificationsByTypesAsRead(["TICKET_CREATED", "TICKET_UPDATED", "TICKET_DELETED"]);
    revalidatePath("/", "layout");
    revalidatePath("/support");
    revalidatePath("/admin/public-tickets");
    return;
  }

  const supportTicketWhere =
    role === "student"
      ? { studentId: userId }
      : role === "teacher"
        ? { teacherId: userId }
        : role === "parent"
          ? { parentId: userId }
          : null;

  if (supportTicketWhere) {
    await prisma.ticketMessage.updateMany({
      where: {
        senderRole: "admin",
        isRead: false,
        ticket: supportTicketWhere,
      },
      data: { isRead: true },
    });
  }

  await prisma.publicTicketMessage.updateMany({
    where: {
      isAdminReply: true,
      isRead: false,
      ticket: { submitterUserId: userId },
    },
    data: { isRead: true },
  });

  revalidatePath("/", "layout");
  revalidatePath("/support");
  revalidatePath("/admin/public-tickets");
  revalidatePath("/tickets");
}

export async function dismissNotification(notificationId: number) {
  const { userId } = auth();
  if (!userId) return;

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isViewed: true } as any,
  });

  revalidatePath("/", "layout");
}

export async function dismissNotificationsByTypeAndEntity(types: string[], entityId: string) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return;

  const where = roleWhere(role, userId);
  if (!where) return;

  await prisma.notification.updateMany({
    where: {
      ...where,
      type: { in: types as any[] },
      entityId,
    },
    data: { isViewed: true } as any,
  });

  revalidatePath("/", "layout");
}

export async function dismissNotificationsByType(types: string[]) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return;

  const where = roleWhere(role, userId);
  if (!where) return;

  await prisma.notification.updateMany({
    where: {
      ...where,
      type: { in: types as any[] },
    },
    data: { isViewed: true } as any,
  });

  revalidatePath("/", "layout");
}

export async function getNotificationsByTypeAndEntity(types: string[], entityId: string) {
  const { userId, sessionClaims } = auth();
  const claimRole = (sessionClaims?.metadata as { role?: string })?.role;
  const role = userId ? await resolveRole(userId, claimRole) : undefined;
  if (!userId || !role) return [];

  const where = roleWhere(role, userId);
  if (!where) return [];

  return prisma.notification.findMany({
    where: {
      ...where,
      type: { in: types as any[] },
      ...(entityId && { entityId }),
    },
    orderBy: { createdAt: "desc" },
  });
}
