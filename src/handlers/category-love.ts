import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getDomainStore, createJobId } from "../storage.js";

const CATEGORY_NAMES: Record<string, string> = {
  love: "Love",
  nature: "Nature",
  fantasy: "Fantasy",
  vintage: "Vintage",
  cyberpunk: "Cyberpunk",
  artistic: "Artistic",
  professional: "Professional",
  glamour: "Glamour",
  fun: "Fun",
};

const CREDITS_PER_IMAGE = 1;

const composer = new Composer<Ctx>();

// Handle all category selections via callback data prefix matching.
composer.callbackQuery(/^category:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category = ctx.match[1];
  const categoryName = CATEGORY_NAMES[category] ?? category;

  // Check if user has uploaded a selfie
  if (!ctx.session.selfieFileId) {
    ctx.session.step = "awaiting_selfie";
    ctx.session.selectedCategory = category;
    await ctx.reply(
      `📸 Send me a selfie first, and I'll apply the ${categoryName} style to it!`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  // User has a selfie — start the generation flow
  ctx.session.selectedCategory = category;
  ctx.session.step = "awaiting_image_count";
  await ctx.reply(
    `✨ Great choice! How many ${categoryName} images would you like?\n\nEach image costs ${CREDITS_PER_IMAGE} credit.`,
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

// Handle image count selection
composer.callbackQuery(/^gen:count:(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = parseInt(ctx.match[1], 10);
  if (count < 1 || count > 5) return;

  ctx.session.imageCount = count;
  ctx.session.step = "confirming_generation";

  const store = getDomainStore();
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = await store.getUserProfile(userId);
  const balance = profile?.credit_balance ?? 0;
  const totalCost = count * CREDITS_PER_IMAGE;
  const categoryName = CATEGORY_NAMES[ctx.session.selectedCategory ?? ""] ?? "Unknown";

  if (balance < totalCost) {
    await ctx.reply(
      `💸 Not enough credits. You need ${totalCost} credits but have ${balance}.\n\nTap 💰 Credits to buy more.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("💰 Buy credits", "credits:show")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    ctx.session.step = "idle";
    return;
  }

  await ctx.reply(
    `🎨 Ready to generate ${count} ${categoryName} image${count > 1 ? "s" : ""}!\n\nCost: ${totalCost} credits (you have ${balance}).`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🚀 Generate", "gen:confirm")],
        [inlineButton("Cancel", "menu:main")],
      ]),
    },
  );
});

// Handle generation confirmation
composer.callbackQuery("gen:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const store = getDomainStore();
  const profile = await store.getUserProfile(userId);
  if (!profile) return;

  const count = ctx.session.imageCount ?? 1;
  const totalCost = count * CREDITS_PER_IMAGE;

  if (profile.credit_balance < totalCost) {
    await ctx.reply("💸 Credits ran out. Tap 💰 Credits to top up.", {
      reply_markup: inlineKeyboard([
        [inlineButton("💰 Buy credits", "credits:show")],
      ]),
    });
    ctx.session.step = "idle";
    return;
  }

  // Deduct credits
  profile.credit_balance -= totalCost;
  await store.setUserProfile(userId, profile);

  // Create generation job
  const jobId = createJobId();
  const job: {
    job_id: string;
    user_id: number;
    category?: string;
    custom_prompt?: string;
    image_count: number;
    status: "pending" | "generating" | "completed" | "failed";
    output_images: string[];
    created_at: number;
  } = {
    job_id: jobId,
    user_id: userId,
    category: ctx.session.selectedCategory,
    image_count: count,
    status: "pending",
    output_images: [],
    created_at: Date.now(),
  };
  await store.setJob(jobId, job);
  await store.addJobToUser(userId, jobId);

  ctx.session.jobId = jobId;
  ctx.session.step = "idle";

  // In a real implementation, this would call an external AI image generation API.
  // For now, we acknowledge the job and inform the user it's processing.
  await ctx.reply(
    `⏳ Generating your images… This may take a moment.\n\nJob ID: ${jobId.slice(0, 12)}…`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );

  // Simulate job completion (in production, this would be a webhook or polling callback)
  job.status = "completed";
  job.output_images = Array.from({ length: count }, (_, i) => `output_${jobId}_${i}.jpg`);
  await store.setJob(jobId, job);

  // Notify user with results
  await ctx.reply(
    `✅ Your ${count} image${count > 1 ? "s are" : " is"} ready!\n\n` +
    `To download, tap the button below. Each download uses 1 credit.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📥 Download images", `download:${jobId}`)],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Handle image download
composer.callbackQuery(/^download:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const jobId = ctx.match[1];
  const store = getDomainStore();
  const job = await store.getJob(jobId);

  if (!job || job.status !== "completed") {
    await ctx.reply("⚠️ Images not ready yet. Try again in a moment.");
    return;
  }

  // In production, this would send the actual images via sendPhoto/sendDocument.
  // For now, confirm the download.
  await ctx.reply(
    `📥 Downloading ${job.output_images.length} image${job.output_images.length > 1 ? "s" : ""}…`,
  );
});

export default composer;
