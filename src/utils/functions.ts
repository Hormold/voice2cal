/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/naming-convention */
import crypto from 'node:crypto'
import { type InlineKeyboardButton } from "grammy/types"
import { type Plan, type CalendarEvent, type UserSettings } from '../types.js'
import { userPlans } from '../constants.js'
import User from './user-manager.js'
import { getAllCalendars } from './google.js'

export const md5 = (string: string) => {
	return crypto.createHash('md5').update(string).digest('hex')
}

export const buildPreviewString = (event: CalendarEvent, userTimeZone?: string) => {
	const { summary, description, location, start, end, recurrence } = event
	if (!start || !end) {
		return ''
	}

	const startDT = new Date(start.dateTime!).toLocaleString('en')
	const endDT = new Date(end.dateTime!).toLocaleString('en')

	const rows = [`📅 ${summary}`, `🕐 ${startDT} - ${endDT}`]

	if (description) {
		rows.push(`📝 ${description}`)
	}

	if (location) {
		rows.push(`📍 ${location}`)
	}

	if (recurrence) {
		rows.push(`🔁 Recurrence shedule (RFC5545): ${recurrence.join(', ')}`)
	}

	if (event.visibility) {
		rows.push(`👀 Visibility: ${event.visibility}`)
	}

	if (event.transparency) {
		rows.push(
			`👀 Transparency: ${event.transparency === 'opaque'
				? 'The event does block time on the calendar. This is equivalent to setting Show me as to Busy in the Calendar UI.'
				: 'The event does not block time on the calendar. This is equivalent to setting Show me as to Available in the Calendar UI.'
			}`,
		)
	}

	if (event.reminders) {
		if (event.reminders.useDefault) {
			rows.push(`⏰ Default reminders`)
		} else if (event.reminders.overrides) {
			rows.push(
				`⏰ Reminders: ${event.reminders.overrides
					.map(
						(reminder) =>
							`${reminder.minutes} minutes before the event via ${reminder.method}`,
					)
					.join(', ')}`,
			)
		}
	}

	if (event.attendees && event.attendees.length > 0) {
		rows.push(
			`👥 Attendees: ${event.attendees
				.map((attendee) => attendee.email)
				.join(', ')}`,
		)
	}

	return rows.join('\n')
}

export const currentDT = (timeZone = 'Europe/Moscow'): Date => {
	return new Date(new Date().toLocaleString('en', { timeZone }))
}

const modes = [
	[1, `GPT3 Only, Fast, just extract data only from the text`],
	[2, `GPT4+GPT3.5, Slow, but more accurate with Bing search and other tools`],
]

export const getModeMenu = async (ctx: any) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()

	const buttonsForCallback = modes.map((mode: any) => {
		let selected = false
		if (userSettings.modeId === mode[0]) {
			selected = true
		}

		return [
			{
				text: `${selected ? '✅' : ''} ${mode[1]} `,
				callback_data: `mode:${mode[0]} `,
			},
		]
	})

	return buttonsForCallback
}

export const getCalendarMenu = async (ctx: any) => {
	const user = new User(ctx.from!)
	const userSettings = await user.get()
	if (!userSettings.googleAccessToken) {
		return []
	}

	const [calendars, accessToken] = await getAllCalendars(
		userSettings.googleAccessToken,
		userSettings.googleRefreshToken!,
	)
	if (!calendars) {
		return []
	}

	if (accessToken !== userSettings.googleAccessToken) {
		await user.set({
			googleAccessToken: accessToken,
		})
	}

	const buttonsForCallback = calendars.map((calendar: any) => {
		let selected = false
		if (
			(!userSettings.calendarId || userSettings.calendarId === 'primary') &&
			calendar.primary
		) {
			selected = true
		}

		if (userSettings.calendarId === calendar.id) {
			selected = true
		}

		return [
			{
				text: `${selected ? '✅' : ''} ${calendar.summary} `,
				callback_data: `calendar:${calendar.id} `,
			},
		]
	})

	return buttonsForCallback
}

export const getPlansMenu = (userPlan: Plan, userSettings: UserSettings) => {
	const buttonsForCallback = userPlans.map((plan: Plan) => {
		let selected = false
		if (userPlan.id === plan.id) {
			selected = true
		}

		return [
			{
				text: `${selected ? '✅' : ''} ${plan.name} (${plan.price}$ each 30 days)`,
				callback_data: `plan:${plan.id} `,
			},
		]
	}) as InlineKeyboardButton[][]

	if (userPlan.id > 1) {
		buttonsForCallback.push([
			{
				text: (userSettings.autoRenewEnabled ? `🔙 Cancel next payment` : `🔙 Enable auto renew`),
				callback_data: `cancelPayment`,
			},
		], [
			{
				text: 'Manage Stripe Subscription',
				url: `https://stripe.gptask.io/p/login/14k7sI0070xffrG5kk`,
			}
		]);
	}

	return buttonsForCallback
}