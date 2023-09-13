/* eslint-disable @typescript-eslint/naming-convention */
import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import { googleLogin } from '../utils/google.js'

const loginCommand = async (ctx: CommandContext<MyContext>) => {
	const authUrl = googleLogin(ctx.from!.id)
	await ctx.reply(
		`🔑 Please login to your Google Account to start using bot.
		
If you want to change account in future, please use /reset before.

App will request access to your Google Calendar and Contacts.
If you don't want to give access to your contacts, just uncheck "Contacts" checkbox on the login screen.
Read how we work with your data: /privacy

⚠️ Don't forget to set checkboxes "Calendar" and "Contacts" (only if you want) on the login screen!
Revoke access to your Google Account (Our application listed here as P2P): https://myaccount.google.com/permissions

⚠️⚠️ WARNING: Our app still not verified by Google, so you will see a warning screen. Just click "Advanced" and "Go to us-west2-hormold.cloudfunctions.net (unsafe)" ⚠️⚠️`,
		{
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: '🔐 Login via Google',
							url: authUrl,
						},
					],
				],
			},
		},
	)
}

export default loginCommand
