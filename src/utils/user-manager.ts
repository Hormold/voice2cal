import {
	type UserSettings,
	type TelegramUserinfo,
	type Invoice,
} from '../types.js'
import { userPlans } from '../constants.js'
import redisClient from './redis.js'
import { refreshAccessToken } from './google.js'

class User {
	id = 0
	user: TelegramUserinfo | null = null

	defaultSettings: UserSettings = {
		id: 0,
		lastActivityAt: Date.now(),
		createdAt: Date.now(),
		googleAccessToken: '',
		googleRefreshToken: '',
		googleCalendarId: 'primary',
		googleExpiresAt: null,
		countyName: 'unknown',
		cityName: 'unknown',
		timeZone: 'unknown',
		calendarId: 'primary',
		calendarName: 'Primary',
		googleUserInfo: {},
		modeId: 1,
		accessGranted: false,
		botUsage: 0,
		autoRenewEnabled: true,
		planId: 1,
		stripeCustomerId: '',
		stripeSubscriptionId: '',
		devStripeSubscriptionId: '',
		devStripeCustomerId: '',
		subscriptionStartedAt: Date.now(),
		subscriptionExpiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
	}

	settings: UserSettings = this.defaultSettings

	constructor(user: TelegramUserinfo | { id: number }) {
		this.id = user.id
		if ('is_bot' in user) this.user = user
	}

	async get(
		extUserId?: number,
	): Promise<typeof this.defaultSettings & { id: number }> {
		const userId = extUserId ?? this.id
		let user = await redisClient.get(`user:${userId}`)
		if (!user) {
			await redisClient.set(
				`user:${userId}`,
				JSON.stringify({
					...this.defaultSettings,
					id: userId,
				}),
			)
			user = await redisClient.get(`user:${userId}`)
		}

		if (!user) throw new Error('User not found')

		const result: UserSettings = {
			...this.defaultSettings,
			...(JSON.parse(user) as UserSettings),
		}

		result.botUsage = Number(
			(await redisClient.get(`bot:usage:${userId}`)) ?? 0,
		)

		this.settings = result

		return result
	}

	async set(settings: Partial<UserSettings>) {
		const user = await this.get()
		await redisClient.set(
			`user:${this.id}`,
			JSON.stringify({
				...user,
				...settings,
				tg: this.user,
			}),
		)

		if (settings.stripeCustomerId && settings.stripeCustomerId !== '') {
			await redisClient.set(`user:stripe:${settings.stripeCustomerId}`, this.id)
		}
	}

	async checkGoogleTokenAndGet(): Promise<UserSettings> {
		await this.get()
		const newAccessToken = (await refreshAccessToken(
			this.settings.googleRefreshToken!,
		))!
		if (!newAccessToken) throw new Error('Invalid refresh token')
		await this.set({
			googleAccessToken: String(newAccessToken),
		})
		this.settings.googleAccessToken = String(newAccessToken)
		return this.settings
	}

	async incrBotUsage() {
		await redisClient.incr(`bot:usage:${this.id}`)
	}

	async resetBotUsage() {
		await redisClient.set(`bot:usage:${this.id}`, 0)
	}

	getUserPlan() {
		return userPlans.find((plan) => plan.id === this.settings.planId)!
	}

	async setPlanId(planId: number) {
		await this.set({ planId })
	}

	isPlanActive(): boolean {
		const user = this.settings
		if (user.planId === 1) return true
		if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > Date.now()) {
			return true
		}

		return false
	}

	async findByStripeCustomerId(customerId: string): Promise<UserSettings> {
		const user = await redisClient.get(`user:stripe:${customerId}`)
		if (!user) throw new Error('User not found')

		this.id = Number(user)
		const data = await this.get()
		return data
	}

	async saveInvoice(userId: number, invoice: Invoice) {
		await redisClient.hset(
			`user:invoices:${userId}`,
			invoice.id,
			JSON.stringify(invoice),
		)
	}
}

export default User
