/* eslint-disable @typescript-eslint/naming-convention */
import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import { googleLogin } from '../utils/google.js'

const loginCommand = async (ctx: CommandContext<MyContext>) => {
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
}

export default loginCommand
