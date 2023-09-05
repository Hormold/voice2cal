import process from 'node:process'
import { type Plan } from './types.js'

const isDev = process.env.NODE_ENV === 'development'

export const userPlans = [
	{
		id: 1,
		name: 'Free',
		price: 0,
		period: 1000 * 60 * 60 * 24 * 30,
		fastMode: false,
		messagesPerMonth: 30,
		voiceMessages: false,
	},
	{
		id: 2,
		name: 'Pro',
		price: 2.99,
		period: 1000 * 60 * 60 * 24 * 30,
		fastMode: false,
		messagesPerMonth: 100,
		voiceMessages: true,
		stripePlanId: isDev
			? 'price_1NmnVYFWIUVIqUXgnf82QMTV'
			: 'price_1NmiOeFWIUVIqUXgYpGowpp3',
	},
	{
		id: 3,
		name: 'Ultra',
		price: 4.99,
		period: 1000 * 60 * 60 * 24 * 30,
		fastMode: true,
		messagesPerMonth: 500,
		voiceMessages: true,
		stripePlanId: isDev
			? 'price_1NmnWKFWIUVIqUXgbfhdLcqm'
			: 'price_1NmiYzFWIUVIqUXgWc2fzx37',
	},
] as Plan[]
