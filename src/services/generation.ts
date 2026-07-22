/**
 * Image generation service for SelfieStyle.
 *
 * Uses OpenRouter API with multimodal models to perform face-swap generation.
 * The pipeline:
 * 1. Downloads the source selfie from Telegram
 * 2. Sends it to OpenRouter with a style prompt
 * 3. Returns the generated image URL
 *
 * Falls back gracefully if the API is unavailable.
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

/** Style prompt templates for each category */
const CATEGORY_PROMPTS: Record<string, string> = {
  love: "romantic portrait with soft pink lighting, heart-shaped bokeh, dreamy atmosphere, love theme",
  nature: "portrait in a lush natural setting, surrounded by greenery, flowers, and natural light",
  fantasy: "fantasy portrait with magical elements, ethereal glow, mystical atmosphere, fantasy art style",
  vintage: "vintage-style portrait with film grain, warm sepia tones, retro aesthetic, classic photography",
  cyberpunk: "cyberpunk portrait with neon lights, futuristic cityscape, high-tech low-life aesthetic",
  artistic: "artistic portrait with painterly brushstrokes, fine art photography, creative composition",
  professional: "professional headshot with clean background, studio lighting, polished business portrait",
  glamour: "glamorous portrait with dramatic lighting, Hollywood style, elegant and sophisticated",
  fun: "fun and playful portrait with vibrant colors, energetic mood, creative and whimsical",
};

export interface GenerationResult {
  success: boolean;
  imageUrls: string[];
  error?: string;
}

/**
 * Generate styled images from a selfie using AI face-swap.
 *
 * @param selfieFileId - Telegram file_id of the source selfie
 * @param category - Style category (love, nature, etc.)
 * @param customPrompt - Custom text prompt (overrides category)
 * @param imageCount - Number of images to generate (1-5)
 * @param downloadFile - Function to download Telegram file by file_id
 * @returns GenerationResult with image URLs or error
 */
export async function generateImages(
  selfieFileId: string,
  category: string | undefined,
  customPrompt: string | undefined,
  imageCount: number,
  downloadFile: (fileId: string) => Promise<Buffer>,
): Promise<GenerationResult> {
  if (!OPENROUTER_API_KEY) {
    return {
      success: false,
      imageUrls: [],
      error: "Image generation service is not configured. Please try again later.",
    };
  }

  try {
    // Download the source selfie
    const selfieBuffer = await downloadFile(selfieFileId);
    const selfieBase64 = selfieBuffer.toString("base64");

    // Build the style prompt
    const stylePrompt = customPrompt || CATEGORY_PROMPTS[category ?? ""] || "styled portrait";

    // Build the face-swap prompt
    const prompt = `You are an expert portrait photographer and face-swap specialist.

Given a source selfie, generate a new photorealistic portrait that:
1. PRESERVES the exact facial identity from the source selfie (same person, same facial features)
2. APPLIES the following style/theme: ${stylePrompt}
3. Produces a HIGH-RESOLUTION (>=1024px) photorealistic result
4. Maintains proper face alignment, lighting consistency, and natural skin tones
5. Uses the text prompt as the SCENE/STYLE guide only, not as the identity source

The output should be a professional-grade face-swapped portrait where:
- The face is clearly the same person as the source selfie
- The scene, lighting, and style match the prompt description
- The image is photorealistic with proper color grading
- The resolution meets the product requirement (>=1024px)

Generate exactly ${imageCount} variations of this styled portrait.`;

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://selfiestyle.app",
        "X-Title": "SelfieStyle Generator",
      },
      body: JSON.stringify({
        model: "openai/dall-e-3",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${selfieBase64}`,
                },
              },
            ],
          },
        ],
        n: imageCount,
        size: "1024x1024",
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[generation] OpenRouter API error:", response.status, errorData);
      return {
        success: false,
        imageUrls: [],
        error: "Image generation failed. Please try again with a different style.",
      };
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          image_url?: { url: string };
        };
        image?: { url: string };
      }>;
      data?: Array<{ url: string; revised_prompt?: string }>;
    };

    // Extract image URLs from response
    const imageUrls: string[] = [];

    // Handle DALL-E 3 response format
    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data) {
        if (item.url) {
          imageUrls.push(item.url);
        }
      }
    }

    // Handle other response formats
    if (imageUrls.length === 0 && data.choices) {
      for (const choice of data.choices) {
        if (choice.image?.url) {
          imageUrls.push(choice.image.url);
        } else if (choice.message?.image_url?.url) {
          imageUrls.push(choice.message.image_url.url);
        }
      }
    }

    if (imageUrls.length === 0) {
      console.error("[generation] No images in API response:", JSON.stringify(data).slice(0, 500));
      return {
        success: false,
        imageUrls: [],
        error: "Image generation completed but no images were returned. Please try again.",
      };
    }

    // Validate output quality (check if output is too similar to input)
    // In production, this would use SSIM or perceptual similarity metrics
    // For now, we trust the API's output quality

    return {
      success: true,
      imageUrls: imageUrls.slice(0, imageCount),
    };
  } catch (error) {
    console.error("[generation] Failed to generate images:", error);
    return {
      success: false,
      imageUrls: [],
      error: "Image generation service is temporarily unavailable. Please try again later.",
    };
  }
}

/**
 * Download a file from Telegram by its file_id.
 * Uses the Telegram Bot API getFile + download endpoints.
 */
export async function downloadTelegramFile(
  fileId: string,
  botToken: string,
): Promise<Buffer> {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  // Get file info
  const fileInfoResponse = await fetch(
    `${baseUrl}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );

  if (!fileInfoResponse.ok) {
    throw new Error(`Failed to get file info: ${fileInfoResponse.status}`);
  }

  const fileInfo = await fileInfoResponse.json() as {
    ok: boolean;
    result?: { file_path: string; file_size: number };
  };

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error("Invalid file info response");
  }

  // Download the file
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
  const fileResponse = await fetch(fileUrl);

  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.status}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
