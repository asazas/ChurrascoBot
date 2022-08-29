const { Op, Sequelize, Model } = require('sequelize');


/**
 * @summary Llamado en la inicialización del bot para obtener los canales en los que debe entrar.
 * 
 * @description Devuelve los datos de todos los canales registrados en base de datos.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * 
 * @returns {Model[]} Array que contiene la información de los canales registrados.
 */
async function get_bot_users(sequelize) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.findAll({
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado al añadir un nuevo usuario del bot (comando !hola).
 * 
 * @description Registra un canal de Twitch para que el bot empiece a escuchar en su chat.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * @param {string}    user_id   ID de Twitch asociado al usuario añadido.
 * @param {string}    user_name Canal de Twitch del usuario añadido.
 * 
 * @returns {[Model, null]} Array cuyo primer elemento es el modelo correspondiente al usuario añadido.
 */
async function insert_bot_user(sequelize, user_id, user_name) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.upsert({
                UserId: user_id,
                Name: user_name,
            }, {
                transaction: t,
            });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}


/**
 * @summary Llamado al eliminar un usuario del bot (comando !adios).
 * 
 * @description Elimina un canal de Twitch del registro y hace que el bot deje de escuchar en su chat.
 * 
 * @param {Sequelize} sequelize Base de datos del bot.
 * @param {string}    user_id   ID de Twitch asociado al usuario a eliminar.
 * 
 * @returns {number} Número de entradas de base de datos eliminadas.
 */
async function remove_bot_user(sequelize, user_id) {
    const channels = sequelize.models.Channels;
    try {
        return await sequelize.transaction(async (t) => {
            return await channels.destroy(
                {
                    where: {
                        UserId: user_id,
                    }
                },
                {
                    transaction: t,
                });
        });
    }
    catch (error) {
        console.error(error['message']);
    }
}

module.exports = { get_bot_users, insert_bot_user, remove_bot_user };