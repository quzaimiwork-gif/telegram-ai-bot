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

bot.on('polling_error', (error) => {
  console.log("Polling error:", error.message);
});


// ===============================
// 🔥 EMBEDDING HELPER FUNCTION
// ===============================

// Cosine similarity function
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}


// ===============================
// 🔥 KNOWLEDGE BASE EMBEDDING
// ===============================

// 👉 IMPORTANT: letak summary content module kau kat sini
const knowledgeText = `
MYNIC adalah agensi rasmi di bawah Kementerian Digital Malaysia.
Fungsi termasuk pengurusan domain .my, DNS, keselamatan dan transformasi digital untuk PKS.
`;

// Simpan embedding sekali sahaja (cache)
let knowledgeEmbedding = null;

async function initKnowledgeEmbedding() {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: knowledgeText,
  });

  knowledgeEmbedding = res.data[0].embedding;
}

// Init sekali masa start
initKnowledgeEmbedding();


// ===============================
// 🔥 MESSAGE HANDLER
// ===============================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // ===============================
    // 🧠 STEP 1: EMBEDDING USER QUESTION
    // ===============================
    const userEmbeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userText,
    });

    const userEmbedding = userEmbeddingRes.data[0].embedding;

    // ===============================
    // 🧠 STEP 2: SIMILARITY CHECK
    // ===============================
    const score = cosineSimilarity(userEmbedding, knowledgeEmbedding);

    console.log("Similarity score:", score);

    // Threshold (boleh adjust)
    if (score < 0.7) {
      return bot.sendMessage(chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // ===============================
    // 🤖 STEP 3: CALL ASSISTANT
    // ===============================
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userText,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: "asst_XVihcnwGVqqvCQhjS5NVJW1u",
    });

    let status = run.status;

    while (status !== "completed") {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const updatedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = updatedRun.status;

      if (status === "failed") {
        throw new Error("Run failed");
      }
    }

    // ===============================
    // 📩 STEP 4: GET CLEAN RESPONSE
    // ===============================
    const messages = await openai.beta.threads.messages.list(thread.id);

    const assistantMessage = messages.data.find(
      (m) => m.role === "assistant"
    );

    const reply = assistantMessage.content[0].text.value;

    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error("ERROR:", error);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
