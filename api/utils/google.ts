import { google } from "googleapis";
import { GoogleUserinfo } from "../types";

const SCOPES = [
	// Write to calendar
	// Basic info
	'https://www.googleapis.com/auth/userinfo.profile',
	'https://www.googleapis.com/auth/userinfo.email',
	'https://www.googleapis.com/auth/calendar',
	// Read from calendar
];


// Generate google login link
const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	"https://tg-bot-v2c.vercel.app/google/callback",
	
);

export const getGoogleId = async (accessToken: string): Promise<GoogleUserinfo> => {
	oauth2Client.setCredentials({ access_token: accessToken });
	const oauth2 = google.oauth2({
		auth: oauth2Client,
		version: 'v2',
	});

	const res = await oauth2.userinfo.get();
	return res.data;
}

export const googleLogin = (userId: number): string => {
	const authUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent',
		scope: SCOPES,
		state: JSON.stringify({ userId }),
	});
	return authUrl;
}

// Get access token from codeex
export const getAccessToken = async (code: string) => {
	const { tokens } = await oauth2Client.getToken(code);
	return tokens;
}

export const getAllCalendars = async (accessToken: string) => {
	oauth2Client.setCredentials({ access_token: accessToken });
	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const res = await calendar.calendarList.list();
	const calendars = res.data.items;
	if (!calendars || calendars.length === 0) {
		console.log('No calendars found.');
		return;
	}
	return calendars;
}

export const getCalendarEvents = async (accessToken: string) => {
	oauth2Client.setCredentials({ access_token: accessToken });
	const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
	const res = await calendar.events.list({
		calendarId: 'primary',
		timeMin: (new Date()).toISOString(),
		maxResults: 20,
		singleEvents: true,
		orderBy: 'startTime',
	});

	const events = res.data.items;
	if (!events || events.length === 0) {
		console.log('No upcoming events found.');
		return;
	}

	return events.map((event, i) => {
		if(!event.start) return;
		const start = event.start.dateTime || event.start.date;
		const end = event.end?(event.end.dateTime || event.end.date):"";
		return `${start} - ${end} - ${event.summary}`;
	});
}


export const addCalendarEvent = async (accessToken: string, refreshToken: string, calendarId: string, event: any): Promise<[any, string]> => {
	event.source = {
		title: "Voice2Cal",
		url: "https://t.me/voic2calbot",
	};
	try {
		oauth2Client.setCredentials({ access_token: accessToken });
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
		const result = await calendar.events.insert({
			calendarId,
			requestBody: event,
		});

		return [result, accessToken];
	} catch(error: any) {
		if(error.message === "Invalid Credentials") {
			const tokens = await getAccessToken(refreshToken);
			oauth2Client.setCredentials(tokens);
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
			const result = await calendar.events.insert({
				calendarId,
				requestBody: event,
			});
			return [result, String(tokens.access_token)];
		}
		throw error;
	}
}

export const cancelGoogleEvent = async (accessToken: string, refreshToken: string, calendarId: string, eventId: string): Promise<[any, string]> => {
	try {
		oauth2Client.setCredentials({ access_token: accessToken });
		const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
		const result = await calendar.events.delete({
			calendarId,
			eventId,
		});

		return [result, accessToken];
	} catch(error: any) {
		if(error.message === "Invalid Credentials") {
			const tokens = await getAccessToken(refreshToken);
			oauth2Client.setCredentials(tokens);
			const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
			const result = await calendar.events.delete({
				calendarId,
				eventId,
			});
			return [result, String(tokens.access_token)];
		}
		throw error;
	}
}