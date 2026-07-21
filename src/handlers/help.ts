import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "ℹ️ SelfieStyle turns your selfies into stunning styled images!\n\n" +
  "Here's how it works:\n" +
  "1. Upload a selfie\n" +
  "2. Pick a style from the menu\n" +
  "3. Choose how many images to generate\n" +
  "4. Download your styled images!\n\n" +
  "It's completely free — generate as many as you like.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
