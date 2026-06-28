import type { Server } from "socket.io";
import { prisma } from "../db.js";

export function startDelayMonitor(io: Server) {
  const interval = setInterval(() => {
    void scanForDelayedDrivers(io).catch((error) => {
      console.warn("Delay monitor skipped:", error.message);
    });
  }, 60_000);

  return () => clearInterval(interval);
}

async function scanForDelayedDrivers(io: Server) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);

  const delayedTasks = await prisma.task.findMany({
    where: {
      status: { in: ["ASSIGNED", "ACCEPTED", "EN_ROUTE"] },
      driver: {
        OR: [{ lastLocationAt: null }, { lastLocationAt: { lt: staleBefore } }]
      }
    },
    include: {
      event: true,
      driver: { include: { user: true } },
      guest: { include: { user: true } }
    },
    take: 20
  });

  for (const task of delayedTasks) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "DELAYED" }
    });

    await prisma.notification.create({
      data: {
        userId: task.event.organizerId,
        title: "Delay alert",
        body: `${task.driver?.user.name ?? "A driver"} has not shared location for 5 minutes.`
      }
    });

    io.to(`event:${task.eventId}`).emit("alert:delay", {
      taskId: task.id,
      eventId: task.eventId,
      driverId: task.driverId,
      guestId: task.guestId,
      message: "No driver location update in 5 minutes."
    });
  }
}
