/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable complexity */
/* eslint-disable unicorn/prefer-top-level-await */
/* eslint-disable @typescript-eslint/naming-convention */
import type { ReadStream } from 'node:fs'
import process from 'node:process'
import { Bot } from 'grammy'
import got from 'got'
import { addCalendarEvent, cancelGoogleEvent } from './utils/google.js'
import runWay2 from './llm/way2.js'
import runWay1 from './llm/way1.js'
import getOpenAiClient from './utils/openai.js'
import User from './utils/user-manager.js'
import { buildPreviewString, md5 } from './utils/functions.js'
import { type GeoData, type CalendarEvent, type MyContext } from './types.js'
import redisClient from './utils/redis.js'
import { simpleCheckIsEvent } from './llm/simple-check.js'
import {
	subscribeCommand,
	subscribeCallback,
	cancelSubscriptionCommand,
} from './commands/subscribe.js'
import giftCommand from './commands/gift.js'
import { modeCommand, modeCallback } from './commands/mode.js'
import resetCommand from './commands/reset.js'
import { calendarsCallback, calendarsCommand } from './commands/calendars.js'
import loginCommand from './commands/login.js'
import eventsCommand from './commands/events.js'
import helpCommand from './commands/help.js'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!)

bot.use(async (ctx, next) => {
	if (ctx.chat?.type === 'private' && ctx.from) {
		const user = new User(ctx.from)
		const userSettings = await user.get()
		const plan = user.getUserPlan()

		if (plan && userSettings.subscriptionExpiresAt < Date.now()) {
			await user.set({
				planId: 1,
				subscriptionExpiresAt: Date.now() + plan.period,
				subscriptionStartedAt: Date.now(),
			})
			await user.resetBotUsage()
		}

		await user.set({
			lastActivityAt: Date.now(),
		})

		await ctx.replyWithChatAction('typing')
	}

	await next()
})

bot.catch(async (error) => {
	if (process.env.ADMIN_ID) {
		await bot.api.sendMessage(
			process.env.ADMIN_ID,
			`Global error: ${error.message}`,
		)
	}

	console.log(`Error: ${error.message}`)
})

bot.command(['help', 'start'], helpCommand)
bot.command('gift', giftCommand)
bot.command('subscribe', subscribeCommand)
bot.command('mode', modeCommand)
bot.command('reset', resetCommand)
bot.command('calendars', calendarsCommand)
bot.command('login', loginCommand)
bot.callbackQuery(/calendar:(.+)/, calendarsCallback)
bot.callbackQuery(/mode:(.+)/, modeCallback)
bot.callbackQuery(/plan:(.+)/, subscribeCallback)
bot.command('events', eventsCommand)
bot.callbackQuery(/cancelPayment/, cancelSubscriptionCommand)

bot.callbackQuery('decline', async (ctx) => {
	await ctx.editMessageText(`Ok, this event not be added to your calendar`, {
		reply_markup: {
			inline_keyboard: [],
		},
	})
	await redisClient.setex(`decline:${ctx.from.id}`, 60, 'decline')
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
		await ctx.reply(`Problem with canceling event, please try again!`)
	}
})

bot.on('message:location', async (ctx) => {
	const user = new User(ctx.from)
	try {
		const message = await ctx.reply(`Processing location...`)
		const messageId = message.message_id
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
		await ctx.reply(`Problem with location, please try again later!`)
	}
})

bot.on(['message:text', 'message:voice'], async (ctx) => {
	const user = new User(ctx.from)
	const userSettings = await user.checkGoogleTokenAndGet()
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

	const plan = user.getUserPlan()

	if (userSettings.botUsage >= plan.messagesPerMonth) {
		return ctx.reply(
			`Sorry, you reached your monthly limit of ${user.getUserPlan()
				?.messagesPerMonth} messages. Please upgrade your plan to continue using bot: /subscribe`,
		)
	}

	if (!plan?.fastMode && userSettings.modeId === 2) {
		// Failsafe
		return ctx.reply(
			`Sorry, this feature is available only for Ultra users, please use /mode to switch to slow mode`,
		)
	}

	let messageText = String(ctx.message.text ?? '')
	/* If(messageText) {
		return ctx.reply(JSON.stringify(ctx.message, null, 2), {
			reply_to_message_id: ctx.message.message_id,
		});
	} */
	const userLang = ctx.from?.language_code ?? 'en'
	if ((!messageText || messageText.length === 0) && ctx.message.voice) {
		if (!plan?.voiceMessages) {
			return ctx.reply(
				`Sorry, voice messages not allowed for your plan, please upgrade your plan to continue using bot: /subscribe`,
			)
		}

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

	if (!messageText) {
		return ctx.reply(`Message is empty, please try again!`)
	}

	// Check is message is exsist in redis
	const redisKey = `message:${ctx.chat.id}:${md5(String(messageText))}`
	const redisResult = await redisClient.get(redisKey)
	if (redisResult) {
		return ctx.reply(
			`Maybe it's a duplicate of this message you sent before or just telegram bug, please try again!`,
		)
	}

	if (!(await simpleCheckIsEvent(messageText))) {
		return ctx.reply(
			`Sorry, this message doesn't look like event, please try again!`,
		)
	}

	await redisClient.setex(redisKey, 60 * 5, '1') // 5 minutes cache

	const message = await ctx.reply(
		`Processing started, it can take up to few minutes.\nText: ${messageText}`,
	)
	const messageId = message.message_id

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
				await ctx.api.editMessageText(
					ctx.chat.id,
					messageId,
					`Error: Event start or end time not set`,
				)
				return
			}

			const previewString = buildPreviewString(event, userSettings.timeZone)

			await ctx.api.editMessageText(
				ctx.chat.id,
				messageId,
				`${previewString}\n\nEvent will be added to your calendar «${userSettings.calendarName}» in 15 seconds`,
				{
					reply_markup: {
						inline_keyboard: [
							[
								{
									text: 'Decline',
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

				const [eventId, token] = await addCalendarEvent(
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
					`Great news! Event added to your calendar: «${userSettings.calendarName}»\n${previewString}`,
					{
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: 'Cancel this event',
										callback_data: `cancel:${eventId.toString()}`,
									},
								],
							],
						},
					},
				)
			}, 15_000)
		}
	} catch (error: any) {
		await ctx.api.editMessageText(
			ctx.chat.id,
			messageId,
			`Sorry, something went wrong! Contact @define to get help`,
		)

		if (process.env.ADMIN_ID) {
			await bot.api.sendMessage(process.env.ADMIN_ID, `Error: ${error.message}`)
		}

		console.log(`Error: ${error.message}`)
	}
})

export default bot
