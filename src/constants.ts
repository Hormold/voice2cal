import process from 'node:process'
import { z } from 'zod'
import { type Plan } from './types.js'

const isDev = process.env.NODE_ENV === 'development'

export const commands = {
	login: '👤 Login to Google Account',
	calendars: '📅 Select calendar',
	reset: '🔧 Reset Google Account',
	mode: '🔧 Select mode (GPT-3.5 or GPT-4)',
	subscribe: '🔧 Subscribe to PRO plans',
	events: '📅 Show 20 upcoming events',
}

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
		stripePlanId: isDev
			? 'price_1NmnVYFWIUVIqUXgnf82QMTV'
			: 'price_1NmiOeFWIUVIqUXgYpGowpp3',
	},
	{
		id: 3,
		name: 'Ultra',
		price: 4.99,
		period: 1000 * 60 * 60 * 24 * 30,
		fastMode: true,
		messagesPerMonth: 500,
		voiceMessages: true,
		stripePlanId: isDev
			? 'price_1NmnWKFWIUVIqUXgbfhdLcqm'
			: 'price_1NmiYzFWIUVIqUXgWc2fzx37',
	},
] as Plan[]

export const zodSchema = z
	.object({
		summary: z.string(),
		description: z
			.string()
			.describe('Description of the event. Can contain HTML.')
			.optional(),
		eventType: z
			.string()
			.optional()
			.describe('Type of the event: default, outOfOffice, focusTime'),
		location: z
			.string()
			.optional()
			.describe('Geographic location of the event as free-form text'),
		start: z.object({
			dateTime: z.string().describe('Date and time of the start of the event'),
			timeZone: z.string().describe('Timezone of the event'),
		}),
		end: z.object({
			dateTime: z.string().describe('Date and time of the end of the event'),
			timeZone: z.string().describe('Timezone of the event'),
		}),
		recurrence: z
			.array(z.string())
			.optional()
			.describe(
				'List of RRULE, EXRULE, RDATE and EXDATE lines for a recurring event, as specified in RFC5545. Note that DTSTART and DTEND lines are not allowed in this field; event start and end times are specified in the start and end fields. This field is omitted for single events or instances of recurring events.',
			),
		attendees: z
			.array(
				z.object({
					email: z.string(),
				}),
			)
			.optional()
			.describe('Array of attendees'),
		transparency: z
			.string()
			.optional()
			.describe('Transparency of the event: opaque, transparent'),
		reminders: z
			.object({
				useDefault: z.boolean().optional().describe('Use default reminders'),
				overrides: z
					.array(
						z.object({
							method: z
								.string()
								.optional()
								.describe('Method of the reminder: email, popup'),
							minutes: z
								.number()
								.optional()
								.describe('Minutes before the event'),
						}),
					)
					.optional()
					.describe('Array of reminders'),
			})
			.optional()
			.describe('Reminders for the event if needed'),
		visibility: z
			.string()
			.optional()
			.describe(
				'Visibility of the event: default, public, private, confidential',
			),
	})
	.describe('An object that describes a google calendar event')

export const contactsSchema = z.object({
	name: z
		.array(z.string())
		.describe(
			`Variants of the name of the contact to search for in user language and english`,
		),
})
