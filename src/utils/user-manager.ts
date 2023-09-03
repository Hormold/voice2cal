import { type UserSettings, type TelegramUserinfo } from '../types.js'
import redisClient from './redis.js'

class User {
	id = 0
	user: TelegramUserinfo | null = null

	defaultSettings: UserSettings = {
		googleAccessToken: '',
		googleRefreshToken: '',
		googleCalendarId: null,
		googleExpiresAt: null,
		countyName: null,
		cityName: null,
		timeZone: null,
		calendarId: 'primary',
		calendarName: 'Primary',
		googleUserInfo: {},
		modeId: 1,
		accessGranted: false,
		botUsage: 0,
	}

	constructor(user: TelegramUserinfo | { id: number }) {
		this.id = user.id
		if ('is_bot' in user) this.user = user
	}

	async get() {
		let user = await redisClient.get(`user:${this.id}`)
		if (!user) {
			await redisClient.set(
				`user:${this.id}`,
				JSON.stringify({
					id: this.id,
					...this.defaultSettings,
				}),
			)
			user = await redisClient.get(`user:${this.id}`)
		}

		if (!user) throw new Error('User not found')

		const result = JSON.parse(user) as typeof this.defaultSettings & {
			id: number
		}

		result.botUsage = Number(
			(await redisClient.get(`bot:usage:${this.id}`)) ?? 0,
		)

		return result
	}

	async set(settings: Partial<typeof this.defaultSettings>) {
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
}

export default User
