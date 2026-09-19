const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
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

// Lưu conversation history cho mỗi user
const conversationHistory = new Map();

// Helper function để delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once('clientReady', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`🚀 Using Mistral AI (Free & Unlimited)`);
  client.user.setActivity('tin nhắn | /help', { type: 'LISTENING' });
});

// Function để gọi Mistral
async function callMistral(messages) {
  try {
    const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'mistral-tiny',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('❌ Mistral error:', error.message);
    throw error;
  }
}

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
    
    // Chờ 500ms
    await wait(500);

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

    // Lấy conversation history
    const history = conversationHistory.get(userId);

    // Thêm tin nhắn mới vào history
    history.push({
      role: 'user',
      content: userMessage,
    });

    // Giữ lại 20 tin nhắn gần nhất (để tránh quá dài)
    if (history.length > 20) {
      history.shift();
    }

    // Gọi Mistral
    console.log(`🔄 Processing: "${userMessage}"`);
    const response = await callMistral(history);

    // Thêm response vào history
    history.push({
      role: 'assistant',
      content: response,
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

    console.log(`✅ Reply sent to ${message.author.username}`);
  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      await message.reply('❌ Lỗi: API key không hợp lệ. Kiểm tra `.env` file.');
    } else if (error.message.includes('429')) {
      await message.reply('⏳ Rate limit! Mistral đang xử lý quá nhiều. Thử lại sau.');
    } else if (error.message.includes('timeout')) {
      await message.reply('⏳ Mistral đang xử lý quá lâu. Thử lại sau.');
    } else {
      await message.reply('❌ Có lỗi xảy ra. Thử lại sau.');
    }
  }
});

// Command help
client.on('messageCreate', async (message) => {
  if (message.content === '/help' || message.content.includes('/help')) {
    const helpEmbed = {
      color: 0x0099ff,
      title: '🤖 Trợ giúp Bot AI',
      description: 'Cách sử dụng bot chatbot AI với Mistral',
      fields: [
        {
          name: '💬 Chat với bot',
          value: 'Mention bot hoặc DM: `@Bot [tin nhắn]`',
        },
        {
          name: '📌 Powered by',
          value: 'Mistral AI (Tiny Model)',
        },
        {
          name: '⚡ Tính năng',
          value: '✅ Hoàn toàn miễn phí\n✅ Unlimited\n✅ Nhanh\n✅ Nhớ conversation',
        },
      ],
      footer: { text: 'Mistral: Open, Powerful & Free!' },
    };

    await message.reply({ embeds: [helpEmbed] });
  }
});

// Xóa conversation history định kỳ
setInterval(() => {
  if (conversationHistory.size > 50) {
    const firstKey = conversationHistory.keys().next().value;
    conversationHistory.delete(firstKey);
  }
}, 60 * 60 * 1000); // Check mỗi giờ

client.login(process.env.DISCORD_TOKEN);
