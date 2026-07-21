# SelfieStyle Generator — Bot specification

**Archetype:** content

**Voice:** creative and encouraging — write every user-facing message, button label, error, and empty state in this voice.

Transforms user selfies into high-resolution photo-realistic images using themed categories or custom prompts. Users upload a selfie, select a style, generate images, and manage credits for downloads. Features include category templates, text prompts, and a credit-based payment system with Telegram Payments integration.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- social media users
- creative professionals
- casual portrait editors

## Success criteria

- User generates and downloads at least 1 image per session
- 30% of users purchase additional credits
- 95% of selfie replacements complete successfully within session

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Display welcome message with 3x3 category grid and selfie upload prompt
- **Love** (button, actor: user, callback: category:love) — Apply 'Love' theme template to current selfie
- **Upload New Selfie** (button, actor: user, callback: action:replace_selfie) — Replace current selfie with new photo
- **/prompt** (command, actor: user, command: /prompt) — Enter custom text prompt for image generation

## Flows

### image_generation
_Trigger:_ category selection or /prompt

1. Receive selfie
2. Select category/template or enter custom prompt
3. Confirm image count (1-5)
4. Process payment if needed
5. Generate images using AI
6. Display results with action buttons

_Data touched:_ source_selfie, job, credits

### credit_management
_Trigger:_ insufficient credits detected

1. Display credit balance
2. Show purchase options
3. Process payment via Telegram Payments
4. Update credit balance
5. Send confirmation

_Data touched:_ credits

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user_profile** _(retention: persistent)_ — User account information
  - fields: telegram_id, display_name, consent_timestamp, credit_balance
- **source_selfie** _(retention: session)_ — Original image used for generation
  - fields: image_hash, upload_timestamp, last_used
- **generation_job** _(retention: persistent)_ — Image generation request and results
  - fields: job_id, category/prompt, image_count, status, output_images
- **credit_transaction** _(retention: persistent)_ — Credit purchases and usage
  - fields: transaction_id, credits_added, timestamp, payment_status

## Integrations

- **Telegram** (required) — Bot API messaging and payments
- **Telegram Payments** (required) — Credit purchase processing
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Admin receives notifications for: new credit purchases, failed generation jobs, abuse reports

## Notifications

- Admin alerts for purchases/abuse
- User job status updates
- Credit balance warnings

## Permissions & privacy

- Explicit consent required for selfie processing
- Selfie data retained 90 days by default
- Content safety filters for minors/explicit content

## Edge cases

- Multi-face photo rejection
- Payment failures during credit purchase
- Category template generation errors

## Required tests

- End-to-end generation flow with payment
- Credit balance persistence across sessions
- Abuse report submission workflow

## Assumptions

- Single-face selfies only by default
- Admin notifications sent to single configured account
- Default 90-day data retention
