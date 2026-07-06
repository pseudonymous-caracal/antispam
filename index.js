const fs = require('fs');
const { Client, Collection, GatewayIntentBits, MessageFlags } = require('discord.js');
const { token } = require('./config.js');

// this bot write ephemeral messages to the DATA directory, so we need to make sure it exists before the bot starts up
if (!fs.existsSync('./DATA')) fs.mkdirSync('./DATA');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();

const commandFolders = fs.readdirSync('./commands');

for (const folder of commandFolders) {
	const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const command = require(`./commands/${folder}/${file}`);
		client.commands.set(command.data.name, command);
	}
}

const eventFolders = fs.readdirSync('./events');
for (const folder of eventFolders) {
	const eventFiles = fs.readdirSync(`./events/${folder}`).filter(file => file.endsWith('.js'));
	for (const file of eventFiles) {
		const event = require(`./events/${folder}/${file}`);
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
	}
}

module.exports = client, client.commands;

client.on('interactionCreate', async interaction => {
	if (!interaction.isCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		return interaction.channel.send({ flags: [MessageFlags.Ephemeral], content: 'An error was thrown while executing this command.' });
	}
});

client.login(token);

// keep bot alive for hosting platforms with health checks
const http = require('http');
http.createServer((_, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);