import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import User from '../utils/user-manager.js'

const resetCommand = async (ctx: CommandContext<MyContext>) => {
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
}

export default resetCommand
