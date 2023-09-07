/* eslint-disable @typescript-eslint/naming-convention */
import { type CallbackQueryContext, type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import User from '../utils/user-manager.js'
import { getCalendarMenu } from '../utils/functions.js'
import { getAllCalendars } from '../utils/google.js'

const calendarsCommand = async (ctx: CommandContext<MyContext>) => {
	const buttonsForCallback = await getCalendarMenu(ctx)
	if (buttonsForCallback.length === 0) {
		return ctx.reply(`Please login to your Google Account first -> /login`)
	}

	await ctx.reply(`Please select calendar`, {
		reply_markup: {
			inline_keyboard: buttonsForCallback,
		},
	})
}

const calendarsCallback = async (ctx: CallbackQueryContext<MyContext>) => {
	const user = new User(ctx.from)
	const calendarId = ctx.match[1]
	const userSettings = await user.get()
	const [calendars, newAccessToken] = await getAllCalendars(
		userSettings.googleAccessToken!,
		userSettings.googleRefreshToken!,
	)

	if (!calendars) {
		return
	}

	if (newAccessToken && newAccessToken !== userSettings.googleAccessToken) {
		await user.set({
			googleAccessToken: newAccessToken,
		})
		console.log(`Token refreshed for user ${ctx.from.id}`)
	}

	const targetCalendar = calendars.find(
		(calendar) => calendar?.id === calendarId,
	)

	if (!targetCalendar) {
		await ctx.reply(`Calendar not found`)
		return
	}

	await user.set({
		calendarId,
		calendarName: targetCalendar.summary!,
	})

	const buttonsForCallback = await getCalendarMenu(ctx)

	await ctx.editMessageText(`Please select calendar`, {
		reply_markup: {
			inline_keyboard: buttonsForCallback,
		},
	})
}

export { calendarsCommand, calendarsCallback }
