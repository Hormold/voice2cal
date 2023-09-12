/* eslint-disable @typescript-eslint/naming-convention */
import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import { googleLogin } from '../utils/google.js'

const loginCommand = async (ctx: CommandContext<MyContext>) => {
	const authUrl = googleLogin(ctx.from!.id)
	await ctx.reply(
		`🔑🔑 Please login to your Google Account, if you want to manage your calendar 🔑🔑
		
If you want to change account, please use /reset before.

App will request access to your Google Calendar and Contacts. If you don't want to give access to your contacts, just uncheck "Contacts" checkbox on the login screen.
How we use Google Contacts API: we use them to autocomplete names of your contacts when you create new event if you want to invite someone, we don't store them anywhere!
How we use Google Calendar API: we use it to create new events, and to show you upcoming events. We don't store any data from your calendar anywhere!

We store your Google Access Token in our database, but we don't store your private Google Contacts and Calendar data anywhere (We store only your selected Calendar ID and Name actually)!

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
