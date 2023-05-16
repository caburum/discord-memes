import { Client, Events, GatewayIntentBits } from 'discord.js';
import { cp, readFile, writeFile } from 'fs/promises';
import { createRequire } from 'module';

/** @param {import('discord.js').Attachment} attachment */
const filterAttachment = (attachment) => attachment?.contentType?.startsWith('image/') || attachment.url.match(/\.(png|jpe?g|gif|webp)$/i); // old messages don't have contentType

/** @param {import('discord.js').Message} message */
const filterMessage = (message) => message.attachments.size > 0 && message.attachments.some(filterAttachment) && !(message.reactions.cache.get('❌')?.count > 0);

/** @param {import('discord.js').Message} message */
const messageToData = (message) => {
	return { id: BigInt(message.id).toString(36), content: message.content, attachments: message.attachments.filter(filterAttachment).map((attachment) => attachment.url) };
};

const build = async (data) => {
	// copy public directory to output
	await cp('./public', './output', { recursive: true });

	const json = JSON.stringify(data);

	await writeFile('./output/data.json', json, 'utf-8');

	// replace placeholder in index.html with json encoded messages
	const indexPath = './output/index.html';
	let indexFile = (await readFile(indexPath, 'utf-8')).replace('/* REPLACEME */ []', json);
	await writeFile(indexPath, indexFile, 'utf-8');
};

if (process.argv.includes('--cached')) {
	// const { default: data } = await import('./output/data.json', { assert: { type: 'json' } });
	const data = createRequire(import.meta.url)('./output/data.json');
	await build(data);
	process.exit(0);
} else {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
	});

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

		await build(imageMessages);
		process.exit(0);
	});

	client.login(process.env.TOKEN);
}
