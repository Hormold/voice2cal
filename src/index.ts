import process from 'node:process'
import { Buffer } from 'node:buffer'
import express from 'express'
import functions from '@google-cloud/functions-framework'
import { webhookCallback } from 'grammy'
import { type PubSubEvent, type Payload } from './types.js'
import {
	getAccessToken,
	getGoogleId,
	checkGoogleAccess,
} from './utils/google.js'
import User from './utils/user-manager.js'
import bot from './bot.js'
import { processStripeEvent } from './utils/paid.js'

const app = express()

app.use(
	express.json({
		verify(
			request: typeof express.request & { rawBody: Buffer },
			response,
			buf,
		) {
			request.rawBody = buf
		},
	}),
)
app.use(express.urlencoded({ extended: true }))

app.get('/google/callback', async (request, response) => {
	try {
		const { code, state } = request.query
		const userId = JSON.parse(state as string).userId as number

		const user = new User({ id: userId })
		const accessToken = await getAccessToken(code as string)
		if (!accessToken.access_token) throw new Error('Invalid access token')
		// Get user id using API

		const userInfo = await getGoogleId(accessToken.access_token)
		if (!userInfo.id) throw new Error('Invalid user id')

		const settings = await user.get()

		if (
			settings.googleUserInfo?.id &&
			userInfo.id !== settings.googleUserInfo?.id
		)
			throw new Error(
				'Reset Google Account in telegram bot using command /reset',
			)

		await user.set({
			googleUserInfo: userInfo,
			googleAccessToken: accessToken.access_token,
			googleRefreshToken: accessToken.refresh_token!,
			googleExpiresAt: accessToken.expiry_date,
		})

		response.redirect(`https://t.me/${process.env.BOT_NAME}`)

		const isHaveAccess = await Promise.all([
			await checkGoogleAccess(accessToken.access_token, 'calendar'),
			await checkGoogleAccess(accessToken.access_token, 'contacts'),
		])

		if (isHaveAccess.some((access) => !access)) {
			await bot.api.sendMessage(
				userId,
				`👋🏼 You are logged in as ${userInfo.name}, but you need to give access to Google Calendar and Contacts to use all features of this bot.`,
			)
		} else {
			await bot.api.sendMessage(
				userId,
				`👋🏼 Successful! You are logged in as ${userInfo.name} (${userInfo.email})`,
			)
		}

		await bot.api.sendMessage(
			userId,
			`📍 Now, please send your location to set timezone & location`,
		)
	} catch (error: any) {
		response.send(`Error: ${error.message}`)
	}
})

app.all(
	'/bot',
	webhookCallback(bot, 'express', {
		secretToken: process.env.SECRET_TOKEN!,
		timeoutMilliseconds: 120_000, // I need it because I'm using OpenAI API and long chains of tasks
	}),
)

app.all('/stripe/callback', processStripeEvent)
app.all('/stripe', processStripeEvent)
app.get('/stripe/return/:status', async (request, response) => {
	const { userId } = request.query as { userId: string }
	await bot.api.sendMessage(
		userId,
		`👋🏼 Your subscription is updated! Checkout current status using /subscribe command`,
	)

	response.redirect(`https://t.me/${process.env.BOT_NAME}`)
})

functions.http('handleTelegramWebhook', app)

functions.cloudEvent<PubSubEvent>('handleOpenAIRequest', async (event) => {
	process.env.IN_QUEUE = 'true' // Because i don't want created separated .env yaml file for this
	if (event?.data?.message) {
		const json = Buffer.from(
			String(event.data.message.data),
			'base64',
		).toString()

		console.info(`Received event: ${json}`, process.env)

		if (!json) {
			console.error('Invalid JSON')
			return
		}

		try {
			const data = JSON.parse(json) as Payload
			await bot.handleUpdate(data.update)
		} catch (error: unknown) {
			console.error(`json parse/bot error`, error)
		}
	}
})

export default app
