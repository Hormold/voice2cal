import { oauth2_v2 } from "googleapis/build/src/apis/oauth2/v2";
import { User as TelegramUser } from 'grammy/types'

export type UserSettings = {
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
	accessGranted?: boolean | null,
	tg?: TelegramUser | null,
}

export type runFormat = {
	chatId: string;
	userSettings: any;
	messageText: string;
	userLang: string;
}

export type GoogleUserinfo = oauth2_v2.Schema$Userinfo;
export type TelegramUserinfo = TelegramUser;

type GeoFeature = {
	properties: {
		city: string;
		country_code: string;
		state: string;
		timezone: { name: string };
	}
}

export type GeoData = {
	features: GeoFeature[];
}
