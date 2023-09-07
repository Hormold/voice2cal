import { oauth2_v2 } from "googleapis/build/src/apis/oauth2/v2";
import { people_v1 } from "googleapis/build/src/apis/people/v1";
import { calendar_v3 } from "googleapis/build/src/apis/calendar/v3";
import { User as TelegramUser } from 'grammy/types'
import { type Context, SessionFlavor } from 'grammy'
import {
  type ConversationFlavor,
} from "@grammyjs/conversations"
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
	customInstructions?: string,
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

interface BotContext {
	user: any;
	userSettings: UserSettings;
}

interface SessionData {
	userId: number;
}

export type MyContext = Context & ConversationFlavor & SessionFlavor<SessionData> & {
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