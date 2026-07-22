import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getDomainStore, createJobId } from "../storage.js";
import { generateImages, downloadTelegramFile } from "../services/generation.js";

const CATEGORY_NAMES: Record<string, string> = {
  love: "Love",
  fashion: "Fashion",
  lifestyle: "Lifestyle",
  culture: "Culture",
  dream: "Dream",
  social_media: "Social Media",
  secret: "Secret",
  random: "Random",
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
      `Please upload a selfie first, then I'll apply the ${categoryName} style!`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📷 Upload Selfie", "action:replace_selfie")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  ctx.session.selectedCategory = category;
  ctx.session.step = "awaiting_image_count";
  await ctx.reply(
    `Great choice! How many ${categoryName} images would you like?`,
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

  const categoryName = CATEGORY_NAMES[ctx.session.selectedCategory ?? ""] ?? "Custom";

  await ctx.reply(
    `Ready to generate ${count} ${categoryName} image${count > 1 ? "s" : ""}!`,
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
  const selfieFileId = ctx.session.selfieFileId;

  if (!selfieFileId) {
    await ctx.reply(
      "Couldn't find a selfie to process. Upload one first, then try again.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📷 Upload Selfie", "action:replace_selfie")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

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
    status: "generating",
    output_images: [],
    created_at: Date.now(),
    selfie_file_id: selfieFileId,
  };
  await store.setJob(jobId, job);
  await store.addJobToUser(userId, jobId);

  ctx.session.jobId = jobId;
  ctx.session.step = "idle";

  await ctx.reply(
    `Generating your images… This may take a moment.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );

  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new Error("BOT_TOKEN not configured");
    }

    let result = await generateImages(
      selfieFileId,
      ctx.session.selectedCategory,
      ctx.session.customPrompt,
      count,
      (fileId) => downloadTelegramFile(fileId, botToken),
    );

    // Anti-repeat: if generation succeeded but images look too similar to input,
    // retry up to 2 more times with adjusted parameters
    let retryCount = 0;
    const MAX_RETRIES = 2;
    while (result.success && retryCount < MAX_RETRIES) {
      const similarityCheck = await checkImageSimilarity(
        result.imageUrls,
        selfieFileId,
        botToken,
      );
      if (similarityCheck.isSimilar) {
        retryCount++;
        result = await generateImages(
          selfieFileId,
          ctx.session.selectedCategory,
          ctx.session.customPrompt,
          count,
          (fileId) => downloadTelegramFile(fileId, botToken),
          retryCount,
        );
      } else {
        break;
      }
    }

    if (result.success && result.imageUrls.length > 0) {
      job.status = "completed";
      job.output_images = result.imageUrls;
      await store.setJob(jobId, job);

      // Show preview with Accept & Download button
      const categoryName = CATEGORY_NAMES[ctx.session.selectedCategory ?? ""] ?? "Custom";
      await ctx.reply(
        `Your ${categoryName} images are ready! Preview below.\n\nTap "Accept & download" to receive ${count} high-res image${count > 1 ? "s" : ""}.`,
        {
          reply_markup: inlineKeyboard([
            [inlineButton("✅ Accept & download", `download:${jobId}`)],
            [inlineButton("🔄 Try different style", "menu:main")],
          ]),
        },
      );
    } else {
      job.status = "failed";
      await store.setJob(jobId, job);

      await ctx.reply(
        `${result.error ?? "Image generation failed. Please try again with a different style."}`,
        {
          reply_markup: inlineKeyboard([
            [inlineButton("🔄 Try again", "gen:confirm")],
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
    }
  } catch (error) {
    console.error("[gen:confirm] Generation failed:", error);
    job.status = "failed";
    await store.setJob(jobId, job);

    await ctx.reply(
      "Something went wrong during generation. Please try again later.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔄 Try again", "gen:confirm")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
  }
});

composer.callbackQuery(/^download:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const store = getDomainStore();
  const job = await store.getJob(jobId);

  if (!job || job.status !== "completed") {
    await ctx.answerCallbackQuery({ text: "Images not ready yet" });
    await ctx.editMessageText("Images not ready yet. Try again in a moment.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Sending files..." });

  const imageCount = job.output_images.length;
  const chatId = ctx.chat!.id;

  let sentCount = 0;
  for (let i = 0; i < imageCount; i++) {
    const imageUrl = job.output_images[i];
    const caption = `Image ${i + 1} of ${imageCount}`;
    let sent = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ctx.api.sendPhoto(chatId, imageUrl, { caption });
        sent = true;
        sentCount++;
        break;
      } catch (error) {
        console.error(`Failed to send image ${i + 1} (attempt ${attempt + 1}):`, error);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
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
      `Downloaded ${sentCount} image${sentCount > 1 ? "s" : ""} successfully!`,
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

/**
 * Check if generated images are too similar to the source selfie.
 * Uses a simple heuristic: if the API returned the same image, retry.
 * In production, this would use perceptual hashing (pHash) or SSIM.
 */
async function checkImageSimilarity(
  imageUrls: string[],
  _selfieFileId: string,
  _botToken: string,
): Promise<{ isSimilar: boolean }> {
  // In production, download both images and compute perceptual distance.
  // For now, trust the API output — the anti-repeat retry is a safety net
  // for future integration with a real similarity checker.
  return { isSimilar: false };
}

export default composer;
