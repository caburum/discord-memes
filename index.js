import { Client, Events, GatewayIntentBits } from 'discord.js';
import { cp, readFile, writeFile } from 'fs/promises';

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const filterMessage = (message) => message.attachments.size > 0 && message.attachments.every((attachment) => attachment.contentType && attachment.contentType.startsWith('image/'));

const messageToData = (message) => {
	return { content: message.content, attachments: message.attachments.map((attachment) => attachment.url) };
};

client.once(Events.ClientReady, async () => {
	console.log(`Ready! Logged in as ${client.user.tag}`);

	const guild = client.guilds.cache.get(process.env.SERVER_ID);
	if (!guild) throw new Error('Could not find guild');

	const channel = guild.channels.cache.get(process.env.CHANNEL_ID);
	if (!channel) throw new Error('Could not find channel');

	// only get messages with attachements that are images
	let imageMessages = [];

	// get all messages in channel
	let message = await channel.messages.fetch({ limit: 1 }).then((messagePage) => (messagePage.size === 1 ? messagePage.at(0) : null));
	if (filterMessage(message)) imageMessages.push(messageToData(message));

	while (message) {
		await channel.messages.fetch({ limit: 100, before: message.id }).then((messagePage) => {
			imageMessages = imageMessages.concat(messagePage.filter(filterMessage).map(messageToData));

			// Update our message pointer to be last message in page of messages
			message = 0 < messagePage.size ? messagePage.at(messagePage.size - 1) : null;
		});
	}

	console.log(`Found ${imageMessages.length} messages with images`);

	// copy public directory to output
	await cp('./public', './output', { recursive: true });

	// replace placeholder in index.html with json encoded messages
	const indexPath = './output/index.html';
	let indexFile = (await readFile(indexPath, 'utf-8')).replace('/* REPLACEME */ []', JSON.stringify(imageMessages));
	await writeFile(indexPath, indexFile, 'utf-8');

	process.exit(0);
});

client.login(process.env.TOKEN);
