import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getDomainStore, createTxId } from "../storage.js";

const CREDIT_PACKS = [
  { credits: 10, price: 199, label: "10 credits — $1.99" },
  { credits: 25, price: 399, label: "25 credits — $3.99" },
  { credits: 50, price: 699, label: "50 credits — $6.99" },
  { credits: 100, price: 999, label: "100 credits — $9.99" },
];

const PROVIDER_TOKEN = process.env.PAYMENT_PROVIDER_TOKEN ?? "";

const composer = new Composer<Ctx>();

// Show credit balance and purchase options
composer.callbackQuery("credits:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const store = getDomainStore();
  const profile = await store.getUserProfile(userId);
  const balance = profile?.credit_balance ?? 0;

  const packButtons = CREDIT_PACKS.map((pack) => [
    inlineButton(pack.label, `credits:buy:${pack.credits}`),
  ]);

  await ctx.reply(
    `💰 Your balance: ${balance} credits\n\n` +
    `Each image costs 1 credit. Buy more below:`,
    {
      reply_markup: inlineKeyboard([
        ...packButtons,
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Initiate credit purchase via Telegram Payments
composer.callbackQuery(/^credits:buy:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const credits = parseInt(ctx.match[1], 10);
  const pack = CREDIT_PACKS.find((p) => p.credits === credits);
  if (!pack) return;

  if (!PROVIDER_TOKEN) {
    await ctx.reply(
      "⚠️ Payments aren't set up yet. The bot owner needs to configure the payment provider.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // Create a Telegram Payment invoice
  await ctx.replyWithInvoice(
    `SelfieStyle — ${pack.credits} credits`,
    `${pack.credits} image generation credits for SelfieStyle Generator`,
    JSON.stringify({ credits: pack.credits, user_id: ctx.from?.id }),
    "USD",
    [{ label: `${pack.credits} credits`, amount: pack.price }],
    { provider_token: PROVIDER_TOKEN },
  );
});

// Handle successful payment
composer.on("message:successful_payment", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const payment = ctx.message.successful_payment;
  let credits = 10; // default
  try {
    const payload = JSON.parse(payment.invoice_payload);
    credits = payload.credits ?? 10;
  } catch {
    // use default
  }

  // Record transaction
  const store = getDomainStore();
  const txId = createTxId();
  await store.setTransaction(txId, {
    transaction_id: txId,
    user_id: userId,
    credits_added: credits,
    timestamp: Date.now(),
    payment_status: "completed",
  });
  await store.addTransactionToUser(userId, txId);

  // Update user balance
  const profile = await store.getUserProfile(userId);
  if (profile) {
    profile.credit_balance += credits;
    await store.setUserProfile(userId, profile);
  }

  const newBalance = profile?.credit_balance ?? credits;

  await ctx.reply(
    `✅ Payment received! ${credits} credits added.\n\nYour balance: ${newBalance} credits.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Handle refunded payment
composer.on("message:refunded_payment", async (ctx) => {
  await ctx.reply(
    "↩️ Your payment was refunded. If you have questions, contact support.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
