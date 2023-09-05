import { oauth2_v2 } from "googleapis/build/src/apis/oauth2/v2";
import { people_v1 } from "googleapis/build/src/apis/people/v1";
import { calendar_v3 } from "googleapis/build/src/apis/calendar/v3";
import { User as TelegramUser } from 'grammy/types'
import { type Context } from 'grammy'
import { z } from "zod";
import Stripe from 'stripe'

export type UserSettings = {
	id: number,
	lastActivityAt?: number,
	createdAt?: number,
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
	botUsage: number,
	autoRenewEnabled: boolean | null,
	planId: number,
	stripeCustomerId?: string,
	stripeSubscriptionId?: string,
	devStripeCustomerId?: string,
	devStripeSubscriptionId?: string,
	subscriptionStartedAt: number,
	subscriptionExpiresAt: number,
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
	description: z.string().describe("Description of the event. Can contain HTML.").optional(),
	eventType: z.string().optional().describe("Type of the event: default, outOfOffice, focusTime"),
	location: z.string().optional().describe("Geographic location of the event as free-form text"),
	start: z.object({
		dateTime: z.string().describe("Date and time of the start of the event"),
		timeZone: z.string().describe("Timezone of the event"),
	}),
	end: z.object({
		dateTime: z.string().describe("Date and time of the end of the event"),
		timeZone: z.string().describe("Timezone of the event"),
	}),
	recurrence: z.array(z.string()).optional().describe("List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in RFC5545. Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the start and end fields. This field is omitted for single events or instances of recurring events."),
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
	visibility: z.string().optional().describe("Visibility of the event: default, public, private, confidential"),
})
	.describe("An object that describes a google calendar event")

export const contactsSchema = z.object({
	name: z.array(
		z.string()
	).describe(`Variants of the name of the contact to search for in user language and english`),
});

interface BotContext {
	user: any;
	userSettings: UserSettings;
}

export type MyContext = Context & {
	config: BotContext;
};

export type Plan = {
	id: number;
	name: string;
	price: number;
	period: number;
	fastMode: boolean;
	messagesPerMonth: number;
	voiceMessages: boolean;
	stripePlanId: string;
}

export type Subscription = Stripe.Subscription
export type Invoice = Stripe.Invoice