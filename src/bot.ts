/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable @typescript-eslint/naming-convention */
import type { ReadStream } from 'node:fs'
import process from 'node:process'
import { Bot } from 'grammy'
import got from 'got'
import {
	addCalendarEvent,
	getAllCalendars,
	cancelGoogleEvent,
	googleLogin,
} from './utils/google.js'
import runWay2 from './llm/way2.js'
import runWay1 from './llm/way1.js'
import getOpenAiClient from './utils/openai.js'
import User from './utils/user-manager.js'
import {
	buildPreviewString,
	getCalendarMenu,
	getModeMenu,
} from './utils/functions.js'
import { type GeoData, type CalendarEvent } from './types.js'
import redisClient from './utils/redis.js'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
const bot = new Bot(process.env.BOT_TOKEN!)

const commands = {
	login: '👤 Login to Google Account',
	calendars: '📅 Select calendar',
	reset: '🔧 Reset Google Account',
	mode: '🔧 Select mode (GPT-3.5 or GPT-4)',
}

bot.command(['help', 'start'], async (ctx) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()
	let personalData = [] as string[]

	if (userSettings.googleAccessToken) {
		personalData = [
			`👤 Logged in as ${userSettings.googleUserInfo?.name} (${userSettings.googleUserInfo?.email})`,
			`📅 Calendar: ${userSettings.calendarName}`,
			`📍 Location: ${userSettings.cityName}, ${userSettings.countyName}`,
			`⏰ Timezone: ${userSettings.timeZone}`,
			`🔧 Mode: ${userSettings.modeId === 1 ? 'Fast' : 'Slow'}`,
		]

		if (userSettings.botUsage) {
			personalData.push(`📊 Bot usage: ${userSettings.botUsage} times`)
		}

		if (userSettings.accessGranted) {
			personalData.push(`✅ Access granted`)
		} else {
			personalData.push(
				`❌ Access to bot not granted, contact @define to get access`,
			)
		}
	}

	const header = `[Developer Preview] This bot can help you to manage your calendar using text/voice messages`
	const commandstr = Object.entries(commands)
		.map(([command, description]) => `/${command} - ${description}`)
		.join('\n')

	await ctx.reply(`${header}\n\n${personalData.join('\n')}\n\n${commandstr}`)
})

bot.command('sure', async (ctx) => {
	const user = new User(ctx.from!)
	await user.set({
		accessGranted: true,
	})
	if (process.env.ADMIN_ID)
		await bot.api.sendMessage(
			process.env.ADMIN_ID,
			`User ${ctx.from!.id} (${ctx.from!.username}) granted access to bot`,
		)
	await ctx.reply(`Access granted, please use /help to see available commands`)
})

bot.command('reset', async (ctx) => {
	const user = new User(ctx.from!)
	await user.set({
		googleAccessToken: '',
		googleRefreshToken: '',
		googleExpiresAt: null,
		calendarId: 'primary',
		calendarName: 'Primary',
		googleUserInfo: {},
	})

	await ctx.reply('Google Account reseted, please login again using /login')
})

bot.command('mode', async (ctx) => {
	const buttonsForCallback = await getModeMenu(ctx)

	await ctx.reply(`Please select mode`, {
		reply_markup: {
			inline_keyboard: buttonsForCallback,
		},
	})
})

bot.command('calendars', async (ctx) => {
	const buttonsForCallback = await getCalendarMenu(ctx)
	if (buttonsForCallback.length === 0) {
		return ctx.reply(`Please login to your Google Account first -> /login`)
	}

	await ctx.reply(`Please select calendar`, {
		reply_markup: {
			inline_keyboard: buttonsForCallback,
		},
	})
})

bot.callbackQuery('decline', async (ctx) => {
	await ctx.editMessageText(`Ok, this event not be added to your calendar`, {
		reply_markup: {
			inline_keyboard: [],
		},
	})
	await redisClient.setex(`decline:${ctx.from.id}`, 60, 'decline')
})

bot.callbackQuery(/mode:(.+)/, async (ctx) => {
	const user = new User(ctx.from)
	const mode = Number(ctx.match[1])
	await user.set({
		modeId: Number(mode),
	})
	await ctx.editMessageText(`Please select mode`, {
		reply_markup: {
			inline_keyboard: await getModeMenu(ctx),
		},
	})
})

bot.callbackQuery(/cancel:(.+)/, async (ctx) => {
	const user = new User(ctx.from)
	const userSettings = await user.get()
	const eventId = ctx.match[1]
	try {
		const [_, accessToken] = await cancelGoogleEvent(
			userSettings.googleAccessToken!,
			userSettings.googleRefreshToken!,
			userSettings.calendarId!,
			eventId,
		)
		if (accessToken && accessToken !== userSettings.googleAccessToken) {
			await user.set({
				googleAccessToken: accessToken,
			})
			console.log(`Token refreshed for user ${ctx.from.id}`)
		}

		await ctx.editMessageText(`Event successfully canceled`, {
			reply_markup: {
				inline_keyboard: [],
			},
		})
	} catch (error) {
		console.log(error)
		return ctx.reply(`Problem with canceling event, please try again!`)
	}
})

bot.callbackQuery(/calendar:(.+)/, async (ctx) => {
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

	if (!targetCalendar) return ctx.reply(`Calendar not found`)

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
})

