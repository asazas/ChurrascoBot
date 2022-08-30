const fs = require('fs');

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');

const { dbLogging, botPrefix, commandCooldown, twitchClientId, twitchClientSecret } = require('./config.json');
const { init_db } = require('./src/datamgmt/setup');
const { insert_bot_user, get_bot_users, remove_bot_user, add_or_edit_command, delete_command, get_commands_for_channels } = require('./src/datamgmt/db_utils');
const { get_fernando_quote } = require('./src/fernando/fernando_util');
const { obtener_respuesta_de_comando } = require('./src/comandos/comandos_util');

// lista de comandos globales del bot
const global_commands = ['hola', 'adios', 'clip', 'fernando', 'comando', 'borracomando', 'comandos']

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
    await insert_bot_user(db, token_info.userId, token_info.userName.toLowerCase());

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
            const args = message.split(/\s+/);


            // RUTINAS DE COMANDOS

            // !hola
            if (msg.channelId === token_info.userId && args.length === 1 && args[0] === 'hola') {
                await insert_bot_user(db, msg.userInfo.userId, msg.userInfo.userName.toLowerCase());
                await chat_client.join(msg.userInfo.userName);
                await chat_client.say(channel, `Hola, ${user}. Me he unido a tu canal.`)
                set_cooldown(channel);
                return;
            }

            // !adios
            else if (msg.channelId === token_info.userId && args.length === 1 && args[0] === 'adios') {
                await remove_bot_user(db, msg.userInfo.userId);
                chat_client.part(msg.userInfo.userName);
                await chat_client.say(channel, `Adiós, ${user}. He salido de tu canal.`)
                set_cooldown(channel);
                return;
            }

            // !clip
            else if (args.length === 1 && args[0] === 'clip') {
                let clip_id = null;
                try {
                    clip_id = await api_client.clips.createClip({ channelId: msg.channelId });
                } catch (error) {
                    if (error.name === 'HttpStatusCodeError' && error.statusCode === 404) {
                        await chat_client.say(channel, 'No se pueden crear clips en canales desconectados.');
                        set_cooldown(channel);
                        return;
                    }
                    else {
                        await chat_client.say(channel, 'Se ha producido un error al intentar crear el clip.');
                        set_cooldown(channel);
                        throw error;
                    }
                }
                if (clip_id) {
                    await chat_client.say(channel, `https://clips.twitch.tv/${clip_id}`);
                    set_cooldown(channel);
                    return;
                }
            }

            // !fernando
            else if (args[0] === 'fernando') {
                const quote = await get_fernando_quote();
                await chat_client.say(channel, quote);
                set_cooldown(channel);
                return;
            }

            // !comando
            else if (args[0] === 'comando') {
                if (!(msg.userInfo.isBroadcaster || msg.userInfo.isMod)) {
                    await chat_client.say(channel, 'Solo moderadores del canal pueden ejecutar este comando.');
                    set_cooldown(channel);
                    return;
                }
                if (args.length < 3) {
                    await chat_client.say(channel, 'Es necesario especificar el nombre del comando y su respuesta.');
                    set_cooldown(channel);
                    return;
                }
                if (global_commands.includes(args[1])) {
                    await chat_client.say(channel, 'El nombre del comando no puede coincidir con el de un comando global.');
                    set_cooldown(channel);
                    return;
                }
                await add_or_edit_command(db, args[1], msg.channelId, args.slice(2).join(' '));
                await chat_client.say(channel, `El comando ${args[1]} se ha añadido correctamente al canal.`);
                set_cooldown(channel);
                return;
            }

            // !borracomando
            else if (args[0] === 'borracomando') {
                if (!(msg.userInfo.isBroadcaster || msg.userInfo.isMod)) {
                    await chat_client.say(channel, 'Solo moderadores del canal pueden ejecutar este comando.');
                    set_cooldown(channel);
                    return;
                }
                if (args.length !== 2) {
                    await chat_client.say(channel, 'Es necesario especificar el nombre del comando a borrar.');
                    set_cooldown(channel);
                    return;
                }
                const borrados = await delete_command(db, args[1], msg.channelId);
                if (borrados) {
                    await chat_client.say(channel, `El comando ${args[1]} se ha eliminado del canal.`);
                }
                else {
                    await chat_client.say(channel, `No existe ningún comando con ese nombre.`);
                }
                set_cooldown(channel);
                return;
            }

            // !comandos
            else if (args.length === 1 && args[0] === 'comandos') {
                const comms = await get_commands_for_channels(db, [msg.channelId, token_info.userId]);
                if (comms.length === 0) {
                    await chat_client.say(channel, `No hay comandos definidos en este canal.`);
                }
                else {
                    const comm_names = [...new Set(comms.map(item => item.Name))].sort();
                    await chat_client.say(channel, `Mis comandos: ${comm_names.join(', ')}`);
                }
                set_cooldown(channel);
                return;
            }

            // comandos definidos en canales
            else {
                const args = message.split(/\s+/);
                const response = await obtener_respuesta_de_comando(db, args[0], [msg.channelId, token_info.userId]);
                if (response) {
                    await chat_client.say(channel, response);
                }
                set_cooldown(channel);
                return;
            }

        } catch (error) {
            console.error(error['message']);
        }
    });

    console.log(`Bot arrancado como usuario de Twitch: ${token_info.userName}`);
}

main();