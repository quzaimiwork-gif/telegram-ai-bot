require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

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
  polling: true,
});

// ===============================
// 🧠 Init OpenAI
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
// 🗄️ Init Supabase
// ===============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log("Bot is running with RAG + Supabase...");

// ===============================
// 🔍 SEARCH FUNCTION (CORE RAG)
// ===============================
async function searchKnowledge(query) {
  try {
    // 1. Create embedding for query
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmbedding = emb.data[0].embedding;

    // 2. Search in Supabase
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: 1
    });

    if (error) {
      console.error("Supabase error:", error);
      return null;
    }

    if (!data || data.length === 0) return null;

    // Optional: check similarity threshold
    if (data[0].similarity < 0.75) {
      return null;
    }

    return data[0].content;

  } catch (err) {
    console.error("Search error:", err);
    return null;
  }
}

// ===============================
// 💬 HANDLE MESSAGE
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // ===============================
    // 🧠 STEP 1: SEARCH KNOWLEDGE
    // ===============================
    const context = await searchKnowledge(userText);

    // ===============================
    // ❌ STEP 2: REJECT IF NO CONTEXT
    // ===============================
    if (!context) {
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // ===============================
    // 🤖 STEP 3: AI ANSWER (STRICT)
    // ===============================
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are a helpful assistant.

You MUST answer ONLY based on the provided context.
DO NOT add any information outside the context.
DO NOT use your own knowledge.

If the answer is not clearly in the context,
reply exactly:
"Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."

Use a friendly Malaysian conversational tone.
Keep answers short and clear.
`
        },
        {
          role: "user",
          content: `
Context:
${context}

Question:
${userText}
`
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    // ===============================
    // 📤 STEP 4: SEND REPLY
    // ===============================
    await bot.sendMessage(chatId, reply);

  } catch (error) {
    console.error("ERROR:", error);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