bot.command('login', async (ctx) => {
	const authUrl = googleLogin(ctx.from!.id)
	await ctx.reply(
		`Please login to your Google Account, if you want to manage your calendar (If you want to change account, please use /reset before)`,
		{
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: 'Login via Google',
							url: authUrl,
						},
					],
				],
			},
		},
	)
})

bot.on('message:location', async (ctx) => {
	const user = new User(ctx.from)
	try {
		const messageId = (await ctx.reply(`Processing location...`)).message_id
		const { latitude, longitude } = ctx.message.location
		// Convert location to city name, timezone
		const result = await fetch(
			`https://api.geoapify.com/v1/geocode/reverse?lat=${latitude}&lon=${longitude}&apiKey=${process.env.GEOAPIFY_API_KEY}`,
		)
		const geoData = (await result.json()) as GeoData
		const data = geoData.features[0].properties
		const {
			city,
			country_code,
			state,
			timezone: { name: timeZone },
		} = data
		await user.set({
			cityName: city,
			countyName: `${state} (${country_code})`,
			timeZone,
		})

		// Await ctx.reply(`Great @${ctx.from!.username}, your location is set to ${city}, ${state}`);
		await ctx.api.editMessageText(
			ctx.chat.id,
			messageId,
			`Great @${ctx.from.username}, your location is set to ${city}, ${state}`,
		)
		console.log(data)
	} catch (error) {
		console.log(error)
		await ctx.reply(`Problem with location, please try again!`)
	}
})

bot.on(['message:text', 'message:voice'], async (ctx) => {
	const user = new User(ctx.from)
	const userSettings = await user.get()
	// All answers with emoji
	if (!userSettings.timeZone) {
		return ctx.reply(
			'Oops! Please send your location first to set timezone, it really matters for calendar events',
		)
	}

	if (!userSettings.googleAccessToken) {
		return ctx.reply(
			`Woops! Please login to your Google Account first -> /login`,
		)
	}

	if (!userSettings.accessGranted) {
		return ctx.reply(
			'Access to bot not granted, contact @define to get access. This is a developer preview, so access is limited.',
		)
	}

	let messageText = String(ctx.message.text ?? '')
	/* If(messageText) {
		return ctx.reply(JSON.stringify(ctx.message, null, 2), {
			reply_to_message_id: ctx.message.message_id,
		});
	} */
	const userLang = ctx.from?.language_code ?? 'en'
	if (!messageText || messageText.length === 0) {
		try {
			const file = await ctx.getFile()
			const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
			const stream = got.stream(fileUrl) as unknown as ReadStream

			stream.path = 'voice.ogg'

			const response = await getOpenAiClient().createTranscription(
				stream as unknown as File,
				'whisper-1',
			)

			messageText = response.data.text
		} catch (error) {
			console.log(error)
			return ctx.reply(`Problem with voice recognition, please try again!`)
		}
	}

	const messageId = (
		await ctx.reply(
			`Processing started, it can take up to few minutes. Text: ${messageText}`,
		)
	).message_id

	try {
		const mode = userSettings.modeId ?? 1
		let result = await (mode === 1 ? runWay1 : runWay2)({
			chatId: String(ctx.chat.id),
			userSettings,
			messageText,
			userLang,
		})
		if (mode === 2 && typeof result === 'string') {
			await ctx.api.editMessageText(
				ctx.chat.id,
				messageId,
				`Deep diving into the text...`,
			)
			// Re run to extract data
			result = await runWay1(
				{
					chatId: String(ctx.chat.id),
					userSettings,
					messageText,
					userLang,
				},
				'gpt-4',
				result,
			)
		}

		await user.incrBotUsage()

		if (typeof result === 'string') {
			await ctx.api.editMessageText(ctx.chat.id, messageId, result)
		} else {
			// Add event to google calendar
			const event = result as CalendarEvent

			if (!event?.start?.dateTime || !event?.end?.dateTime) {
				return await ctx.api.editMessageText(
					ctx.chat.id,
					messageId,
					`Error: Event start or end time not set`,
				)
			}

			const previewString = buildPreviewString(event)

			await ctx.api.editMessageText(
				ctx.chat.id,
				messageId,
				`${previewString}\n\nEvent will be added to your calendar «${userSettings.calendarName}» in 10 seconds`,
				{
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: 'No, cancel',
									callback_data: `decline`,
								},
							],
						],
					},
				},
			)

			setTimeout(async () => {
				// Check redis for decline
				const decline = await redisClient.get(`decline:${ctx.from.id}`)
				if (decline) {
					await redisClient.del(`decline:${ctx.from.id}`)
					return
				}

				const [googleResult, token] = await addCalendarEvent(
					userSettings.googleAccessToken!,
					userSettings.googleRefreshToken!,
					userSettings.calendarId!,
					event,
				)
				if (token && token !== userSettings.googleAccessToken) {
					await user.set({
						googleAccessToken: token,
					})
				}

				await ctx.api.editMessageText(
					ctx.chat.id,
					messageId,
					`Event added to your calendar: ${userSettings.calendarName}`,
					{
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: 'Cancel this event',
										callback_data: `cancel:${googleResult.data.id}`,
									},
								],
							],
						},
					},
				)
			}, 10_000)
		}
	} catch (error: any) {
		await ctx.api.editMessageText(
			ctx.chat.id,
			messageId,
			`Error: ${error.message}`,
		)
		console.log(error)
	}
})

export default bot
