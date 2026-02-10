#!/usr/bin/env node
/**
 * Telegram Client for Kitebot
 * Writes messages to queue and reads responses
 * Does NOT call Claude directly - that's handled by queue-processor
 */

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const SCRIPT_DIR = path.resolve(__dirname, '..');
const QUEUE_INCOMING = path.join(SCRIPT_DIR, '.kitebot/queue/incoming');
const QUEUE_OUTGOING = path.join(SCRIPT_DIR, '.kitebot/queue/outgoing');
const LOG_FILE = path.join(SCRIPT_DIR, '.kitebot/logs/telegram.log');

// Ensure directories exist
[QUEUE_INCOMING, QUEUE_OUTGOING, path.dirname(LOG_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Validate bot token
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_token_here') {
    console.error('ERROR: TELEGRAM_BOT_TOKEN is not set in .env file');
    process.exit(1);
}

interface PendingMessage {
    chatId: number;
    messageId: number;
    timestamp: number;
}

interface QueueData {
    channel: string;
    sender: string;
    senderId: string;
    message: string;
    timestamp: number;
    messageId: string;
}

interface ResponseData {
    channel: string;
    sender: string;
    message: string;
    originalMessage: string;
    timestamp: number;
    messageId: string;
}

// Track pending messages (waiting for response)
const pendingMessages = new Map<string, PendingMessage>();

// Logger
function log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}
`;
    console.log(logMessage.trim());
    fs.appendFileSync(LOG_FILE, logMessage);
}

// Initialize Telegram bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Handle text messages
bot.on(message('text'), async (ctx) => {
    try {
        const msg = ctx.message;
        const sender = ctx.from.first_name || ctx.from.username || 'Unknown';
        const text = msg.text;

        log('INFO', `Message from ${sender}: ${text.substring(0, 50)}...`);

        // Check for reset command
        if (text.trim().match(/^[!/]reset$/i)) {
            log('INFO', 'Reset command received');

            // Create reset flag
            const resetFlagPath = path.join(SCRIPT_DIR, '.kitebot/reset_flag');
            fs.writeFileSync(resetFlagPath, 'reset');

            // Reply immediately
            await ctx.reply('Conversation reset! Next message will start a fresh conversation.');
            return;
        }

        // Show typing indicator
        await ctx.sendChatAction('typing');

        // Generate unique internal message ID
        const internalMessageId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Write to incoming queue
        const queueData: QueueData = {
            channel: 'telegram',
            sender: sender,
            senderId: ctx.chat.id.toString(),
            message: text,
            timestamp: Date.now(),
            messageId: internalMessageId,
        };

        const queueFile = path.join(QUEUE_INCOMING, `telegram_${internalMessageId}.json`);
        fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2));

        log('INFO', `Queued message ${internalMessageId}`);

        // Store pending message for response
        pendingMessages.set(internalMessageId, {
            chatId: ctx.chat.id,
            messageId: msg.message_id,
            timestamp: Date.now(),
        });

        // Clean up old pending messages (older than 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        for (const [id, data] of pendingMessages.entries()) {
            if (data.timestamp < tenMinutesAgo) {
                pendingMessages.delete(id);
            }
        }

    } catch (error) {
        log('ERROR', `Message handling error: ${(error as Error).message}`);
    }
});

// Watch for responses in outgoing queue
function checkOutgoingQueue(): void {
    try {
        const files = fs.readdirSync(QUEUE_OUTGOING)
            .filter(f => f.startsWith('telegram_') && f.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(QUEUE_OUTGOING, file);

            try {
                const responseData: ResponseData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const { messageId: internalMessageId, message: responseText, sender } = responseData;

                // Find pending message
                const pending = pendingMessages.get(internalMessageId);
                if (pending) {
                    // Send response as a reply to the original message
                    bot.telegram.sendMessage(pending.chatId, responseText, {
                        reply_parameters: { message_id: pending.messageId }
                    });
                    
                    log('INFO', `Sent response to ${sender} (${responseText.length} chars)`);

                    // Clean up
                    pendingMessages.delete(internalMessageId);
                    fs.unlinkSync(filePath);
                } else {
                    // Message too old or already processed
                    log('WARN', `No pending message for ${internalMessageId}, cleaning up`);
                    fs.unlinkSync(filePath);
                }
            } catch (error) {
                log('ERROR', `Error processing response file ${file}: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        log('ERROR', `Outgoing queue error: ${(error as Error).message}`);
    }
}

// Check outgoing queue every second
setInterval(checkOutgoingQueue, 1000);

// Refresh typing indicator every 4 seconds (Telegram action expires quickly)
setInterval(() => {
    for (const [, data] of pendingMessages.entries()) {
        bot.telegram.sendChatAction(data.chatId, 'typing').catch(() => {
            // Ignore errors
        });
    }
}, 4000);

// Start bot
bot.launch().then(() => {
    log('INFO', 'Telegram bot launched');
    log('INFO', 'Listening for messages...');
});

// Enable graceful stop
process.once('SIGINT', () => {
    log('INFO', 'Stopping Telegram client...');
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    log('INFO', 'Stopping Telegram client...');
    bot.stop('SIGTERM');
    process.exit(0);
});
