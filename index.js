require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const express = require('express');

// Server Keep-Alive trên Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot ChatGPT đang chạy!'));
app.listen(PORT, () => console.log(`✅ Server HTTP listening on port ${PORT}`));

// Khởi tạo SDK OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`🤖 Bot ChatGPT đã đăng nhập thành công: ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Kiểm tra reply bot
  let isReplyToBot = false;
  if (message.reference) {
    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (referencedMessage.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (err) {
      console.error('Không lấy được tin nhắn reply:', err);
    }
  }

  // Kiểm tra tag @bot hoặc prefix
  const isMentioned = message.mentions.has(client.user.id);
  const startsWithPrefix = message.content.startsWith('!gpt') || message.content.startsWith('!gemini');

  if (!isReplyToBot && !isMentioned && !startsWithPrefix) return;

  let prompt = message.content
    .replace('!gpt', '')
    .replace('!gemini', '')
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();

  if (!prompt) {
    return message.reply('❓ Bạn chưa nhập nội dung câu hỏi!');
  }

  try {
    await message.channel.sendTyping();

    // Dùng gpt-4o-mini vừa rẻ vừa phản hồi siêu nhanh
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    const replyText = response.choices[0].message.content;

    if (replyText.length > 2000) {
      const chunks = replyText.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(replyText);
    }
  } catch (error) {
    console.error('OpenAI Error:', error);
    await message.reply('❌ Có lỗi xảy ra khi gọi ChatGPT API.');
  }
});

client.login(process.env.DISCORD_TOKEN);
