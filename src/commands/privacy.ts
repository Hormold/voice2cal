import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'

const privacyCommand = async (ctx: CommandContext<MyContext>) => {
	const header = `How we work with your data:\n`
	const data = [
		`👉 How we use Google Contacts API: we use them to autocomplete emails of your contacts when you create new event if you want to invite someone, we don't store them anywhere!`,
		`👉 How we use Google Calendar API: we use it to create new events, and to show you upcoming events. We don't store any data from your calendar anywhere!`,
		`👉 We store your Google Access Token in our database, but we don't store your private Google Contacts and Calendar data anywhere (We store only your selected Calendar ID and Name actually)!`,
		``,
		`👉 How we use your location: we're adding this information to GPT-4 instruction to make it more precise. We store your city and county names in our database, but we don't store your exact location anywhere!`,
		`👉 You can add your own instructions to GPT-4, but it requires Ultra plan. We store your instructions in our database.`,
	]

	await ctx.reply(`${header}\n\n${data.join('\n')}`)
}

export default privacyCommand
