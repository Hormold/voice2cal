/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import type express from 'express'
import { Bot } from 'grammy'
import { type Subscription, type Invoice } from '../types.js'
import { userPlans } from '../constants.js'
import stripe from './stripe.js'
import User from './user-manager.js'

const bot = new Bot(process.env.BOT_TOKEN!)
const userManager = new User({ id: 0 })

export const createCustomerId = async (
	userId: number,
	username: string,
	firstName: string,
	lastName: string,
) => {
	const customer = await stripe.customers.create({
		name: `${firstName} ${lastName}`,
		metadata: {
			userId: userId.toString(),
			bot: 'v2c',
			username,
		},
	})

	return customer.id
}

export const cancelNextPayment = async (userId: number) => {
	const user = await userManager.get(userId)
	if (!user.stripeSubscriptionId) return

	await stripe.subscriptions.update(String(user.stripeSubscriptionId), {
		cancel_at_period_end: !user.autoRenewEnabled,
	})
}

export const generateStripeLink = async (
	userId: number,
	customerId: string,
	planId: number,
) => {
	const plan = userPlans.find((plan) => plan.id === planId)!
	if (!plan.stripePlanId) throw new Error('Stripe plan not found')

	const session = await stripe.checkout.sessions.create({
		mode: 'subscription',
		payment_method_types: ['card'],
		customer: customerId,
		line_items: [
			{
				price: String(plan.stripePlanId),
				quantity: 1,
			},
		],
		success_url: `${process.env.BASE_URL}/stripe/return/success?userId=${userId}&planId=${planId}`,
		cancel_url: `${process.env.BASE_URL}/stripe/return/cancel?userId=${userId}&planId=${planId}`,
		metadata: {
			userId: userId.toString(),
			planId: planId.toString(),
		},
	})

	return session.url
}

export const processStripeEvent = async (
	request: typeof express.request & {
		rawBody?: string
	},
	response: typeof express.response,
) => {
	let event
	const signature = request.headers['stripe-signature']

	if (!signature) {
		return response.status(400).send('Missing signature')
	}

	try {
		event = stripe.webhooks.constructEvent(
			request.rawBody!,
			signature,
			process.env.STRIPE_ENDPOINT_SECRET ?? '',
		)
	} catch {
		return response.status(400).send('Webhook signature verification failed')
	}

	const subscription = event.data.object as Subscription

	switch (event.type) {
		case 'customer.subscription.created': {
			await handleSubscriptionEvent(subscription, 'created')

			break
		}

		case 'customer.subscription.updated': {
			await handleSubscriptionEvent(subscription, 'updated')

			break
		}

		case 'customer.subscription.deleted': {
			await handleSubscriptionEvent(subscription, 'deleted')

			break
		}

		case 'invoice.paid': {
			const invoice = event.data.object as Invoice
			const user = await userManager.findByStripeCustomerId(
				invoice.customer as string,
			)

			if (!user) {
				console.error({
					message: 'Received invoice.paid event for unknown user',
					invoice,
				})

				break
			}

			await userManager.saveInvoice(user.id, invoice)

			if (
				['subscription_update', 'subscription_create'].includes(
					invoice.billing_reason!,
				)
			) {
				try {
					await bot.api.sendMessage(
						user.id,
						`Your subscription has been successfully renewed!`,
					)
				} catch (error: unknown) {
					console.error(error)
				}
			}

			break
		}

		default: {
			break
		}

		// No default
	}

	response.send()
}

async function handleSubscriptionEvent(
	subscription: Subscription,
	eventType: 'created' | 'updated' | 'deleted',
) {
	console.info({
		message: 'Received subscription event from Stripe',
		eventType,
		subscription,
	})

	if (subscription.status === 'incomplete') {
		console.info({
			message: 'Ignoring subscription event with incomplete status',
			eventType,
			subscription,
		})

		return
	}

	const userId = Number(subscription.metadata.userId)
	const planId = Number(subscription.metadata.planId)
	const subscriptionPlan = userPlans.find((plan) => plan.id === planId)!
	const expiresAt = new Date(subscription.current_period_end * 1000)
	const amount = String(subscriptionPlan.price * 100)
	const user = new User({ id: userId })

	if (!subscriptionPlan) {
		throw new Error('Subscription plan not found')
	}

	switch (eventType) {
		case 'created': {
			if (subscription.status === 'active') {
				console.info({
					message: 'Creating subscription from Stripe',
					userId,
					expiresAt,
					amount,
					subscriptionPlan,
				})

				await user.set({
					stripeSubscriptionId: subscription.id,
					planId: subscriptionPlan.id,
					subscriptionStartedAt: Date.now(),
					subscriptionExpiresAt: expiresAt.getTime(),
				})
			}

			break
		}

		case 'updated': {
			console.info({
				message: 'Upserting subscription from Stripe',
				userId,
				expiresAt,
				amount,
				subscriptionPlan,
			})

			if (subscription.status === 'active') {
				await user.set({
					stripeSubscriptionId: subscription.id,
					planId: subscriptionPlan.id,
					subscriptionStartedAt: Date.now(),
					subscriptionExpiresAt: expiresAt.getTime(),
					autoRenewEnabled: !subscription.cancel_at_period_end,
				})
			} else {
				await user.set({
					stripeSubscriptionId: '',
					planId: 1,
					subscriptionStartedAt: Date.now(),
					subscriptionExpiresAt: Date.now(),
					autoRenewEnabled: false,
				})
			}

			break
		}

		case 'deleted': {
			console.info({
				message: 'Deleting subscription from Stripe',
				userId,
			})

			await user.set({
				stripeSubscriptionId: '',
				planId: 1,
				subscriptionStartedAt: Date.now(),
				subscriptionExpiresAt: Date.now(),
				autoRenewEnabled: false,
			})

			break
		}

		// No default
	}
}
