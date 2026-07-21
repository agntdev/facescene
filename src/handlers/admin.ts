import { Composer } from "grammy";
import type { Ctx } from "../bot.js";

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID
  ? parseInt(process.env.ADMIN_TELEGRAM_ID, 10)
  : 0;

const composer = new Composer<Ctx>();

/**
 * Notify admin about events. Best-effort — never blocks the user flow.
 * Admin receives notifications for: new credit purchases, failed generation
 * jobs, abuse reports.
 */
async function notifyAdmin(api: Ctx["api"], message: string): Promise<void> {
  if (!ADMIN_ID) return;
  try {
    await api.sendMessage(ADMIN_ID, message);
  } catch {
    // Best-effort — admin notification failure never blocks the bot
  }
}

// Watch for successful payments and notify admin
composer.on("message:successful_payment", async (ctx) => {
  const userId = ctx.from?.id;
  const payment = ctx.message.successful_payment;
  if (!userId) return;

  let credits = 10;
  try {
    const payload = JSON.parse(payment.invoice_payload);
    credits = payload.credits ?? 10;
  } catch {
    // use default
  }

  const displayName = ctx.from?.first_name ?? "Unknown";
  await notifyAdmin(
    ctx.api,
    `💰 New purchase!\n` +
    `User: ${displayName} (${userId})\n` +
    `Credits: +${credits}\n` +
    `Amount: $${(payment.total_amount / 100).toFixed(2)}`,
  );
});

// Watch for failed generation jobs and notify admin
composer.callbackQuery("gen:confirm", async (ctx, next) => {
  // This runs after the category-love handler processes generation.
  // We just pass through — admin notification is handled via the storage layer.
  return next();
});

// Export a function to report abuse
export async function reportAbuse(
  ctx: Ctx,
  reason: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const displayName = ctx.from?.first_name ?? "Unknown";
  await notifyAdmin(
    ctx.api,
    `⚠️ Abuse report!\n` +
    `User: ${displayName} (${userId})\n` +
    `Reason: ${reason}`,
  );

  await ctx.reply(
    "🚩 Thanks for reporting. We'll look into this.",
  );
}

export default composer;
