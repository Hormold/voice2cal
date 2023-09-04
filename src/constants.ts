import { type Plan } from './types.js'

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
		stripePlanId: 'price_1NmiOeFWIUVIqUXgYpGowpp3',
	},
	{
		id: 3,
		name: 'Ultra',
		price: 4.99,
		period: 1000 * 60 * 60 * 24 * 30,
		fastMode: true,
		messagesPerMonth: 500,
		voiceMessages: true,
		stripePlanId: 'price_1NmiYzFWIUVIqUXgWc2fzx37',
	},
] as Plan[]
