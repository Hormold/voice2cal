/* eslint-disable @typescript-eslint/naming-convention */
import { type CommandContext, type CallbackQueryContext } from 'grammy'
import { type Conversation } from '@grammyjs/conversations'
import { type MyContext } from '../types.js'
import User from '../utils/user-manager.js'

type MyConversation = Conversation<MyContext>

const dataCommand = async (ctx: CommandContext<MyContext>) => {
	await ctx.conversation.enter('data-conversation')
}

const dataExitConversation = async (ctx: CallbackQueryContext<MyContext>) => {
	await ctx.conversation.exit()
	await ctx.answerCallbackQuery('Ok, see you later')
}

const dataResetPrompt = async (ctx: CallbackQueryContext<MyContext>) => {
	const user = new User(ctx.from)
	await user.set({ customInstructions: '' })
	await ctx.answerCallbackQuery('Ok, your instructions has been reset')
}

async function dataConversation(conversation: MyConversation, ctx: MyContext) {
	const user = new User(ctx.from!)
	const userSettings = await user.get()

	if (userSettings.customInstructions) {
		await ctx.reply(
			`To edit current instruction, copy it, edit and send it back to me.\n\nYour current instructions:\n ${userSettings.customInstructions}`,
			{
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
			},
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
			`Ok, i will remember that.\n\nYour instructions:\n ${message.text}`,
			{
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
			},
		)
	}
}

export { dataCommand, dataConversation, dataExitConversation, dataResetPrompt }
