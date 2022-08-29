const fs = require('fs');

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');

const { dbLogging, botPrefix, commandCooldown, twitchClientId, twitchClientSecret } = require('./config.json');
const { init_db } = require('./src/datamgmt/setup');
const { insert_bot_user, get_bot_users, remove_bot_user } = require('./src/datamgmt/db_utils');
const { get_fernando_quote } = require('./src/fernando/fernando_util');

// lista de comandos globales del bot
const global_commands = ['hola', 'adios', 'clip', 'fernando']

// monitor de cooldown para cada uno de los canales en los que está el bot
const cooldown = {};

// información de token del bot (incluye ID y nombre en Twitch)
let token_info = null;

// clientes de API y de chat
let api_client = null;
let chat_client = null;


function set_cooldown(channel) {
    cooldown[channel] = true;
    setTimeout(() => { cooldown[channel] = false; }, commandCooldown * 1000);
}


async function main() {

    // obtener base de datos
    const db = await init_db(dbLogging);

    // obtener proveedor de autenticación
    const token_data = JSON.parse(await fs.promises.readFile('./tokens.json', 'UTF-8'));
    const auth_provider = new RefreshingAuthProvider(
        {
            clientId: twitchClientId,
            clientSecret: twitchClientSecret,
            onRefresh: async newTokenData => await fs.promises.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'UTF-8')
        },
        token_data
    );

    // obtener cliente de API de Twitch
    api_client = new ApiClient({ authProvider: auth_provider });

    // registrar canal del bot en base de datos, si no está registrado todavía
    token_info = await api_client.getTokenInfo();
    await insert_bot_user(db, token_info.userId, token_info.userName);

    // obtener lista de canales a los que el bot debe conectarse
    const user_list = await get_bot_users(db);
    const channel_list = user_list.map(item => item.Name);

    // obtener y conectar cliente de chat de Twitch
    chat_client = new ChatClient({ authProvider: auth_provider, channels: channel_list });
    await chat_client.connect();

    // procesador de mensajes del bot
    chat_client.onMessage(async (channel, user, message, msg) => {
        try {
            // ignorar si no es un comando o si el canal está en cooldown
            if (!message.startsWith(botPrefix)) return;
            if (cooldown[channel]) return;

            message = message.trim().toLowerCase().substring(botPrefix.length);


            // RUTINAS DE COMANDOS

            // !hola
            if (message === 'hola') {
                await insert_bot_user(db, msg.userInfo.userId, msg.userInfo.userName);
                await chat_client.join(msg.userInfo.userName);
                await chat_client.say(channel, `Hola, ${user}. Me he unido a tu canal.`)
                set_cooldown(channel);
            }

            // !adios
            if (message === 'adios') {
                await remove_bot_user(db, msg.userInfo.userId);
                chat_client.part(msg.userInfo.userName);
                await chat_client.say(channel, `Adiós, ${user}. He salido de tu canal.`)
                set_cooldown(channel);
            }

            // !clip
            if (message === 'clip') {
                const clip_id = await api_client.clips.createClip({ channelId: msg.channelId });
                const clip = await api_client.clips.getClipById(clip_id);
                await chat_client.say(channel, clip.url);
                set_cooldown(channel);
            }

            // !fernando
            if (message.startsWith('fernando')) {
                const quote = await get_fernando_quote();
                await chat_client.say(channel, quote);
                set_cooldown(channel);
            }
        } catch (error) {
            console.log(error['message']);
        }
    });

    console.log(`Bot arrancado como usuario de Twitch: ${token_info.userName}`);
}

main();