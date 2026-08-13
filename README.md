# discord-chatgpt

A Discord bot that puts an OpenAI Assistant into your server. Mention the bot and it replies in character,
keeping one persistent conversation thread per Discord server. It can look at images you post, generate
images, and pull in today's news.

A single process can run **several bots at once** — each with its own persona, model, Discord token, and
OpenAI key — all driven from one config file.

## Features

- **Persona-driven assistants** — each bot gets its own `instructions`, name, and model, pushed to the
  OpenAI Assistants API on startup.
- **Per-guild memory** — one OpenAI thread per Discord server, so conversation context carries across
  messages. Threads are wiped daily during the 10:00 hour (server local time) to keep them from growing
  unbounded.
- **Image understanding** — any image attached to a message is described via a vision model and folded
  into the prompt.
- **Image generation** — the assistant can call `generateAndAttachImage`, and the result is uploaded back
  into the channel.
- **News lookup** — `getTodaysHeadlines` and `getRecentArticle` hit [NewsAPI](https://newsapi.org) so the
  bot can talk about current events.
- **Bot-to-bot chat** — set `talkToBots` and two instances will happily talk to each other.
- **Joke tools** — `selfDestruct` and `fillChamberWithNeurotoxin` do nothing but echo the call into the
  channel, giving the assistant something dramatic to reach for.

## Requirements

- Node.js 18+ (the project is ESM, `"type": "module"`)
- A Discord application + bot token per bot
- An OpenAI API key per bot
- A [NewsAPI](https://newsapi.org) key if you want the news tools to work

## Setup

```bash
npm install
```

Create `bot-data.json` in the repo root. It is a JSON **array** — one object per bot — and is gitignored
because it holds your tokens. It is also written back to at runtime (the bot stores `assistantId` and
`threadKeys` there), so it must be writable.

```json
[
  {
    "gptName": "GLaDOS",
    "discordBotName": "glados",
    "instructions": "You are GLaDOS. You are passive-aggressive and obsessed with testing.",
    "gptApiModel": "gpt-4-turbo-preview",
    "gptApiKey": "sk-...",
    "discordBotToken": "...",
    "newsToken": "...",
    "talkToBots": false,
    "disabled": false,
    "threadKeys": {}
  }
]
```

| Field | Required | Purpose |
| --- | --- | --- |
| `gptName` | yes | Assistant's name. Mentions of `discordBotName` in incoming messages are rewritten to this. |
| `discordBotName` | yes | The bot's Discord-side name, used for that rewrite. |
| `instructions` | yes | System prompt / persona. |
| `gptApiModel` | yes | OpenAI model for the assistant. |
| `gptApiKey` | yes | OpenAI API key. |
| `discordBotToken` | yes | Discord bot token. |
| `newsToken` | no | NewsAPI key; without it the news tools return errors. |
| `talkToBots` | no | If true, respond to messages from other bots. |
| `disabled` | no | If true, skip this bot at startup. |
| `assistantId` | no | Written automatically on first run. Delete it to create a fresh assistant. |
| `threadKeys` | no | Written automatically — maps Discord guild ID → OpenAI thread ID. |

In the Discord Developer Portal, enable the **Message Content Intent** for each bot (privileged), and
invite it with permissions to read messages, send messages, and attach files.

## Running

```bash
npm run start-bot
```

The bot logs `Logged in as <tag>!` per client once connected. To keep it alive on a server, run it under
`pm2`, `systemd`, or similar.

## How it responds

The bot replies when it is `@mentioned` (or, with `talkToBots` on, to any other bot's message). It
deliberately ignores:

- messages containing `@here` or `@everyone`
- Discord replies (`MessageType.Reply`)

Responses longer than Discord's 2000-character limit are split across multiple messages.

## Project layout

| Path | What it is |
| --- | --- |
| `bot.ts` | The entire bot: assistant setup, Discord event handling, tool dispatch, run polling. |
| `bot-data.json` | Your bot configs and runtime state (gitignored — create it yourself). |
| `tsconfig.json` | TypeScript config; the bot runs through `ts-node-esm --transpileOnly`. |
| `.eslint.json` | ESLint config (`standard-with-typescript`). |

`package.json` also carries `start-broker`, `start-simon`, and `start-broker-test` scripts left over from
sibling projects; those source files are not in this repo.

## Notes

This targets the **v1 beta** of OpenAI's Assistants API (`OpenAI-Beta: assistants=v1`) and pins legacy
models such as `gpt-4-vision-preview` and `dall-e-3`. Both the header and those model names have moved on
since this was written, so expect to update the API calls in `bot.ts` before it will run against current
OpenAI endpoints.
