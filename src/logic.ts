/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable complexity */
import type { ReadStream } from 'node:fs'
import got from 'got'
import { type MyContext, type CalendarEvent } from './types.js'
import { simpleCheckIsEvent } from './llm/simple-check.js'
import { addCalendarEvent } from './utils/google.js'
import runWay2 from './llm/way2.js'
import runWay1 from './llm/way1.js'
import getOpenAiClient from './utils/openai.js'
import User from './utils/user-manager.js'
import { buildPreviewString, md5 } from './utils/functions.js'
import redisClient from './utils/redis.js'
import { env } from './constants.js'

const mainLogic = async (ctx: MyContext) => {
	const user = new User(ctx.from!)
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

	if (!ctx.message || !ctx.chat) {
		return
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
			const fileUrl = `https://api.telegram.org/file/bot${env.botKey}/${file.file_path}`
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
		return
	}

	if (env.nodeEnv === 'production' && !(await simpleCheckIsEvent(messageText)))
		return ctx.reply(
			`Sorry, this message doesn't look like event, please try again!`,
		)

	await redisClient.setex(redisKey, 60 * 5, 'ok') // 5 minutes cache

	const message = await ctx.reply(
		`Processing started, but it can take up to few minutes.\nText: ${messageText}`,
	)
	const messageId = message.message_id

	const modelName = userSettings.modeId === 2 ? 'gpt-4' : 'gpt-3.5-turbo-0613'

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
				modelName,
				result,
			)
		}

		await user.incrBotUsage(modelName)

		if (typeof result === 'string') {
			await ctx.api.editMessageText(ctx.chat.id, messageId, result)
		} else {
			// Add event to google calendar
			const event = result as CalendarEvent

			if (!event?.start?.dateTime || !event?.end?.dateTime) {
				await ctx.api.editMessageText(
					ctx.chat.id,
					messageId,
					`Error: Event start or end time not set. Looks like GPT model failed to extract data from your message. Please try again!`,
				)
				return
			}

			const previewString = buildPreviewString(event, userSettings.timeZone)

			await ctx.api.editMessageText(
				ctx.chat.id,
				messageId,
				`${previewString}\n\nThis event will be added to your calendar «${userSettings.calendarName}» in 15 seconds`,
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
				if (!ctx.from || !ctx.chat) {
					return
				}

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
					`Good news, everyone! Event has been added to your calendar «${userSettings.calendarName}».\n\n${previewString}`,
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

		if (env.adminId) {
			await ctx.api.sendMessage(
				Number(env.adminId),
				`Request from chat #${ctx.chat.id} | error: ${error.message}`,
			)
		}

		console.log(`Error: ${error.message}`, error)
	}
}

export default mainLogic
