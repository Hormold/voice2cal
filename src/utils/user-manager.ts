
import redis from "ioredis";
import { UserSettings, TelegramUserinfo } from "../types.js";
const redisClient = new redis(process.env.KV_URL!);



class User {
	id: number = 0;
	user: TelegramUserinfo = {} as TelegramUserinfo;

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
		accessGranted: false,
	} as UserSettings;

	constructor(user: TelegramUserinfo | { id: number }) {
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

	async set(settings: Partial<typeof this.defaultSettings>) {
		const user = await this.get();
		await redisClient.set(`user:${this.id}`, JSON.stringify({
			...user,
			...settings,
			tg: this.user,
		}));
	}
}

export default User;