import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getDomainStore } from "../storage.js";

// Register all 9 category buttons for the 3x3 grid on /start.
const CATEGORIES = [
  { label: "❤️ Love", data: "category:love", order: 10 },
  { label: "🌿 Nature", data: "category:nature", order: 11 },
  { label: "✨ Fantasy", data: "category:fantasy", order: 12 },
  { label: "🎞 Vintage", data: "category:vintage", order: 13 },
  { label: "🤖 Cyberpunk", data: "category:cyberpunk", order: 14 },
  { label: "🎨 Artistic", data: "category:artistic", order: 15 },
  { label: "💼 Professional", data: "category:professional", order: 16 },
  { label: "💄 Glamour", data: "category:glamour", order: 17 },
  { label: "🎉 Fun", data: "category:fun", order: 18 },
];

for (const cat of CATEGORIES) {
  registerMainMenuItem(cat);
}

// Also register the Upload New Selfie and Credits buttons.
registerMainMenuItem({ label: "📷 Upload Selfie", data: "action:replace_selfie", order: 5 });
registerMainMenuItem({ label: "💰 Credits", data: "credits:show", order: 6 });

const WELCOME = "👋 Welcome to SelfieStyle! Upload a selfie, then pick a style below to transform it.";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  // Ensure user profile exists
  const store = getDomainStore();
  const userId = ctx.from?.id;
  if (userId) {
    const existing = await store.getUserProfile(userId);
    if (!existing) {
      await store.setUserProfile(userId, {
        telegram_id: userId,
        display_name: ctx.from?.first_name ?? "User",
        consent_timestamp: Date.now(),
        credit_balance: 5, // 5 free credits on signup
      });
    }
  }
  ctx.session.step = "idle";
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard(3) });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard(3) });
});

export default composer;
