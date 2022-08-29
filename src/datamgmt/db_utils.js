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
 * @summary Llamado al añadir un nuevo usuario del bot.
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


module.exports = { get_bot_users, insert_bot_user };