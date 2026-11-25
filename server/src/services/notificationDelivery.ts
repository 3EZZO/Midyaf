import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { notifyUsersByWebPush } from "./webPush.js";

export type NotificationChannel = "SMS" | "WHATSAPP" | "FCM" | "IN_APP";

export type SendNotificationInput = {
  channel: NotificationChannel;
  userId?: string;
  phone?: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export async function sendNotification(input: SendNotificationInput) {
  const provider = providerName(input.channel);
  const status = "queued";
  const notification = input.userId
    ? await prisma.notification.create({
        data: {
          userId: input.userId,
          title: input.title,
          body: input.body,
          channel: input.channel,
          deliveryStatus: status,
          provider,
          recipientPhone: input.phone,
          metadata: input.metadata as Prisma.InputJsonValue | undefined
        }
      })
    : null;

  // Provider integration point:
  // SMS/WhatsApp can be connected to Unifonic, Twilio, or WhatsApp Cloud API.
  // FCM can be connected once Firebase service credentials are configured.
  console.log("Queued Midyaf notification", {
    channel: input.channel,
    userId: input.userId,
    phone: input.phone,
    title: input.title,
    provider,
    status
  });

  // Best-effort Native Web Push fanout (inert unless VAPID keys are configured).
  // Lock-screen payloads always use generic no-PII copy and a per-item tag; the
  // full notification title/body stays strictly inside the authenticated app.
  if (input.userId) {
    const fileAssetId =
      typeof input.metadata?.fileAssetId === "string" ? input.metadata.fileAssetId : null;
    const tag = fileAssetId
      ? `midyaf-upload-${fileAssetId}`
      : notification?.id
        ? `midyaf-notif-${notification.id}`
        : `midyaf-${input.channel.toLowerCase()}`;
    notifyUsersByWebPush([input.userId], {
      title: "Midyaf — New update",
      body: "Open Midyaf to view details.",
      tag,
      url: "/"
    });
  }

  return {
    provider,
    status,
    notification
  };
}

function providerName(channel: NotificationChannel) {
  switch (channel) {
    case "SMS":
      return "sms-provider-pending";
    case "WHATSAPP":
      return "whatsapp-provider-pending";
    case "FCM":
      return "firebase-fcm-pending";
    case "IN_APP":
    default:
      return "midyaf-in-app";
  }
}
