import { oauth2_v2 } from "googleapis/build/src/apis/oauth2/v2";
import { people_v1 } from "googleapis/build/src/apis/people/v1";
import { calendar_v3 } from "googleapis/build/src/apis/calendar/v3";
import { User as TelegramUser } from 'grammy/types'
import { z } from "zod";

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
	botUsage: number | null,
}

export type runFormat = {
	chatId: string;
	userSettings: UserSettings;
	messageText: string;
	userLang: string;
}

export type GoogleUserinfo = oauth2_v2.Schema$Userinfo;
export type GoogleContacts = people_v1.Schema$Person;
export type TelegramUserinfo = TelegramUser;
export type CalendarEvent = calendar_v3.Schema$Event;
export type CalendarListEntiy = calendar_v3.Schema$CalendarListEntry;

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


export const zodSchema = z.object({
	summary: z.string(),
	description: z.string(),
	location: z.string().optional().describe("Location of the event"),
	start: z.object({
		dateTime: z.string().describe("Date and time of the start of the event"),
		timeZone: z.string().describe("Timezone of the event"),
	}),
	end: z.object({
		dateTime: z.string().describe("Date and time of the end of the event"),
		timeZone: z.string().describe("Timezone of the event"),
	}),
	recurrence: z.array(z.string()).optional().describe("Array of recurrence rules in RFC5545 format"),
	attendees: z.array(z.object({
		email: z.string(),
	})).optional().describe("Array of attendees"),
	transparency: z.string().optional().describe("Transparency of the event: opaque, transparent"),
	reminders: z.object({
		useDefault: z.boolean().optional().describe("Use default reminders"),
		overrides: z.array(z.object({
			method: z.string().optional().describe("Method of the reminder: email, popup"),
			minutes: z.number().optional().describe("Minutes before the event"),
		})).optional().describe("Array of reminders"),
	}).optional().describe("Reminders for the event if needed"),
})
	.describe("An object that describes a google calendar event")

export const contactsSchema = z.object({
	name: z.array(
		z.string()
	).describe(`Variants of the name of the contact to search for in user language and english`),
});