# Kitebot 🦞

Minimal multi-channel AI assistant with Discord and WhatsApp integration.

## 🎯 What is Kitebot?

Kitebot is a lightweight wrapper around [Claude Code](https://claude.com/claude-code) that:

- ✅ Connects Discord (via bot token) and WhatsApp (via QR code)
- ✅ Processes messages sequentially (no race conditions)
- ✅ Maintains conversation context
- ✅ Runs 24/7 in tmux
- ✅ Multi-channel ready (Telegram, Slack, etc.)

**Key innovation:** File-based queue system prevents race conditions and enables seamless multi-channel support.

## 📐 Architecture

```
┌─────────────────┐
│  Discord        │──┐
│  Client         │  │
└─────────────────┘  │
                     │
┌─────────────────┐  │
│  WhatsApp       │──┤
│  Client         │  │
└─────────────────┘  ├──→ Queue (incoming/)
                     │        ↓
┌─────────────────┐  │   ┌──────────────┐
│  Other Channels │──┤   │   Queue      │
│  (future)       │  │   │  Processor   │
└─────────────────┘  │   └──────────────┘
                     │        ↓
                     │   claude -c -p
                     │        ↓
                     │   Queue (outgoing/)
                     │        ↓
                     └──> Channels send
                          responses
```

## 🚀 Quick Start

### Prerequisites

- macOS or Linux
- [Claude Code](https://claude.com/claude-code) installed
- Node.js v14+
- tmux

### Installation

```bash
cd /path/to/kitebot

# Install dependencies
npm install

# Start Kitebot (first run triggers setup wizard)
./kitebot.sh start
```

### First Run - Setup Wizard

On first start, you'll see an interactive setup wizard:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Kitebot - Setup Wizard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Which messaging channel do you want to use?

  1) Discord
  2) WhatsApp
  3) Both

Choose [1-3]: 3

✓ Channel: both

Enter your Discord bot token:
(Get one at: https://discord.com/developers/applications)

Token: YOUR_DISCORD_BOT_TOKEN_HERE

✓ Discord token saved

Which Claude model?

  1) Sonnet  (fast, recommended)
  2) Opus    (smartest)

Choose [1-2]: 1

✓ Model: sonnet

Heartbeat interval (seconds)?
(How often Claude checks in proactively)

Interval [default: 500]: 500

✓ Heartbeat interval: 500s

✓ Configuration saved to .kitebot/settings.json
```

### Discord Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable "Message Content Intent" in Bot settings
6. Invite the bot to your server using OAuth2 URL Generator

### WhatsApp Setup

After starting, a QR code will appear if WhatsApp is enabled:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        WhatsApp QR Code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[QR CODE HERE]

📱 Scan with WhatsApp:
   Settings → Linked Devices → Link a Device
```

Scan it with your phone. **Done!** 🎉

### Test It

**Discord:** Send a DM to your bot or mention it in a channel

**WhatsApp:** Send a message to the connected number

You'll get a response! 🤖

## 📋 Commands

```bash
# Start Kitebot
./kitebot.sh start

# Run setup wizard (change channels/model/heartbeat)
./kitebot.sh setup

# Check status
./kitebot.sh status

# Send manual message
./kitebot.sh send "What's the weather?"

# Reset conversation
./kitebot.sh reset

# Reset channel authentication
./kitebot.sh channels reset whatsapp  # Clear WhatsApp session
./kitebot.sh channels reset discord   # Shows Discord reset instructions

# Switch Claude model
./kitebot.sh model           # Show current model
./kitebot.sh model sonnet    # Switch to Sonnet (fast)
./kitebot.sh model opus      # Switch to Opus (smartest)

# View logs
./kitebot.sh logs whatsapp   # WhatsApp activity
./kitebot.sh logs discord    # Discord activity
./kitebot.sh logs queue      # Queue processing
./kitebot.sh logs heartbeat  # Heartbeat checks

# Attach to tmux
./kitebot.sh attach

# Restart
./kitebot.sh restart

# Stop
./kitebot.sh stop
```

## 🔧 Components

### 1. setup-wizard.sh

- Interactive setup on first run
- Configures channels (Discord/WhatsApp/Both)
- Collects Discord bot token
- Selects Claude model
- Writes to `.kitebot/settings.json`

### 2. discord-client.ts

- Connects to Discord via bot token
- Listens for DMs and mentions
- Writes incoming messages to queue
- Reads responses from queue
- Sends replies back

### 3. whatsapp-client.ts

- Connects to WhatsApp via QR code
- Writes incoming messages to queue
- Reads responses from queue
- Sends replies back

### 4. queue-processor.ts

- Polls incoming queue
- Processes **ONE message at a time**
- Calls `claude -c -p`
- Writes responses to outgoing queue

### 5. heartbeat-cron.sh

- Runs every 5 minutes
- Sends heartbeat via queue
- Keeps conversation active

### 6. kitebot.sh

- Main orchestrator
- Manages tmux session
- CLI interface

## 💬 Message Flow

```
Discord/WhatsApp message arrives
       ↓
Client writes to:
  .kitebot/queue/incoming/{discord|whatsapp}_<id>.json
       ↓
queue-processor.ts picks it up
       ↓
Runs: claude -c -p "message"
       ↓
Writes to:
  .kitebot/queue/outgoing/{discord|whatsapp}_<id>.json
       ↓
Client reads and sends response
       ↓
User receives reply
```

## 📁 Directory Structure

