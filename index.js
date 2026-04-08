// 1. INIT SEMUA DULU
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ===============================
// 2. FUNCTION seedOnce
// ===============================
async function seedOnce() {
  try {
    console.log("Checking DB...");

    const { data } = await supabase
      .from('knowledge')
      .select('id')
      .limit(1);

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

    console.log("Seeding done!");

  } catch (err) {
    console.error("Seed error:", err);
  }
}

// ===============================
// 3. 🔥 CALL DI SINI (PENTING)
// ===============================
seedOnce();

// ===============================
// 4. FUNCTION SEARCH
// ===============================
async function searchKnowledge(query) {
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const { data } = await supabase.rpc('match_documents', {
    query_embedding: emb.data[0].embedding,
    match_count: 1
  });

  if (!data || data.length === 0) return null;
  if (data[0].similarity < 0.75) return null;

  return data[0].content;
}

// ===============================
// 5. BOT HANDLER
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  const context = await searchKnowledge(userText);

  if (!context) {
    return bot.sendMessage(
      chatId,
      "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
    );
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "Jawab hanya berdasarkan context."
      },
      {
        role: "user",
        content: `Context: ${context}\n\nSoalan: ${userText}`
      }
    ]
  });

  await bot.sendMessage(chatId, completion.choices[0].message.content);
});
