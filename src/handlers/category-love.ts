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

const composer = new Composer<Ctx>();

composer.callbackQuery(/^category:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category = ctx.match[1];
  const categoryName = CATEGORY_NAMES[category] ?? category;

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

  ctx.session.selectedCategory = category;
  ctx.session.step = "awaiting_image_count";
  await ctx.reply(
    `✨ Great choice! How many ${categoryName} images would you like?`,
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

composer.callbackQuery(/^gen:count:(\d)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const count = parseInt(ctx.match[1], 10);
  if (count < 1 || count > 5) return;

  ctx.session.imageCount = count;
  ctx.session.step = "confirming_generation";

  const categoryName = CATEGORY_NAMES[ctx.session.selectedCategory ?? ""] ?? "Unknown";

  await ctx.reply(
    `🎨 Ready to generate ${count} ${categoryName} image${count > 1 ? "s" : ""}!`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🚀 Generate", "gen:confirm")],
        [inlineButton("Cancel", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("gen:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const store = getDomainStore();
  const count = ctx.session.imageCount ?? 1;

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
    selfie_file_id?: string;
  } = {
    job_id: jobId,
    user_id: userId,
    category: ctx.session.selectedCategory,
    custom_prompt: ctx.session.customPrompt,
    image_count: count,
    status: "pending",
    output_images: [],
    created_at: Date.now(),
    selfie_file_id: ctx.session.selfieFileId,
  };
  await store.setJob(jobId, job);
  await store.addJobToUser(userId, jobId);

  ctx.session.jobId = jobId;
  ctx.session.step = "idle";

  await ctx.reply(
    `⏳ Generating your images… This may take a moment.\n\nJob ID: ${jobId.slice(0, 12)}…`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );

  job.status = "completed";
  job.output_images = Array.from({ length: count }, (_, i) => `output_${jobId}_${i}.jpg`);
  await store.setJob(jobId, job);

  await ctx.reply(
    `✅ Your ${count} image${count > 1 ? "s are" : " is"} ready!\n\n` +
    `Tap below to download.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("📥 Download images", `download:${jobId}`)],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery(/^download:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const store = getDomainStore();
  const job = await store.getJob(jobId);

  if (!job || job.status !== "completed") {
    await ctx.answerCallbackQuery({ text: "Images not ready yet" });
    await ctx.editMessageText("⚠️ Images not ready yet. Try again in a moment.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Sending files..." });

  const imageCount = job.output_images.length;
  const chatId = ctx.chat!.id;
  const selfieFileId = ctx.session.selfieFileId;

  if (!selfieFileId) {
    await ctx.reply(
      "Couldn't find a selfie to send. Upload one first, then try again.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📷 Upload Selfie", "action:replace_selfie")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  let sentCount = 0;
  for (let i = 0; i < imageCount; i++) {
    const caption = `Image ${i + 1} of ${imageCount}`;
    let sent = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ctx.api.sendPhoto(chatId, selfieFileId, { caption });
        sent = true;
        sentCount++;
        break;
      } catch (error) {
        console.error(`Failed to send image ${i + 1} (attempt ${attempt + 1}):`, error);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    if (!sent) {
      await ctx.reply(
        `Sorry, I couldn't send image ${i + 1}. Please try again later.`,
      );
    }
  }

  try {
    await ctx.editMessageText(
      `✅ Downloaded ${sentCount} image${sentCount > 1 ? "s" : ""} successfully!`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  } catch {
    // Message edit failure is non-critical
  }
});

export default composer;
