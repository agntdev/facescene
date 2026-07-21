import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.command("prompt", async (ctx) => {
  ctx.session.step = "awaiting_prompt";
  await ctx.reply(
    "✍️ Type a custom prompt for your image. Be creative! For example:\n\n" +
    '"A dreamy portrait with soft pink lighting and flowers"',
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_prompt") return next();

  const prompt = ctx.message.text.trim();
  if (prompt.length < 3) {
    await ctx.reply("That's too short — try a longer description.");
    return;
  }

  ctx.session.customPrompt = prompt;
  ctx.session.selectedCategory = undefined;
  ctx.session.step = "awaiting_image_count";

  await ctx.reply(
    `🎨 Got it! How many images would you like for:\n"${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("1 image", "gen:count:1"),
          inlineButton("2 images", "gen:count:2"),
          inlineButton("3 images", "gen:count:3"),
        ],
        [
          inlineButton("4 images", "gen:count:4"),
          inlineButton("5 images", "gen:count:5"),
        ],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
