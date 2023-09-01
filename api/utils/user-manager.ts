
import redis from "ioredis";
import { User as TelegramUser } from 'grammy/types'
import { GoogleUserinfo } from "../types.js";
const redisClient = new redis(process.env.KV_URL!);

type settings = {
	googleAccessToken?: string,
	googleRefreshToken?: string,
	googleCalendarId?: string | null,
	countyName?: string | null,
	cityName?: string | null,
	timeZone?: string | null,
	googleExpiresAt?: number | null,
	calendarId?: string | null,
	calendarName?: string | null,
	googleUserInfo?: GoogleUserinfo | null,
	modeId?: number | null,
}

class User {
	id: number = 0;
	user: TelegramUser = {} as TelegramUser;

	defaultSettings = {
		googleAccessToken: "",
		googleRefreshToken: "",
		googleCalendarId: null,
		googleExpiresAt: null,
		countyName: null,
		cityName: null,
		timeZone: null,
		calendarId: 'primary',
		calendarName: 'Primary',
		googleUserInfo: {},
		modeId: 1,
	} as settings;

	constructor(user: TelegramUser | { id: number }) {
		this.id = user.id;
		if('is_bot' in user)
			this.user = user;
	}

	async get() {
		let user = await redisClient.get(`user:${this.id}`);
		if(!user) {
			await redisClient.set(`user:${this.id}`, JSON.stringify({
				id: this.id,
				...this.defaultSettings,
			}));
			user = await redisClient.get(`user:${this.id}`);
		}

		if(!user) throw new Error("User not found");

		return JSON.parse(user) as typeof this.defaultSettings & { id: number };
	}

	async set(settings: settings) {
		const user = await this.get();
		await redisClient.set(`user:${this.id}`, JSON.stringify({
			...user,
			...settings,
		}));
	}
}

export default User;