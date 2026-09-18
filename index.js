require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const express = require('express');

// Khởi tạo Web Server Keep-Alive
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Gemini đang hoạt động!'));
app.listen(PORT, () => console.log(`✅ Server HTTP listening on port ${PORT}`));

// SDK Gemini & Discord
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`🤖 Bot đã đăng nhập: ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Bỏ qua nếu tin nhắn từ bot
  if (message.author.bot) return;

  // 1. Kiểm tra xem người dùng có REPLY tin nhắn của bot không
  let isReplyToBot = false;
  if (message.reference) {
    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (referencedMessage.author.id === client.user.id) {
        isReplyToBot = true;
      }
    } catch (err) {
      console.error('Không lấy được tin nhắn được reply:', err);
    }
  }

  // 2. Kiểm tra xem người dùng có MENTION (@) bot hoặc dùng tiền tố !gemini không
  const isMentioned = message.mentions.has(client.user.id);
  const startsWithPrefix = message.content.startsWith('!gemini');

  // Nếu không rơi vào 3 trường hợp trên thì bỏ qua
  if (!isReplyToBot && !isMentioned && !startsWithPrefix) return;

  // Làm sạch prompt: loại bỏ tiền tố !gemini hoặc đoạn @bot
  let prompt = message.content
    .replace('!gemini', '')
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();

  if (!prompt) {
    return message.reply('❓ Bạn chưa nhập nội dung câu hỏi!');
  }

  try {
    await message.channel.sendTyping();

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    const replyText = response.text;
    if (replyText.length > 2000) {
      const chunks = replyText.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) await message.reply(chunk);
    } else {
      await message.reply(replyText);
    }
  } catch (error) {
    console.error('Gemini Error:', error);
    await message.reply('❌ Có lỗi xảy ra khi gọi Gemini API.');
  }
});

client.login(process.env.DISCORD_TOKEN);
