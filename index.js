require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

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

console.log("Bot running with RAG...");

// ===============================
// 🌱 AUTO SEED (RUN ONCE)
// ===============================
async function seedOnce() {
  try {
    console.log("Checking DB...");

    const { data, error } = await supabase
      .from('knowledge')
      .select('id')
      .limit(1);

    if (error) {
      console.error("DB check error:", error);
      return;
    }

    if (data && data.length > 0) {
      console.log("Data exists. Skip seeding.");
      return;
    }

    console.log("Seeding start...");

    const knowledgeChunks = require('./knowledge.json');

    for (let chunk of knowledgeChunks) {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });

      await supabase.from('knowledge').insert({
        content: chunk,
        embedding: emb.data[0].embedding
      });

      console.log("Inserted:", chunk.substring(0, 40));
    }

    console.log("✅ Seeding done!");

  } catch (err) {
    console.error("Seed error:", err);
  }
}

// RUN SEED
seedOnce();

// ===============================
// 🔍 SEARCH FUNCTION (RAG)
// ===============================
async function searchKnowledge(userText) {
  try {
    // 🔥 Enriched query (IMPORTANT)
    const enrichedQuery = `Soalan berkaitan domain, MYNIC, laman web: ${userText}`;

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: enrichedQuery,
    });

    const queryEmbedding = emb.data[0].embedding;

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: 1
    });

    if (error) {
      console.error("Search error:", error);
      return null;
    }

    if (!data || data.length === 0) return null;

    console.log("Similarity score:", data[0].similarity);

    // 🔥 UPDATED THRESHOLD (0.5)
    if (data[0].similarity < 0.5) return null;

    return data[0].content;

  } catch (err) {
    console.error("Embedding error:", err);
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
    // 1. SEARCH FROM DB
    const context = await searchKnowledge(userText);

    // 2. REJECT IF NOT FOUND
    if (!context) {
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // 3. AI REWRITE ONLY (STRICT)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Jawab hanya berdasarkan context yang diberi.
Jangan tambah maklumat luar.
Guna gaya santai macam bercakap dengan kawan.
Jawapan pendek dan jelas.
`
        },
        {
          role: "user",
          content: `
Context:
${context}

Soalan:
${userText}
`
        }
      ]
    });

    const reply = completion.choices[0].message.content;

    await bot.sendMessage(chatId, reply);

  } catch (err) {
    console.error("Main error:", err);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
