require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

// INIT
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

console.log("🤖 Bot running (SAFE MODE)...");

// ===============================
// 🔥 SIMPLE SEARCH (NO VECTOR)
// ===============================
async function searchKnowledge(userText) {
  try {
    const { data, error } = await supabase
      .from('knowledge')
      .select('content');

    if (error || !data) return null;

    const lower = userText.toLowerCase();

    // 🔥 simple keyword match
    const match = data.find(item =>
      item.content.toLowerCase().includes(lower)
    );

    if (!match) return null;

    return match.content;

  } catch (err) {
    console.error(err);
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
          content: `
Jawab hanya berdasarkan context.
Jangan tambah maklumat luar.
Guna gaya santai.
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

    await bot.sendMessage(chatId, completion.choices[0].message.content);

  } catch (err) {
    console.error(err);
    await bot.sendMessage(chatId, "Maaf, ada masalah sikit 😅");
  }
});
