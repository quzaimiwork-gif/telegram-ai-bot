require('dotenv').config();
const fs = require('fs');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const knowledgeChunks = JSON.parse(
  fs.readFileSync('./knowledge.json', 'utf-8')
);

async function upload() {
  for (let chunk of knowledgeChunks) {

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunk,
    });

    await supabase.from('knowledge').insert({
      content: chunk,
      embedding: emb.data[0].embedding
    });

    console.log("Inserted:", chunk.substring(0, 50));
  }

  console.log("✅ Upload complete");
}

// AUTO EXIT (IMPORTANT)
upload().then(() => process.exit(0));
