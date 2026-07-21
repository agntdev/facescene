import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("action:replace_selfie", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_selfie";
  await ctx.reply(
    "📸 Send me a new selfie! I'll use it for your next style transformation.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Handle incoming photo (selfie upload)
composer.on("message:photo", async (ctx) => {
  if (ctx.session.step !== "awaiting_selfie") return;

  const photo = ctx.message.photo;
  // Use the largest photo size
  const largest = photo[photo.length - 1];
  ctx.session.selfieFileId = largest.file_id;
  ctx.session.step = "idle";

  const selectedCategory = ctx.session.selectedCategory;
  if (selectedCategory) {
    // User was in a category flow — continue to image count
    ctx.session.step = "awaiting_image_count";
    await ctx.reply(
      "✅ Selfie received! How many images would you like?",
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
  } else {
    await ctx.reply(
      "✅ Selfie saved! Now pick a style from the menu below.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  }
});

export default composer;
