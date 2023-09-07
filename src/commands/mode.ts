/* eslint-disable @typescript-eslint/naming-convention */
import { type CallbackQueryContext, type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import { getModeMenu } from '../utils/functions.js'
import User from '../utils/user-manager.js'

const modeText = `Please select bot mode\nSometimes bot can do not what you expect, you should describe your event more precisely.\n
Talk to bot like to human, for example: "Remind me about pet fair near me this weekend" (Slow, powerful mode)\n
Or like this: "Remind me to buy milk tomorrow at 5pm" (Fast, simple mode)`

const modeCommand = async (ctx: CommandContext<MyContext>) => {
	const buttonsForCallback = await getModeMenu(ctx)

	await ctx.reply(modeText, {
		reply_markup: {
			inline_keyboard: buttonsForCallback,
		},
	})
}

const modeCallback = async (ctx: CallbackQueryContext<MyContext>) => {
	const user = new User(ctx.from)
	await user.get()
	const mode = Number(ctx.match[1])
	const userPlan = user.getUserPlan()
	if (!userPlan.fastMode && mode === 2) {
		return ctx.reply(`Sorry, this feature is available only for Ultra users`)
	}

	await user.set({
		modeId: Number(mode),
	})

	await ctx.editMessageText(modeText, {
		reply_markup: {
			inline_keyboard: await getModeMenu(ctx),
		},
	})
}

export { modeCallback, modeCommand }
