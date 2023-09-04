/* eslint-disable @typescript-eslint/naming-convention */
import process from 'node:process'
import { google } from 'googleapis'
import {
	type GoogleUserinfo,
	type GoogleContacts,
	type CalendarEvent,
	type CalendarListEntiy,
} from '../types.js'

const scopesList = [
	// Write to calendar
	// Basic info
	'https://www.googleapis.com/auth/userinfo.profile',
	'https://www.googleapis.com/auth/userinfo.email',
	'https://www.googleapis.com/auth/calendar',
	'https://www.googleapis.com/auth/contacts.readonly',
	// Read from calendar
]

// Generate google login link
const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/google/callback',
)

export const getGoogleId = async (
	accessToken: string,
): Promise<GoogleUserinfo> => {
	oauth2Client.setCredentials({ access_token: accessToken })
	const oauth2 = google.oauth2({
		auth: oauth2Client,
		version: 'v2',
	})

	const result = await oauth2.userinfo.get()
	return result.data
}

const refreshAccessToken = async (
	refreshToken: string,
): Promise<string | null> => {
	oauth2Client.setCredentials({ access_token: '', refresh_token: refreshToken })
	return new Promise((resolve, reject) => {
		oauth2Client.refreshAccessToken((error, tokens) => {
			if (!tokens?.access_token || error) {
				reject(error)
				return
			}

			resolve(tokens.access_token)
		})
	})
}

export const googleLogin = (userId: number): string => {
	const authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: scopesList,
		state: JSON.stringify({ userId }),
	})
	return authUrl
}

// Get access token from codeex
export const getAccessToken = async (code: string) => {
	const { tokens } = await oauth2Client.getToken(code)
	return tokens
}

export const getAllCalendars = async (
	accessToken: string,
	refreshToken: string,
): Promise<[CalendarListEntiy[], string]> => {
	try {
		oauth2Client.setCredentials({ access_token: accessToken })
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
		const result = await calendar.calendarList.list()
		const calendars = result.data.items
		if (!calendars || calendars.length === 0) {
			console.log('No calendars found.')
			return [[], accessToken]
		}

		return [calendars, accessToken]
	} catch (error: any) {
		if (error.message === 'Invalid Credentials') {
			const newToken = await refreshAccessToken(refreshToken)
			if (!newToken) throw new Error('Invalid access token')
			oauth2Client.setCredentials({ access_token: newToken })
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
			const result = await calendar.calendarList.list()
			const calendars = result.data.items
			if (!calendars || calendars.length === 0) {
				console.log('No calendars found.')
				return [[], newToken]
			}

			return [calendars, newToken]
		}

		throw new Error(error.message as string)
	}
}

export const getCalendarEvents = async (
	accessToken: string,
	refreshToken: string,
): Promise<string[] | undefined> => {
	try {
		oauth2Client.setCredentials({ access_token: accessToken })
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
		const result = await calendar.events.list({
			calendarId: 'primary',
			timeMin: new Date().toISOString(),
			maxResults: 20,
			singleEvents: true,
			orderBy: 'startTime',
		})

		const events = result.data.items
		if (!events || events.length === 0) {
			console.log('No upcoming events found.')
			return
		}

		return events.map((event, i) => {
			if (!event.start) return ''
			const start = event.start.dateTime ?? event.start.date
			const end = event.end ? event.end.dateTime ?? event.end.date : ''
			return `${start} - ${end} - ${event.summary}`
		})
	} catch (error: any) {
		if (error.message === 'Invalid Credentials') {
			const tokens = await refreshAccessToken(refreshToken)
			if (!tokens) throw new Error('Invalid access token')
			return getCalendarEvents(tokens, refreshToken)
		}

		throw new Error(error.message as string)
	}
}

export const addCalendarEvent = async (
	accessToken: string,
	refreshToken: string,
	calendarId: string,
	event: CalendarEvent,
): Promise<[any, string]> => {
	event.source = {
		title: 'Voice2Cal Bot',
		url: 'https://t.me/voic2calbot',
	}
	try {
		oauth2Client.setCredentials({ access_token: accessToken })
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
		const result = await calendar.events.insert({
			calendarId,
			requestBody: event,
		})

		return [result, accessToken]
	} catch (error: any) {
		if (error.message === 'Invalid Credentials') {
			const accessToken = await refreshAccessToken(refreshToken)
			oauth2Client.setCredentials({ access_token: accessToken })
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
			const result = await calendar.events.insert({
				calendarId,
				requestBody: event,
			})
			return [result, String(accessToken)]
		}

		throw new Error(error.message as string)
	}
}

export const cancelGoogleEvent = async (
	accessToken: string,
	refreshToken: string,
	calendarId: string,
	eventId: string,
): Promise<[boolean, string]> => {
	try {
		oauth2Client.setCredentials({ access_token: accessToken })
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
		await calendar.events.delete({
			calendarId,
			eventId,
		})

		return [true, accessToken]
	} catch (error: any) {
		if (error.message === 'Invalid Credentials') {
			const accessToken = await refreshAccessToken(refreshToken)
			oauth2Client.setCredentials({ access_token: accessToken })
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
			await calendar.events.delete({
				calendarId,
				eventId,
			})
			return [true, String(accessToken)]
		}

		throw new Error(error.message as string)
	}
}

export const getContacts = async (
	accessToken: string,
	refreshToken: string,
): Promise<[GoogleContacts[], string]> => {
	try {
		oauth2Client.setCredentials({ access_token: accessToken })
		const people = google.people({ version: 'v1', auth: oauth2Client })
		const result = await people.people.connections.list({
			resourceName: 'people/me',
			pageSize: 2000,
			personFields: 'names,emailAddresses',
		})

		const connections = result.data.connections
		if (!connections || connections.length === 0) {
			console.log('No contacts found.')
			return [[], accessToken]
		}

		return [connections, accessToken]
	} catch (error: any) {
		if (error.message === 'Invalid Credentials') {
			const newToken = await refreshAccessToken(refreshToken)
			if (!newToken) throw new Error('Invalid access token')
			oauth2Client.setCredentials({ access_token: newToken })
			const people = google.people({ version: 'v1', auth: oauth2Client })
			const result = await people.people.connections.list({
				resourceName: 'people/me',
				pageSize: 9999,
				personFields: 'names,emailAddresses',
			})

			const connections = result.data.connections
			if (!connections || connections.length === 0) {
				console.log('No contacts found.')
				return [[], newToken]
			}

			return [connections, newToken]
		}

		throw new Error(error.message as string)
	}
}

export const checkGoogleAccess = async (
	accessToken: string,
	type: 'calendar' | 'contacts' = 'calendar',
): Promise<boolean> => {
	try {
		const oauth2Client = new google.auth.OAuth2()
		oauth2Client.setCredentials({ access_token: accessToken })

		if (type === 'calendar') {
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
			const calendarList = await calendar.calendarList.list()
			const calendars = calendarList.data.items
			if (!calendars || calendars.length === 0) {
				return false
			}
		} else if (type === 'contacts') {
			const people = google.people({ version: 'v1', auth: oauth2Client })
			const result = await people.people.connections.list({
				resourceName: 'people/me',
				pageSize: 1,
				personFields: 'names',
			})

			const connections = result.data.connections
			if (!connections || connections.length === 0) {
				return false
			}
		}

		return true
	} catch (error: any) {
		console.log(`checkGoogleAccess error: ${error.message}`)
		return false
	}
}
