const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Express server for Render health check
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('Bot is running ✅');
});

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

// Lưu conversation history cho mỗi user
const conversationHistory = new Map();

// Helper function để delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once('clientReady', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('tin nhắn | /help', { type: 'LISTENING' });
});

client.on('messageCreate', async (message) => {
  // Bỏ qua bot messages và webhook messages
  if (message.author.bot || message.webhookId) return;

  // Bỏ qua nếu không phải tin nhắn tới bot
  if (!message.mentions.has(client.user) && message.channel.isDMBased() === false) {
    return;
  }

  try {
    // Hiển thị "đang gõ"
    await message.channel.sendTyping();
    
    // Chờ 500ms để tránh rate limit
    await wait(2000);

    // Lấy user ID để track conversation
    const userId = message.author.id;

    // Nếu không có history, tạo mới
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }

    // Lấy tin nhắn và xóa mention
    let userMessage = message.content.replace(/^<@!?\d+>\s*/, '').trim();

    if (!userMessage) {
      await message.reply('Bạn chưa nói gì! 😊');
      return;
    }

    // Thêm vào conversation history
    const history = conversationHistory.get(userId);
    history.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    // Giữ lại 10 tin nhắn gần nhất (để tránh quá dài)
    if (history.length > 10) {
      history.shift();
    }

    // Gọi Gemini AI
    const chat = model.startChat({
      history: history.slice(0, -1), // Loại bỏ tin nhắn vừa thêm để tránh duplicate
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Thêm response vào history
    history.push({
      role: 'model',
      parts: [{ text: response }],
    });

    // Tách response nếu quá dài (Discord limit 2000 ký tự)
    if (response.length > 2000) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
        await wait(300); // Chờ giữa các message
      }
    } else {
      await message.reply(response);
    }
  } catch (error) {
    console.error('❌ Lỗi:', error.message);

    if (error.message.includes('GEMINI_API_KEY')) {
      await message.reply('❌ Lỗi: API key không được set. Kiểm tra `.env` file.');
    } else if (error.message.includes('quota')) {
      await message.reply('❌ Quota Gemini API đã hết. Vui lòng thử lại sau.');
    } else if (error.message.includes('no longer available')) {
      await message.reply('❌ Model không khả dụng. Admin đang fix...');
    } else if (error.message.includes('429')) {
      await message.reply('⏳ Rate limit! Vui lòng chờ một chút rồi thử lại.');
    } else {
      await message.reply('❌ Có lỗi xảy ra. Vui lòng thử lại sau.');
    }
  }
});

// Command help
client.on('messageCreate', async (message) => {
  if (message.content === '/help' || message.content.includes('/help')) {
    const helpEmbed = {
      color: 0x0099ff,
      title: '🤖 Trợ giúp Bot AI',
      description: 'Cách sử dụng bot chatbot AI',
      fields: [
        {
          name: '💬 Chat với bot',
          value: 'Mention bot hoặc DM: `@Bot [tin nhắn]`',
        },
        {
          name: '📌 Powered by',
          value: 'Gemini 3.6 Flash + Discord.js',
        },
      ],
      footer: { text: 'Bot sẽ nhớ conversation của bạn trong phiên đó' },
    };

    await message.reply({ embeds: [helpEmbed] });
  }
});

// Xóa conversation history khi user không hoạt động lâu (optional)
setInterval(() => {
  const now = Date.now();
  const MAX_HISTORY_AGE = 24 * 60 * 60 * 1000; // 24 giờ

  for (const [userId, history] of conversationHistory.entries()) {
    // Đơn giản: xóa nếu có quá 50 user
    if (conversationHistory.size > 50) {
      conversationHistory.delete(userId);
    }
  }
}, 60 * 60 * 1000); // Check mỗi giờ

client.login(process.env.DISCORD_TOKEN);
