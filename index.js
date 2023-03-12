//Environmental Variable
import dotenv from 'dotenv'
dotenv.config({ override: true })

//Telegram bot API
import TelegramBot from 'node-telegram-bot-api'
const bot = new TelegramBot(process.env.TG_TOKEN, { polling: true });

//ChatGPT API
import { ChatGPTAPI } from 'chatgpt'
const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY
})

//Queue to process the request
import Queue from 'bee-queue';
const queue = new Queue('ChatList');

//Database
import JSONdb from 'simple-json-db';
const db = new JSONdb('./storage.json');

//Function to check whether the user is able to use the ChatGPT
function inWhitelist(chatId) {
    if (chatId == 1) {
        return true;
    }
    else if (chatId == 2) {
        return true;
    }
    else if (chatId == 3) {
        return true;
    }
    else if(chatId == 4) {
        return true;
    }
    return false;
}

//async function to delete the session
async function del(bot, msg, args, {db}) {
    db.delete(msg.chat.id)
    await bot.sendMessage(msg.chat.id, '已清空聊天！', {
        reply_to_message_id: msg.message_id
    })
}

//async function to start the session
export async function start(bot, msg) {
    const text = "你好，这里是 ChatGPT！新的对话已建立。"
    await bot.sendMessage(msg.chat.id, text, {
        reply_to_message_id: msg.message_id
    })
}

bot.on('message', async (msg) => {

    const chatId = msg.chat.id;
    const chatText = msg.text;

    if(chatText == undefined) return ;

    if (chatText.startsWith("/")) {
        await bot.sendChatAction(chatId, "typing");
        let splitText = chatText.split(" ", 1);
        let cmd = splitText[0].replace("/", "");
        cmd = cmd.split("@", 1)[0];

        switch(cmd) {
            case 'chatid':
                return await bot.sendMessage(chatId, "这个聊天的 ID 是：" + chatId) ?? null;
            case 'newchat':
                if(inWhitelist(chatId)) {
                    return await del(bot, msg, splitText[1] ?? null, {
                        db
                    }) ?? null;
                } else {
                    bot.sendMessage(chatId, "It's not allowed to use this bot's ChatGPT function here!");
                }
            case 'start':
                if(inWhitelist(chatId)) {
                    return await start(bot, msg) ?? null;
                } else {
                    bot.sendMessage(chatId, "It's not allowed to use this bot's ChatGPT function here!");
                }
            case 'chatgpt':
                const thingMsgId = (await bot.sendMessage(chatId, "ChatGPT 正在思考中…", {
                    reply_to_message_id: msg.message_id
                })).message_id;
                await bot.sendChatAction(chatId, "typing");
                const job = await queue.createJob({
                    chatId,
                    thingMsgId,
                    text: chatText
                }).save()

                job.on('failed', async () => {
                    await job.retries(1).save();
                })
                break;
        }
    }
});

// bot.onText(/\/chatgpt (.+)/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     if(inWhitelist(chatId)) {
//         try {
//             const question = match[1];
//             bot.sendChatAction(chatId, "typing");
//             const resp = await api.sendMessage(question);
//             bot.sendMessage(chatId, resp.text);
//         } catch(err) {
//             bot.sendMessage(chatId, "卡诺二号累了，有什么事情明天再说。");
//         }
//     } else {
//         bot.sendMessage(chatId, "You are not allowed to use this bot!");
//     }
// });
//
// bot.onText(/\/my/, msg => {
//     const chatId = msg.chat.id;
//     bot.sendMessage(chatId, "这个聊天的 ID 是" + chatId);
// });

queue.process(async function (job, done) {
    const {text, chatId, thingMsgId} = job.data
    try {
        const chatInfo = db.has(chatId) ? db.get(chatId) : {}
        const chatSettings = {
            conversationId: chatInfo.conversationId ?? undefined,
            parentMessageId: chatInfo.lastMessage ?? undefined
        }

        let result = await api.sendMessage(text, chatSettings)

        let resp = result.text

        db.set(chatId, {conversationId: result.conversationId, lastMessage: result.id})
        await bot.editMessageText(resp, {
            chat_id: chatId,
            message_id: thingMsgId,
            parse_mode: 'Markdown'
        })
        return done()
    } catch (e) {
        console.log("Sleeping for 5 secs..")
        await sleep(5000)
        throw new Error("Error")
    }
});
