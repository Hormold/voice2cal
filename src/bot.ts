/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/prefer-top-level-await */
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
	getPlansMenu,
} from './utils/functions.js'
import { type GeoData, type CalendarEvent, type MyContext } from './types.js'
import redisClient from './utils/redis.js'
import {
	generateStripeLink,
	cancelNextPayment,
	createCustomerId,
} from './utils/paid.js'
import { userPlans } from './constants.js'

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!)

const commands = {
	login: '👤 Login to Google Account',
	calendars: '📅 Select calendar',
	reset: '🔧 Reset Google Account',
	mode: '🔧 Select mode (GPT-3.5 or GPT-4)',
	subscribe: '🔧 Subscribe to PRO plans',
}

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
			`🔧 Mode: ${userSettings.modeId === 1 ? 'GPT-3' : 'GPT-4'}`,
		]

		const userPlan = user.getUserPlan()
		if (userPlan) {
			const resetInDays = Math.ceil(
				(userSettings.subscriptionExpiresAt - Date.now()) / 1000 / 60 / 60 / 24,
			)
			personalData.push(
				`📊 Plan: ${userPlan.name}, usage ${userSettings.botUsage}/${userPlan.messagesPerMonth}. Reset in ${resetInDays} days`,
			)
		}
	}

	const header = `[Developer Preview] This bot can help you to manage your calendar using text/voice messages`
	const commandstr = Object.entries(commands)
		.map(([command, description]) => `/${command} - ${description}`)
		.join('\n')

	await ctx.reply(`${header}\n\n${personalData.join('\n')}\n\n${commandstr}`)
})

bot.command('gift', async (ctx) => {
	if (ctx.from?.id !== Number(process.env.ADMIN_ID)) {
		await bot.api.sendMessage(
			Number(process.env.ADMIN_ID),
			`User ${ctx.from?.id} trying to use gift command`,
		)
		return ctx.reply(`Sorry, this command only for admin`)
	}

	const [_, userId, planId] = ctx.message!.text.split(' ')
	const user = new User({ id: Number(userId) })
	await user.get()
	const plan = userPlans.find((plan) => plan.id === Number(planId))
	if (!plan) {
		return ctx.reply(`Plan not found`)
	}

	await user.set({
		planId: plan.id,
		subscriptionExpiresAt: Date.now() + plan.period,
		subscriptionStartedAt: Date.now(),
	})

	await ctx.reply(`Plan #${plan.id} activated for user ${userId}`)
})

bot.command('subscribe', async (ctx) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()
	const userPlan = user.getUserPlan()
	const currentPlan = `${userPlan?.name} (${userSettings.botUsage}/${userPlan?.messagesPerMonth})	message per 30 days`
	const resetInDays = Math.ceil(
		(userSettings.subscriptionExpiresAt - Date.now()) / 1000 / 60 / 60 / 24,
	)
	const autoRenewEnabled =
		userPlan.id > 1 && userSettings.autoRenewEnabled
			? '✅ Enabled'
			: '❌ Disabled'

	const rows = [
		`Your current plan: ${currentPlan}`,
		`Next reset/payment: ${resetInDays} days`,
		`Auto renew: ${autoRenewEnabled}`,
		'',
		'',
	]

	for (const plan of userPlans) {
		rows.push(
			`📊 ${plan.name} (${plan.price} USD)`,
			`📊 ${plan.messagesPerMonth} messages per 30 days`,
			`📊 ${plan.fastMode ? '✅ GPT-4 Included' : '❌ No GPT-4 Mode'}`,
			`📊 ${plan.voiceMessages ? '✅ Voice messages' : '❌ No voice messages'}`,
			'',
		)
	}

	await ctx.reply(`${rows.join('\n')}\n\nPlease select plan`, {
		reply_markup: {
			inline_keyboard: getPlansMenu(userPlan, userSettings),
		},
	})
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

bot.callbackQuery(/cancelPayment/, async (ctx) => {
	const user = new User(ctx.from)
	const userSettings = await user.get()
	await ctx.editMessageText(
		userSettings.autoRenewEnabled
			? 'Auto renew disabled'
			: 'Auto renew enabled',
	)
	await user.set({
		autoRenewEnabled: !userSettings.autoRenewEnabled,
	})
	await cancelNextPayment(ctx.from.id)
})

bot.callbackQuery(/plan:(.+)/, async (ctx) => {
	const user = new User(ctx.from)
	const planId = Number(ctx.match[1])
	const userSettings = await user.get()

	if (userSettings.planId === planId) {
		return ctx.editMessageText(`You already have this plan`)
	}

	const plan = userPlans.find((plan) => plan.id === planId)
	if (!plan) {
		return ctx.editMessageText(`Plan not found`)
	}

	if (plan.id < userSettings.planId) {
		return ctx.editMessageText(
			`You can't downgrade your plan, it be downgraded automatically after current plan expires`,
		)
	}

	let customerId = userSettings.stripeCustomerId
	if (!customerId) {
		customerId = await createCustomerId(
			ctx.from.id,
			ctx.from.username!,
			ctx.from.first_name,
			ctx.from.last_name!,
		)
		await user.set({
			stripeCustomerId: customerId,
		})
	}

	const stripeLink = await generateStripeLink(ctx.from.id, customerId, planId)
	if (!stripeLink) {
		return ctx.editMessageText(
			`Sorry, something went wrong, please try again later`,
		)
	}

	await ctx.editMessageText(`Please pay ${plan.price} USD to continue`, {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Pay with Stripe',
						url: stripeLink,
					},
				],
			],
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
	await user.get()
	const mode = Number(ctx.match[1])
	const userPlan = user.getUserPlan()
	if (userPlan.fastMode && mode === 2) {
		return ctx.reply(`Sorry, this feature is available only for Ultra users`)
	}

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
		await ctx.reply(`Problem with canceling event, please try again!`)
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
		await ctx.reply(`Problem with location, please try again later!`)
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
				`Sorry, voice messages not allowed for your plan, please upgrade your plan to continue using bot`,
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

	const messageId = (
		await ctx.reply(
			`Processing started, it can take up to few minutes.\nText: ${messageText}`,
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
				await ctx.api.editMessageText(
					ctx.chat.id,
					messageId,
					`Error: Event start or end time not set`,
				)
				return
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
					`Great news! Event added to your calendar: «${userSettings.calendarName}»\n${previewString}`,
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
			`Sorry, something went wrong! Contact @define to get help`,
		)

		if (process.env.ADMIN_ID) {
			await bot.api.sendMessage(process.env.ADMIN_ID, `Error: ${error.message}`)
		}

		console.log(`Error: ${error.message}`)
	}
})

export default bot
