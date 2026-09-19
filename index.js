const { Client, GatewayIntentBits } = require('discord.js');
const { Groq } = require('groq-sdk');
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

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Lưu conversation history cho mỗi user
const conversationHistory = new Map();

// Helper function để delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Auto-detect available model từ Groq
let AVAILABLE_MODEL = null;

async function detectAvailableModel() {
  try {
    console.log('🔍 Detecting available Groq models...');
    
    // Groq không có API để list models, nên test các model phổ biến
    const modelsToTry = [
      'mixtral-8x7b-32768',
      'llama3-8b-8192',
      'llama3-70b-8192',
      'gemma2-9b-it',
      'qwen2-72b-4k',
      'qwq-32b-preview',
    ];

    for (const model of modelsToTry) {
      try {
        // Test model với một request đơn giản
        const response = await groq.chat.completions.create({
          messages: [{ role: 'user', content: 'hi' }],
          model: model,
          max_tokens: 10,
        });
        
        AVAILABLE_MODEL = model;
        console.log(`✅ Found available model: ${model}`);
        return model;
      } catch (error) {
        console.log(`❌ Model ${model} not available`);
        continue;
      }
    }

    throw new Error('No available models found!');
  } catch (error) {
    console.error('❌ Error detecting models:', error.message);
    // Fallback to a default
    AVAILABLE_MODEL = 'mixtral-8x7b-32768';
    return AVAILABLE_MODEL;
  }
}

// Gọi Groq
async function callGroq(messages) {
  try {
    const response = await groq.chat.completions.create({
      messages: messages,
      model: AVAILABLE_MODEL,
      temperature: 0.7,
      max_tokens: 1024,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ Groq error:', error.message);
    throw error;
  }
}

client.once('clientReady', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  
  // Detect model khi bot ready
  if (!AVAILABLE_MODEL) {
    await detectAvailableModel();
  }
  
  console.log(`🚀 Using Groq AI - Model: ${AVAILABLE_MODEL}`);
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

    // Gọi Groq
    console.log(`🔄 Processing: "${userMessage}"`);
    const response = await callGroq(history);

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

    if (error.message.includes('401') || error.message.includes('API key')) {
      await message.reply('❌ Lỗi: API key không hợp lệ. Kiểm tra `.env` file.');
    } else if (error.message.includes('429')) {
      await message.reply('⏳ Rate limit! Groq đang xử lý quá nhiều. Thử lại sau.');
    } else if (error.message.includes('timeout')) {
      await message.reply('⏳ Groq đang xử lý quá lâu. Thử lại sau.');
    } else if (error.message.includes('No available models')) {
      await message.reply('❌ Groq không có model khả dụng. Thử lại sau.');
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
      description: 'Cách sử dụng bot chatbot AI với Groq',
      fields: [
        {
          name: '💬 Chat với bot',
          value: 'Mention bot hoặc DM: `@Bot [tin nhắn]`',
        },
        {
          name: '📌 Powered by',
          value: `Groq + ${AVAILABLE_MODEL || 'Auto-detect'}`,
        },
        {
          name: '⚡ Tính năng',
          value: '✅ Miễn phí\n✅ Unlimited\n✅ Siêu nhanh\n✅ Nhớ conversation\n✅ Auto-detect models',
        },
      ],
      footer: { text: 'Groq: Free, Fast, và Forever!' },
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