```
kitebot/
├── .claude/              # Claude Code config
│   ├── settings.json     # Hooks config
│   └── hooks/            # Hook scripts
├── .kitebot/            # Kitebot data
│   ├── settings.json     # Configuration (channel, model, tokens)
│   ├── queue/
│   │   ├── incoming/     # New messages
│   │   ├── processing/   # Being processed
│   │   └── outgoing/     # Responses
│   ├── logs/
│   │   ├── discord.log
│   │   ├── whatsapp.log
│   │   ├── queue.log
│   │   └── heartbeat.log
│   ├── channels/         # Runtime channel data
│   ├── whatsapp-session/
│   └── heartbeat.md
├── src/
│   ├── discord-client.ts    # Discord I/O
│   ├── whatsapp-client.ts   # WhatsApp I/O
│   └── queue-processor.ts   # Message processing
├── dist/                 # TypeScript build output
├── setup-wizard.sh       # Interactive setup
├── kitebot.sh           # Main script
└── heartbeat-cron.sh     # Health checks
```

## 🔄 Reset Conversation

### Via CLI

```bash
./kitebot.sh reset
```

### Via WhatsApp

Send: `!reset` or `/reset`

Next message starts fresh (no conversation history).

## ⚙️ Configuration

### Settings File

All configuration is stored in `.kitebot/settings.json`:

```json
{
  "channel": "both",
  "model": "sonnet",
  "discord_bot_token": "YOUR_TOKEN_HERE",
  "heartbeat_interval": 500
}
```

To reconfigure, run:
```bash
./kitebot.sh setup
```

The heartbeat interval is in seconds (default: 500s = ~8 minutes).
This controls how often Claude proactively checks in.

### Heartbeat Prompt

Edit `.kitebot/heartbeat.md`:

```markdown
Check for:

1. Pending tasks
2. Errors
3. Unread messages

Take action if needed.
```

## 📊 Monitoring

### View Logs

```bash
# WhatsApp activity
tail -f .kitebot/logs/whatsapp.log

# Queue processing
tail -f .kitebot/logs/queue.log

# Heartbeat checks
tail -f .kitebot/logs/heartbeat.log

# All logs
./kitebot.sh logs daemon
```

### Watch Queue

```bash
# Incoming messages
watch -n 1 'ls -lh .kitebot/queue/incoming/'

# Outgoing responses
watch -n 1 'ls -lh .kitebot/queue/outgoing/'
```

## 🎨 Features

### ✅ No Race Conditions

Messages processed **sequentially**, one at a time:

```
Message 1 → Process → Done
Message 2 → Wait → Process → Done
Message 3 → Wait → Process → Done
```

### ✅ Multi-Channel Support

Discord and WhatsApp work seamlessly together. Add more channels easily:

**Example: Add Telegram**

```typescript
// telegram-client.ts
// Write to queue
fs.writeFileSync(
  '.kitebot/queue/incoming/telegram_<id>.json',
  JSON.stringify({
    channel: 'telegram',
    message,
    chatId,
    timestamp
  })
);

// Read responses from outgoing queue
// Same format as Discord/WhatsApp
```

Queue processor handles all channels automatically!

### ✅ Clean Responses

Uses `claude -c -p`:

- `-c` = continue conversation
- `-p` = print mode (clean output)
- No tmux capture needed

### ✅ Persistent Sessions

WhatsApp session persists across restarts:

```bash
# First time: Scan QR code
./kitebot.sh start

# Subsequent starts: Auto-connects
./kitebot.sh restart
```

## 🔐 Security

- WhatsApp session stored locally in `.kitebot/whatsapp-session/`
- Queue files are local (no network exposure)
- Each channel handles its own authentication
- Claude runs with your user permissions

## 🐛 Troubleshooting

### WhatsApp not connecting

```bash
# Check logs
./kitebot.sh logs whatsapp

# Reset WhatsApp authentication
./kitebot.sh channels reset whatsapp
./kitebot.sh restart
```

### Discord not connecting

```bash
# Check logs
./kitebot.sh logs discord

# Update Discord bot token
./kitebot.sh setup
```

### Messages not processing

```bash
# Check queue processor
./kitebot.sh status

# Check queue
ls -la .kitebot/queue/incoming/

# View queue logs
./kitebot.sh logs queue
```

### QR code not showing

```bash
# Attach to tmux to see the QR code
tmux attach -t kitebot
```

## 🚀 Production Deployment

### Using systemd

```bash
sudo systemctl enable kitebot
sudo systemctl start kitebot
```

### Using PM2

```bash
pm2 start kitebot.sh --name kitebot
pm2 save
```

### Using supervisor

```ini
[program:kitebot]
command=/path/to/kitebot/kitebot.sh start
autostart=true
autorestart=true
```

## 🎯 Use Cases

### Personal AI Assistant

```
You: "Remind me to call mom"
Claude: "I'll remind you!"
[5 minutes later via heartbeat]
Claude: "Don't forget to call mom!"
```

### Code Helper

```
You: "Review my code"
Claude: [reads files, provides feedback]
You: "Fix the bug"
Claude: [fixes and commits]
```

### Multi-Device

- WhatsApp on phone
- Discord on desktop/mobile
- CLI for scripts

All channels share the same Claude conversation!

## 🙏 Credits

- Inspired by [OpenClaw](https://openclaw.ai/) by Peter Steinberger
- Built on [Claude Code](https://claude.com/claude-code)
- Uses [discord.js](https://discord.js.org/)
- Uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)

## 📄 License

MIT

---

**Kitebot - Small but mighty!** 🦞✨
