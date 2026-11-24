import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { isWebPushConfigured, sendWebPushToUser } from "./webPush.js";

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

  // Best-effort Native Web Push fanout (inert unless VAPID keys are configured in Render).
  if (input.userId && isWebPushConfigured()) {
    void sendWebPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      tag: `midyaf-${input.channel.toLowerCase()}`
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
