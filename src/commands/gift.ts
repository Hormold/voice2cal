import process from 'node:process'
import { type CommandContext } from 'grammy'
import User from '../utils/user-manager.js'
import { userPlans } from '../constants.js'
import { type MyContext } from '../types.js'

const giftCommand = async (ctx: CommandContext<MyContext>) => {
	if (ctx.from?.id !== Number(process.env.ADMIN_ID)) {
		return ctx.reply(`Sorry, this command only for admin`)
	}

	const [_, userId, planId] = ctx.message!.text.split(' ')
	const user = new User({ id: Number(userId) })
	await user.get()
	const plan = userPlans.find((plan) => plan.id === Number(planId))
	if (!plan) {
		return ctx.reply(`Plan not found`)
	}

	await user.set({
		planId: plan.id,
		subscriptionExpiresAt: Date.now() + plan.period,
		subscriptionStartedAt: Date.now(),
	})

	await ctx.reply(`Plan #${plan.id} activated for user ${userId}`)
}

export default giftCommand
