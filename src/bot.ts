/* eslint-disable unicorn/prefer-top-level-await */
/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import { Bot, session } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import { PubSub, type Topic } from '@google-cloud/pubsub'
import { RedisAdapter } from '@grammyjs/storage-redis'
import { cancelGoogleEvent } from './utils/google.js'
import User from './utils/user-manager.js'
import { type GeoData, type MyContext } from './types.js'
import redisClient from './utils/redis.js'
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
import {
	dataCommand,
	dataConversation,
	dataExitConversation,
	dataResetPrompt,
} from './commands/data.js'
import mainLogic from './logic.js'

let topic: Topic | undefined
if (process.env.NODE_ENV !== 'development') {
	const pubsub = new PubSub({
		projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
	})
	topic = pubsub.topic('openai-requests', {
		gaxOpts: {
			timeout: 3 * 60 * 1000,
			retry: null,
		},
	})
}

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
const bot = new Bot<MyContext>(process.env.BOT_TOKEN!)

const storage = new RedisAdapter({ instance: redisClient })

bot.use(
	session({
		initial: () => ({ userId: 1 }),
		storage,
	}),
)
bot.use(conversations())
bot.use(createConversation(dataConversation, 'data-conversation'))

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

		if (
			userSettings.lastActivityAt &&
			Date.now() - userSettings.lastActivityAt > 1000 * 60
		) {
			await user.set({
				lastActivityAt: Date.now(),
			})
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

bot.command(['help', 'start'], helpCommand)
bot.command('gift', giftCommand)
bot.command('subscribe', subscribeCommand)
bot.command('mode', modeCommand)
bot.command('reset', resetCommand)
bot.command('calendars', calendarsCommand)
bot.command('login', loginCommand)
bot.command('data', dataCommand)
bot.callbackQuery(/calendar:(.+)/, calendarsCallback)
bot.callbackQuery(/mode:(.+)/, modeCallback)
bot.callbackQuery(/plan:(.+)/, subscribeCallback)
bot.command('events', eventsCommand)
bot.callbackQuery(/cancelPayment/, cancelSubscriptionCommand)
bot.callbackQuery(/exitConversation/, dataExitConversation)
bot.callbackQuery(/dataResetPrompt/, dataResetPrompt)

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
	} catch (error) {
		console.log(error)
		await ctx.reply(`Problem with location, please try again later!`)
	}
})

bot.on(['message:text', 'message:voice'], async (ctx) => {
	/* Future if (process.env.NODE_ENV !== 'development' && topic) {
		const messageId = await topic.publishMessage({
			json: {
				update: ctx.update,
			},
		})
		console.log(`Message ${messageId} published.`)
		return
	} */

	await mainLogic(ctx)
})

export default bot
