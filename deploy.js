/**
 * ==================================
 * Script to deploy commands to the guild (id) specified
 * ==================================
 */

const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, token } = require('./config.js');

/**
 * Deploys commands to a guild.
 * @param {String} guildId - Identifier of the guild to which commands will be deployed.
 */
function deployCommandsToGuild (guildId) {
	const commands = [];

	const commandFolders = fs.readdirSync('./commands');

	for (const folder of commandFolders) {
		const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
		for (const file of commandFiles) {
			const command = require(`./commands/${folder}/${file}`);
			commands.push(command.data.toJSON());
		}
	}

	const rest = new REST({ version: '9' }).setToken(token);

	async function deployment () {
		try {
			await rest.put(Routes.applicationGuildCommands(clientId, guildId),{ body: commands });
		} catch (error) {
			console.error(error);
		}
	}
	deployment();
}

module.exports = {
	deployCommandsToGuild
}