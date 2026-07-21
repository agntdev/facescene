import { Composer } from "grammy";
import type { Ctx } from "../bot.js";

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID
  ? parseInt(process.env.ADMIN_TELEGRAM_ID, 10)
  : 0;

const composer = new Composer<Ctx>();

async function notifyAdmin(api: Ctx["api"], message: string): Promise<void> {
  if (!ADMIN_ID) return;
  try {
    await api.sendMessage(ADMIN_ID, message);
  } catch {
    // Best-effort — admin notification failure never blocks the bot
  }
}

composer.callbackQuery("gen:confirm", async (ctx, next) => {
  return next();
});

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
