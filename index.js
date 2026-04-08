require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Init
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

console.log("Bot running with RAG...");

// SEARCH FUNCTION
async function searchKnowledge(query) {
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const queryEmbedding = emb.data[0].embedding;

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_count: 1
  });

  if (error || !data || data.length === 0) return null;

  // STRICT FILTER
  if (data[0].similarity < 0.75) return null;

  return data[0].content;
}

// BOT
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // 1. SEARCH
    const context = await searchKnowledge(userText);

    // 2. REJECT IF NO MATCH
    if (!context) {
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // 3. AI RESPONSE (STRICT)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Answer ONLY based on the provided context.
Do NOT add anything outside the context.
Use friendly Malaysian tone.
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

    await bot.sendMessage(chatId, reply);

  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
