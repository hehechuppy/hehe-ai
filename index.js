require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const express = require('express');

// Khởi tạo Web Server nhỏ để Keep-Alive (như Render)
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

client.once('ready', () => {
  console.log(`🤖 Bot đã đăng nhập: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!gemini')) return;

  const prompt = message.content.slice(7).trim();
  if (!prompt) return message.reply('❓ Vui lòng nhập câu hỏi sau `.gemini`');

  try {
    await message.channel.sendTyping();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
