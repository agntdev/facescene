import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("credits:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "🎉 SelfieStyle is completely free to use!\n\nGenerate as many images as you like — no credits, no limits.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
