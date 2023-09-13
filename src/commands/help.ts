import { type CommandContext } from 'grammy'
import { type MyContext } from '../types.js'
import User from '../utils/user-manager.js'
import { commands } from '../constants.js'

const helpCommand = async (ctx: CommandContext<MyContext>) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()

	let personalData = [] as string[]

	if (userSettings.googleAccessToken) {
		let modelName = 'GPT-4 + GPT-3.5'
		if (userSettings.modeId === 1) {
			modelName = userSettings.planId > 1 ? 'GPT-4' : 'GPT-3.5'
		}

		personalData = [
			`👤 Logged in as ${userSettings.googleUserInfo?.name} (${userSettings.googleUserInfo?.email})`,
			`📅 Calendar: ${userSettings.calendarName}`,
			`📍 Location: ${userSettings.cityName}, ${userSettings.countyName}`,
			`⏰ Timezone: ${userSettings.timeZone}`,
			`🔧 Speed: ${
				userSettings.modeId! === 1 ? 'Fast+Simple' : 'Slow+Powerful'
			}`,
			`🤖 Model: ${modelName}`,
		]

		const userPlan = user.getUserPlan()
		if (userPlan) {
			const resetInDays = Math.ceil(
				(userSettings.subscriptionExpiresAt - Date.now()) / 1000 / 60 / 60 / 24,
			)
			personalData.push(
				`📊 Plan: ${userPlan.name}, usage ${userSettings.botUsage}/${userPlan.messagesPerMonth}. Reset in ${resetInDays} days`,
			)
		}
	}

	const header = `This bot can help you to manage your calendar using text/voice messages`
	const commandstr = Object.entries(commands)
		.map(([command, description]) => `/${command} - ${description}`)
		.join('\n')

	await ctx.reply(`${header}\n\n${personalData.join('\n')}\n\n${commandstr}`)
}

export default helpCommand
