/* eslint-disable @typescript-eslint/naming-convention */
import { type CommandContext, type CallbackQueryContext } from 'grammy'
import { type Conversation } from '@grammyjs/conversations'
import { type MyContext } from '../types.js'
import User from '../utils/user-manager.js'

type MyConversation = Conversation<MyContext>

const MainButtons = {
	reply_markup: {
		inline_keyboard: [
			[
				{
					text: 'Clear',
					callback_data: 'dataResetPrompt',
				},
				{
					text: 'Exit editor',
					callback_data: 'exitConversation',
				},
			],
		],
	},
}

const dataCommand = async (ctx: CommandContext<MyContext>) => {
	await ctx.conversation.enter('data-conversation')
}

const dataExitConversation = async (ctx: CallbackQueryContext<MyContext>) => {
	await ctx.conversation.exit()
	await ctx.answerCallbackQuery('Ok, see you later')
	await ctx.editMessageText('Editor closed')
}

const dataResetPrompt = async (ctx: CallbackQueryContext<MyContext>) => {
	const user = new User(ctx.from)
	await user.set({ customInstructions: '' })
	await ctx.editMessageText(
		`Your instructions has been reset, now you can set new ones in your next message`,
		MainButtons,
	)
}

async function dataConversation(conversation: MyConversation, ctx: MyContext) {
	const user = new User(ctx.from!)
	const userSettings = await user.get()

	if (userSettings.customInstructions) {
		await ctx.reply(
			`To edit current instruction, copy it, edit and send it back to me.\n\nYour current instructions:\n${userSettings.customInstructions}`,
			MainButtons,
		)
	} else {
		await ctx.reply(
			`You can set your instructions here to learn AI better undestrand you.\n\nFor example: When i mention my wife, lookup for Christina in my contacts and add her to the event.\nOr: My job located in Long Beach and it starts at 9am, so respect that.\n\nJust send me your instructions and i will remember them.\n\n`,
			{
				reply_markup: {
					inline_keyboard: [
						[
							{
								text: 'Exit editor',
								callback_data: 'exitConversation',
							},
						],
					],
				},
			},
		)
	}

	const { message } = await conversation.wait()

	if (message?.text) {
		await user.set({ customInstructions: message.text })
		await ctx.reply(
			`Ok, i will remember that.\n\nYour instructions:\n${message.text}`,
		)
	}
}

export { dataCommand, dataConversation, dataExitConversation, dataResetPrompt }
