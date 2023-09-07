/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import { type CallbackQueryContext, type CommandContext } from 'grammy'
import User from '../utils/user-manager.js'
import { getPlansMenu } from '../utils/functions.js'
import { userPlans } from '../constants.js'
import { type MyContext } from '../types.js'
import {
	cancelNextPayment,
	createCustomerId,
	generateStripeLink,
} from '../utils/paid.js'

const isDev = process.env.NODE_ENV === 'development'

const subscribeCommand = async (ctx: CommandContext<MyContext>) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()
	const userPlan = user.getUserPlan()
	const currentPlan = `${userPlan?.name} (${userSettings.botUsage}/${userPlan?.messagesPerMonth})	message per 30 days`
	const resetInDays = Math.ceil(
		(userSettings.subscriptionExpiresAt - Date.now()) / 1000 / 60 / 60 / 24,
	)
	const autoRenewEnabled =
		userPlan.id > 1 && userSettings.autoRenewEnabled
			? '✅ Enabled'
			: '❌ Disabled'

	const rows = [
		`Your current plan: ${currentPlan}`,
		`Next reset/payment: ${resetInDays} days`,
		`Auto renew: ${autoRenewEnabled}`,
		'',
		'',
	]

	for (const plan of userPlans) {
		rows.push(
			`📊 ${plan.name} (${plan.price} USD)`,
			`📊 ${plan.messagesPerMonth} messages per 30 days`,
			`📊 ${plan.fastMode ? '✅ GPT-4 Included' : '❌ No GPT-4 Mode'}`,
			`📊 ${plan.voiceMessages ? '✅ Voice messages' : '❌ No voice messages'}`,
			'',
		)
	}

	await ctx.reply(`${rows.join('\n')}\n\nPlease select plan`, {
		reply_markup: {
			inline_keyboard: getPlansMenu(userPlan, userSettings),
		},
	})
}

const subscribeCallback = async (ctx: CallbackQueryContext<MyContext>) => {
	const user = new User(ctx.from)
	const planId = Number(ctx.match[1])
	const userSettings = await user.get()

	if (userSettings.planId === planId) {
		return ctx.editMessageText(`You already have this plan`)
	}

	const plan = userPlans.find((plan) => plan.id === planId)
	if (!plan) {
		return ctx.editMessageText(`Plan not found`)
	}

	if (plan.id < userSettings.planId) {
		return ctx.editMessageText(
			`You can't downgrade your plan, it be downgraded automatically after current plan expires`,
		)
	}

	let customerId

	if (isDev) {
		customerId = userSettings.devStripeCustomerId
		if (!customerId) {
			customerId = await createCustomerId(
				ctx.from.id,
				ctx.from.username!,
				ctx.from.first_name,
				ctx.from.last_name!,
			)
			await user.set({
				devStripeCustomerId: customerId,
			})
		}
	} else {
		customerId = userSettings.stripeCustomerId
		if (!customerId) {
			customerId = await createCustomerId(
				ctx.from.id,
				ctx.from.username!,
				ctx.from.first_name,
				ctx.from.last_name!,
			)
			await user.set({
				stripeCustomerId: customerId,
			})
		}
	}

	const stripeLink = await generateStripeLink(
		ctx.from.id,
		String(customerId),
		planId,
	)
	if (!stripeLink) {
		return ctx.editMessageText(
			`Sorry, something went wrong, please try again later`,
		)
	}

	await ctx.editMessageText(`Please pay ${plan.price} USD to continue`, {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Pay with Stripe',
						url: stripeLink,
					},
				],
			],
		},
	})
}

const cancelSubscriptionCommand = async (
	ctx: CallbackQueryContext<MyContext>,
) => {
	const user = new User(ctx.from)
	const userSettings = await user.get()
	await ctx.editMessageText(
		userSettings.autoRenewEnabled
			? 'Auto renew disabled'
			: 'Auto renew enabled',
	)
	await user.set({
		autoRenewEnabled: !userSettings.autoRenewEnabled,
	})
	await cancelNextPayment(ctx.from.id)
}

export { subscribeCommand, subscribeCallback, cancelSubscriptionCommand }
