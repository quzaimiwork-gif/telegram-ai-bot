require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

// ===============================
// INIT
// ===============================
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

console.log("🤖 Bot running (STRICT RAG MODE)...");

// ===============================
// SEARCH FUNCTION
// ===============================
async function searchKnowledge(userText) {
  try {
    const enrichedQuery = `Soalan berkaitan domain, MYNIC, laman web, komuniti: ${userText}`;

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: enrichedQuery,
    });

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: emb.data[0].embedding,
      match_count: 3
    });

    if (error || !data || data.length === 0) return null;

    const bestScore = Math.max(...data.map(d => d.similarity));

    console.log("Best similarity:", bestScore);

    // 🔥 STRICT FILTER
    if (bestScore < 0.5) return null;

    return data.map(d => d.content).join("\n\n");

  } catch (err) {
    console.error("Search error:", err);
    return null;
  }
}

// ===============================
// BOT HANDLER
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (!userText) return;

  try {
    // 1. SEARCH
    const context = await searchKnowledge(userText);

    // 2. HARD BLOCK (NO CONTEXT)
    if (!context) {
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // 3. AI RESPONSE (STRICT MODE)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You MUST answer ONLY using the provided context.

DO NOT use your own knowledge.
DO NOT guess.
DO NOT add anything outside the context.

If the answer is not clearly found in the context,
reply exactly:

"Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."

Use a friendly Malaysian conversational tone.
Keep answer short and simple.
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
    // 🔥 EXTRA GUARD (ANTI-HALLUCINATION)
    // ===============================
    const firstWord = userText.toLowerCase().split(" ")[0];

    if (!context.toLowerCase().includes(firstWord)) {
      console.log("⚠️ Blocked hallucination");
      return bot.sendMessage(
        chatId,
        "Maaf, yang ni saya tak dapat nak bantu jawab buat masa ni."
      );
    }

    // 4. SEND REPLY
    await bot.sendMessage(chatId, reply);

  } catch (err) {
    console.error("Main error:", err);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
