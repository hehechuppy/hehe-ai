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

// Express server cho Render Keep-Alive
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.status(200).send('Bot is running ✅');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});

// Khởi tạo Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Sửa tên model thành tên chính thức: gemini-1.5-flash
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Lưu conversation history cho từng user
const conversationHistory = new Map();

// Helper delay
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  client.user.setActivity('tin nhắn | /help', { type: 'LISTENING' });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.webhookId) return;

  // Lệnh /help
  if (message.content.trim() === '/help') {
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
          value: 'Gemini 1.5 Flash + Discord.js',
        },
      ],
      footer: { text: 'Bot sẽ nhớ conversation của bạn trong phiên đó' },
    };

    return message.reply({ embeds: [helpEmbed] });
  }

  // Lọc tin nhắn không đề cập bot hoặc không nằm trong DM
  if (!message.mentions.has(client.user) && !message.channel.isDMBased()) {
    return;
  }

  try {
    await message.channel.sendTyping();
    await wait(1000);

    const userId = message.author.id;

    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }

    let userMessage = message.content.replace(/^<@!?\d+>\s*/, '').trim();

    if (!userMessage) {
      return message.reply('Bạn chưa nhập nội dung câu hỏi! 😊');
    }

    const history = conversationHistory.get(userId);

    const chat = model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Cập nhật history sau khi phản hồi thành công
    history.push({ role: 'user', parts: [{ text: userMessage }] });
    history.push({ role: 'model', parts: [{ text: response }] });

    // Giữ tối đa 10 lượt hội thoại gần nhất
    if (history.length > 20) {
      history.splice(0, 2);
    }

    // Tách tin nhắn nếu dài hơn 2000 ký tự (Giới hạn Discord)
    if (response.length > 2000) {
      const chunks = response.match(/[\s\S]{1,1900}/g) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
        await wait(300);
      }
    } else {
      await message.reply(response);
    }
  } catch (error) {
    console.error('❌ Lỗi Gemini:', error);

    if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid')) {
      await message.reply('❌ Lỗi: API Key Gemini không hợp lệ. Vui lòng kiểm tra lại cấu hình trên Render.');
    } else if (error.message.includes('quota')) {
      await message.reply('❌ Hết hạn ngạch (Quota) Gemini API.');
    } else {
      await message.reply('❌ Có lỗi xảy ra khi xử lý phản hồi từ AI.');
    }
  }
});

// Dọn dẹp bộ nhớ định kỳ
setInterval(() => {
  if (conversationHistory.size > 50) {
    conversationHistory.clear();
  }
}, 60 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
