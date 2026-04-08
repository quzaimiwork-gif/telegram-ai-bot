require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

// ===============================
// 🔒 Safety
// ===============================
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// ===============================
// 🤖 Init Telegram Bot
// ===============================
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 },
  },
});

// ===============================
// 🧠 Init OpenAI
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("Bot is starting...");

// ===============================
// ⚠️ Polling Error
// ===============================
bot.on('polling_error', (error) => {
  console.log("Polling error:", error.message);
});

// ===============================
// 📚 Load Knowledge
// ===============================
const knowledgeChunks = JSON.parse(
  fs.readFileSync('./knowledge.json', 'utf-8')
);

// ===============================
// 🧠 Cosine Similarity
// ===============================
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}

// ===============================
// 🚀 Init Embeddings
// ===============================
let knowledgeEmbeddings = [];

async function initKnowledgeEmbeddings() {
  console.log("Initializing embeddings...");

  for (let chunk of knowledgeChunks) {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });

    knowledgeEmbeddings.push(res.data[0].embedding);
  }

  console.log("Embeddings ready:", knowledgeEmbeddings.length);
}

// ===============================
// 🚀 Start App (IMPORTANT FIX)
// ===============================
async function startApp() {
  await initKnowledgeEmbeddings(); // 🔥 tunggu siap dulu
  console.log("Bot is ready!");
}

startApp();

// ===============================
// 💬 Handle Message
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // ===============================
    // 🧠 STEP 1: Add context (BOOST)
    // ===============================
    const enrichedText = `Soalan berkaitan topik digital, domain, MYNIC, laman web: ${userText}`;

    // ===============================
    // 🧠 STEP 2: Embed User
    // ===============================
    const userEmbeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: enrichedText,
    });

    const userEmbedding = userEmbeddingRes.data[0].embedding;

    // ===============================
    // 📊 STEP 3: Similarity Check
    // ===============================
    let bestScore = 0;

    for (let emb of knowledgeEmbeddings) {
      const score = cosineSimilarity(userEmbedding, emb);
      if (score > bestScore) {
        bestScore = score;
      }
    }

    console.log("User:", userText);
    console.log("Best similarity score:", bestScore);

    // ===============================
    // 🚫 FILTER (BALANCED)
    // ===============================
    if (bestScore < 0.6) {
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // ===============================
    // 🧵 STEP 4: Create Thread
    // ===============================
    const thread = await openai.beta.threads.create();

    // ===============================
    // 💬 STEP 5: Add Message
    // ===============================
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userText,
    });

    // ===============================
    // 🤖 STEP 6: Run Assistant
    // ===============================
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: "asst_XVihcnwGVqqvCQhjS5NVJW1u",
      tool_choice: "required",
    });

    // ===============================
    // ⏳ STEP 7: Wait Completion
    // ===============================
    let status = run.status;

    while (status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const updatedRun = await openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );

      status = updatedRun.status;

      if (status === "failed") {
        throw new Error("Run failed");
      }
    }

    // ===============================
    // 📩 STEP 8: Get Reply
    // ===============================
    const messages = await openai.beta.threads.messages.list(thread.id);

    const assistantMessage = messages.data.find(
      (m) => m.role === "assistant"
    );

    const reply = assistantMessage.content[0].text.value;

    // ===============================
    // 📤 STEP 9: Send Reply
    // ===============================
    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error("ERROR:", error);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
