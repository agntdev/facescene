import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getDomainStore } from "../storage.js";

const CATEGORIES = [
  { label: "❤️ Love", data: "category:love", order: 10 },
  { label: "👗 Fashion", data: "category:fashion", order: 11 },
  { label: "🌿 Lifestyle", data: "category:lifestyle", order: 12 },
  { label: "🎭 Culture", data: "category:culture", order: 13 },
  { label: "🌙 Dream", data: "category:dream", order: 14 },
  { label: "📱 Social Media", data: "category:social_media", order: 15 },
  { label: "🔮 Secret", data: "category:secret", order: 16 },
  { label: "🎲 Random", data: "category:random", order: 17 },
];

for (const cat of CATEGORIES) {
  registerMainMenuItem(cat);
}

registerMainMenuItem({ label: "📷 Upload Selfie", data: "action:replace_selfie", order: 5 });

const WELCOME = "👋 Welcome to SelfieStyle! Please upload a selfie first, then pick a style below.";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  const store = getDomainStore();
  const userId = ctx.from?.id;
  if (userId) {
    const existing = await store.getUserProfile(userId);
    if (!existing) {
      await store.setUserProfile(userId, {
        telegram_id: userId,
        display_name: ctx.from?.first_name ?? "User",
        consent_timestamp: Date.now(),
      });
    }
  }
  ctx.session.step = "idle";
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard(3) });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard(3) });
});

export default composer;
