/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/naming-convention */
import { type CalendarEvent } from '../types.js'
import User from './user-manager.js'
import { getAllCalendars } from './google.js'

export const buildPreviewString = (event: CalendarEvent) => {
	const { summary, description, location, start, end, recurrence } = event
	if (!start || !end) {
		return ''
	}

	const startDT = new Date(start.dateTime!).toLocaleString('en', {
		timeZone: start?.timeZone ?? 'UTC',
	})
	const endDT = new Date(end.dateTime!).toLocaleString('en', {
		timeZone: end?.timeZone ?? 'UTC',
	})

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
	[1, `Fast, just extract data only from the text (GPT-3.5)`],
	[2, `Slow, but more accurate with Bing search and other tools (GPT-4)`],
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
				text: `${selected ? '✅' : ''} ${mode[1]}`,
				callback_data: `mode:${mode[0]}`,
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
				text: `${selected ? '✅' : ''} ${calendar.summary}`,
				callback_data: `calendar:${calendar.id}`,
			},
		]
	})

	return buttonsForCallback
}
