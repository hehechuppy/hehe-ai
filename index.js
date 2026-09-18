require('dotenv').config();
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const express = require('express');

// Web Server Keep-Alive
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Gemini đang hoạt động!'));
app.listen(PORT, () => console.log(`✅ Server HTTP listening on port ${PORT}`));

// Khởi tạo Gemini & Discord SDK
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
  if (message.author.bot) return;

  // Kiểm tra nếu người dùng REPLY tin nhắn của bot
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

  // Kiểm tra MENTION (@) bot hoặc tiền tố !gemini
  const isMentioned = message.mentions.has(client.user.id);
  const startsWithPrefix = message.content.startsWith('!gemini');

  if (!isReplyToBot && !isMentioned && !startsWithPrefix) return;

  // Làm sạch prompt
  let prompt = message.content
    .replace('!gemini', '')
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();

  if (!prompt) {
    return message.reply('❓ Bạn chưa nhập nội dung câu hỏi!');
  }

  try {
    await message.channel.sendTyping();

    // Cập nhật model thành gemini-3.6-flash theo đúng yêu cầu API
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
