/* eslint-disable @typescript-eslint/no-unsafe-return */
import { type UserSettings, type TelegramUserinfo } from '../types.js'
import redisClient from './redis.js'
import { userPlans } from './paid.js'

class User {
	id = 0
	user: TelegramUserinfo | null = null

	defaultSettings: UserSettings = {
		id: 0,
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
		subscriptionStartedAt: Date.now(),
		subscriptionExpiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
	}

	settings: UserSettings = this.defaultSettings

	constructor(user: TelegramUserinfo | { id: number }) {
		this.id = user.id
		if ('is_bot' in user) this.user = user
	}

	async get(): Promise<typeof this.defaultSettings & { id: number }> {
		let user = await redisClient.get(`user:${this.id}`)
		if (!user) {
			await redisClient.set(
				`user:${this.id}`,
				JSON.stringify({
					...this.defaultSettings,
					id: this.id,
				}),
			)
			user = await redisClient.get(`user:${this.id}`)
		}

		if (!user) throw new Error('User not found')

		const result: UserSettings = {
			...this.defaultSettings,
			...(JSON.parse(user) as UserSettings),
		}

		result.botUsage = Number(
			(await redisClient.get(`bot:usage:${this.id}`)) ?? 0,
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
}

export default User
