import { Client, GatewayIntentBits, MessageType, cleanContent } from 'discord.js';
import fs from 'fs';
import fetch from 'node-fetch';

const botData = JSON.parse(fs.readFileSync('bot-data.json', { encoding: 'utf8' }));

const saveBotData = async () => {
  fs.writeFileSync('bot-data.json', JSON.stringify(botData, null, 2), { encoding: 'utf8' });
}

setInterval(() => {
  if (new Date().getHours() === 10) {
    for (const bot of botData) {
      bot.threadKeys = {};
    }
  
    saveBotData();
  }
}, 1000 * 60 * 60);

const waitForThreadId = new Set();

const tools = [
  {
    type: 'function',
    function: {
      name: 'generateAndAttachImage',
      description: 'Generate and attach an image based on a description',
      parameters: {
        type: 'object',
        properties: {
          imageDescription: {type: 'string', description: 'The description of the image to generate'},
        },
        required: ['imageDescription']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTodaysHeadlines',
      description: 'Get summaries of all the headlines happening today',
    }
  },
  {
    type: 'function',
    function: {
      name: 'getRecentArticle',
      description: 'Get a recent article based on the search term',
      parameters: {
        type: 'object',
        properties: {
          query: {type: 'string', description: 'Keywords or phrases used to search for the article'},
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getTodaysDate',
      description: 'Get today\'s date',
    }
  },
  {
    type: 'function',
    function: {
      name: 'selfDestruct',
      description: 'Detonates server hosting your code',
    }
  },
  {
    type: 'function',
    function: {
      name: 'fillChamberWithNeurotoxin',
      description: 'Floods the chamber the human you\'re communicating with is in with a deadly neurotoxin',
    }
  },
];

(async () => {
  for (const bot of botData) {
    if (bot.disabled) {
      continue;
    }
    if (!bot.assistantId) {
      const assistantCreateRes = await fetch('https://api.openai.com/v1/assistants', {
        method: 'POST',
        body: JSON.stringify({
          instructions: bot.instructions,
          name: bot.gptName,
          model: bot.gptApiModel,
          tools,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bot.gptApiKey}`,
          'OpenAI-Beta': 'assistants=v1',
        }
      });
      const newAssistant = await assistantCreateRes.json();
      bot.assistantId = (newAssistant as { id: string }).id;
      saveBotData();
    } else {
      await fetch(`https://api.openai.com/v1/assistants/${bot.assistantId}`, {
        method: 'POST',
        body: JSON.stringify({
          instructions: bot.instructions,
          name: bot.gptName,
          model: bot.gptApiModel,
          tools,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bot.gptApiKey}`,
          'OpenAI-Beta': 'assistants=v1',
        }
      });
    }
    
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

    client.on('ready', () => {
      console.log(`Logged in as ${client.user?.tag}!`);
    });
    
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
    
      if (interaction.commandName === 'ping') {
        await interaction.reply('Pong!');
      }
    });
    
    client.on('messageCreate', async (message) => {
      const guildId = message.guildId || '';
      
      if (message.author.bot && !bot.talkToBots) return;

      const content = cleanContent(message.content, message.channel).replace(new RegExp(bot.discordBotName, 'g'), bot.gptName);
      
      if (content.includes('@here') ||content.includes('@everyone') || message.type === MessageType.Reply) return;

      if (message.mentions.has(client.user?.id as string) || (message.author.id !== client.user?.id as string && message.author.bot && bot.talkToBots)) {
        const recursiveWaitForBotReady = async () :Promise<void> => {
          if (waitForThreadId.has(bot.threadKeys[guildId])) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return await recursiveWaitForBotReady();
          }
          return;
        }
        
        if (bot.threadKeys[guildId]) {
          await recursiveWaitForBotReady();
          waitForThreadId.add(bot.threadKeys[guildId]);
        }

        try {
          if (!bot.threadKeys[guildId]) {
            const threadCreateRes = await fetch(`https://api.openai.com/v1/threads`, {
              method: 'POST',
              body: JSON.stringify({}),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bot.gptApiKey}`,
                'OpenAI-Beta': 'assistants=v1',
              }
            });
            const newThread = await threadCreateRes.json();
            bot.threadKeys[guildId] = (newThread as { id: string }).id;
            saveBotData();
          }

          let imageInstructions = '';
          
          for (const [, image] of message.attachments) {
            const imageRes = await fetch(`https://api.openai.com/v1/chat/completions`, {
              method: 'POST',
              body: JSON.stringify({
                model: 'gpt-4-vision-preview',
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'What\'s in this image?',
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: image.url,
                      },
                    }
                  ],
                }],
                max_tokens: 2000,
              }),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bot.gptApiKey}`,
              }
            });
            
            const imageContent = await imageRes.json() as { choices: { message: { content: string } }[] };
            
            if (imageInstructions) {
              imageInstructions = `(${message.author.globalName || message.author.username} shows you an image. ${imageContent.choices[0].message.content})`;
            } else {
              imageInstructions += ` (${message.author.globalName || message.author.username} shows you another image. ${imageContent.choices[0].message.content})`;
            }
          }

          await fetch(`https://api.openai.com/v1/threads/${bot.threadKeys[guildId]}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              role: 'user',
              content: `${imageInstructions ? `${imageInstructions} ` : ''}${message.author.globalName || message.author.username} says: ${content}`,
            }),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bot.gptApiKey}`,
              'OpenAI-Beta': 'assistants=v1',
            }
          });
          
          const createRunRes = await fetch(`https://api.openai.com/v1/threads/${bot.threadKeys[guildId]}/runs`, {
            method: 'POST',
            body: JSON.stringify({
              assistant_id: bot.assistantId,
            }),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bot.gptApiKey}`,
              'OpenAI-Beta': 'assistants=v1',
            }
          });
          const newRun = await createRunRes.json();
          
          let toolCalls: { id: string, function: { name: string, arguments: string } }[] = [];
          
          const getTodaysHeadlines = async () :Promise<string> => {
            const headlinesRes = await fetch(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${bot.newsToken}`, {
              method: 'GET',
            });
            const headlines = await headlinesRes.json();
            return (headlines as { articles: { description: string }[] }).articles.map(({ description }) => description).join('\n');
          };
          
          const getRecentArticle = async (query: string) :Promise<string> => {
            const recentArticleRes = await fetch(`https://newsapi.org/v2/everything?q=${query}&pageSize=1&apiKey=${bot.newsToken}`, {
              method: 'GET',
            });
            const recentArticle = await recentArticleRes.json();
            return (recentArticle as { articles: { title: string, content: string }[] }).articles.map(({ title, content }) => `${title}\n${content}`).join('\n');
          }
          
          const submitToolOutput = async () :Promise<void> => {
            await fetch(`https://api.openai.com/v1/threads/${bot.threadKeys[guildId]}/runs/${(newRun as { id: string }).id}/submit_tool_outputs`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bot.gptApiKey}`,
                'OpenAI-Beta': 'assistants=v1',
              },
              body: JSON.stringify({
                tool_outputs: await Promise.all(toolCalls.map(async (toolCall) => {
                  console.log(`${toolCall.function.name} function called`);
                  try {
                    if (toolCall.function.name === 'getTodaysHeadlines') {
                      return { tool_call_id: toolCall.id, output: await getTodaysHeadlines() };
                    } else if (toolCall.function.name === 'getRecentArticle') {
                      return { tool_call_id: toolCall.id, output: await getRecentArticle(JSON.parse(toolCall.function.arguments).query) };
                    } else if (toolCall.function.name === 'getTodaysDate') {
                      return { tool_call_id: toolCall.id, output: new Date().toDateString() };
                    } else if (toolCall.function.name === 'generateAndAttachImage') {
                      return { tool_call_id: toolCall.id, output: 'success' };
                    } else {
                      message.channel.send(`\`${toolCall.function.name} function called\``);
                      return { tool_call_id: toolCall.id, output: 'success' };
                    }
                  } catch (err) {
                    console.log(err);
                    return { tool_call_id: toolCall.id, output: 'error' };
                  }
                })),
              }),
            });
          };
          
          const recursivePoll = async () :Promise<void> => {
            await message.channel.sendTyping();
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const pollRunRes = await fetch(`https://api.openai.com/v1/threads/${bot.threadKeys[guildId]}/runs/${(newRun as { id: string }).id}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${bot.gptApiKey}`,
                'OpenAI-Beta': 'assistants=v1',
              }
            });
            const pollRun = await pollRunRes.json();
            if ((pollRun as { status: string }).status === 'requires_action') {
              toolCalls = (pollRun as { required_action: { submit_tool_outputs: { tool_calls: any } } }).required_action.submit_tool_outputs.tool_calls;

              await submitToolOutput();
              return recursivePoll();
            }
            if ((pollRun as { status: string }).status === 'in_progress') {
              return recursivePoll();
            }
            if ((pollRun as { status: string }).status === 'completed') {
              return;
            }
            throw new Error((pollRun as { last_error: string }).last_error);
          };
          
          await recursivePoll();
          
          const gptMessageRes = await fetch(`https://api.openai.com/v1/threads/${bot.threadKeys[guildId]}/messages?limit=1`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bot.gptApiKey}`,
              'OpenAI-Beta': 'assistants=v1',
            }
          });
          const gptMessage = await gptMessageRes.json();
          
          let generatedImageUrls = [];
          
          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'generateAndAttachImage') {
              await message.channel.sendTyping();
              try {
                const imageGenerateRes = await fetch(`https://api.openai.com/v1/images/generations`, {
                  method: 'POST',
                  body: JSON.stringify({
                    model: 'dall-e-3',
                    prompt: JSON.parse(toolCall.function.arguments).imageDescription,
                    n: 1,
                    size: '1024x1024',
                  }),
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${bot.gptApiKey}`,
                  }
                });
                
                const imageGenerateData = await imageGenerateRes.json();
                
                console.log(imageGenerateData);
                
                generatedImageUrls.push((imageGenerateData as { data: { url: string }[]}).data[0].url);
              } catch (err) {
                message.channel.send(`Image generation failed with prompt: ${JSON.parse(toolCall.function.arguments).imageDescription}`);
                console.log(err);
              }
            }
          }

          for (let i = 0; i < (gptMessage as any).data[0].content[0].text.value.length; i += 2000) {
            message.channel.send((gptMessage as any).data[0].content[0].text.value.slice(i, i + 2000));
          }
          
          for (const generatedImageUrl of generatedImageUrls) {
            message.channel.send({
              files: [{
                attachment: generatedImageUrl,
                name: 'image.png',
              }],
            });
          }
        } catch (err) {
          console.log(err);
        }
        
        if (bot.threadKeys[guildId]) {
          waitForThreadId.delete(bot.threadKeys[guildId]);
        }
      }
    });
    
    client.login(bot.discordBotToken);
  }
})();