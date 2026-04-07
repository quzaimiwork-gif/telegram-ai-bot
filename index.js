require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

// Safety (avoid crash)
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// Init Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 },
  },
});

// Init OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("Bot is running...");

// Handle polling error (avoid crash)
bot.on('polling_error', (error) => {
  console.log("Polling error:", error.message);
});

// Handle message
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // 1. Create thread
    const thread = await openai.beta.threads.create();

    // 2. Add user message
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userText,
    });

    // 3. Run assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
  assistant_id: "asst_XVihcnwGVqqvCQhjS5NVJW1u",
});

    // 4. Wait for completion
    let status = run.status;

    while (status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const updatedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = updatedRun.status;

      if (status === "failed") {
        throw new Error("Run failed");
      }
    }

    // 5. Get response
    const messages = await openai.beta.threads.messages.list(thread.id);

    const reply = messages.data[0].content[0].text.value;

    // 6. Send reply to Telegram
    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error("ERROR:", error);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
