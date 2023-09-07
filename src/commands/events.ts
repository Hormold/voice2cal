import { type CommandContext } from 'grammy'
import { type MyContext, type CalendarEvent } from '../types.js'
import { getCalendarEvents } from '../utils/google.js'
import User from '../utils/user-manager.js'
import { buildPreviewString } from '../utils/functions.js'

const eventsCommand = async (ctx: CommandContext<MyContext>) => {
	const user = new User(ctx.from!)
	const userSettings = await user.checkGoogleTokenAndGet()

	const allEvents = (await getCalendarEvents(
		userSettings.googleAccessToken!,
		userSettings.calendarId!,
		true,
	)) as CalendarEvent[]

	let eventString = ''
	for (const event of allEvents) {
		eventString += buildPreviewString(event, userSettings.timeZone!) + '\n\n'
	}

	await ctx.reply(`Found ${allEvents.length} events:\n\n${eventString}`)
}

export default eventsCommand
