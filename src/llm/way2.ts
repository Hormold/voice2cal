/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable n/file-extension-in-import */
import process from 'node:process'
import { Calculator } from 'langchain/tools/calculator'
import {
	BingSerpAPI,
	DynamicTool,
	DynamicStructuredTool,
} from 'langchain/tools'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import { PromptTemplate } from 'langchain/prompts'
import { initializeAgentExecutorWithOptions } from 'langchain/agents'
import { BufferMemory } from 'langchain/memory'
import { RedisChatMessageHistory } from 'langchain/stores/message/ioredis'
import { type runFormat, type UserSettings } from '../types.js'
import { zodSchema, contactsSchema } from '../constants.js'
import { currentDT } from '../utils/functions.js'
import { getContacts, getCalendarEvents } from '../utils/google.js'

const getTools = (
	accessToken: string,
	refreshToken: string,
	settings: UserSettings,
) => [
	new Calculator(),
	new BingSerpAPI(process.env.BING_KEY),
	new DynamicStructuredTool({
		name: 'final_output',
		description: 'generate calendar event',
		schema: zodSchema,
		async func(parameters) {
			return JSON.stringify(parameters)
		},
	}),
	new DynamicTool({
		name: 'get_future_events',
		description: 'get future events from calendar',
		async func() {
			try {
				const events = (await getCalendarEvents(
					accessToken,
					settings.calendarId!,
					false,
				)) as string[]
				if (!events || typeof events === 'string') {
					return 'No calendar access'
				}

				return (
					events?.filter((event: string) => event !== '').join('\n') ||
					'No upcoming events found.'
				)
			} catch {
				return 'No calendar access'
			}
		},
	}),
	new DynamicStructuredTool({
		name: 'find_contacts',
		description: 'find contacts from user contacts',
		schema: contactsSchema,
		async func({ name }) {
			try {
				const [contacts, _] = await getContacts(accessToken, refreshToken)
				// Todo: refresh token
				// Exclude contacts without email
				const result = contacts
					.filter((contact) => contact.emailAddresses?.length)
					.filter((contact) => {
						// Check Name and Email if some partial match, non case sensitive
						return name.some((n) => {
							return (
								contact.names?.some((contactName) => {
									return (
										contactName.displayName
											?.toLowerCase()
											.includes(n.toLowerCase()) ||
										n
											.toLowerCase()
											.includes(contactName.displayName?.toLowerCase() ?? '')
									)
								}) ||
								contact.emailAddresses?.some((email) => {
									return email.value?.toLowerCase().includes(n.toLowerCase())
								})
							)
						})
					})
				return result
					.map((contact) => {
						return (
							(contact.names?.map((name) => name.displayName).join(', ') ||
								'No name') +
							': ' +
							(contact.emailAddresses?.map((email) => email.value).join(', ') ||
								'No email')
						)
					})
					.join('\n')
			} catch {
				return 'No contacts access'
			}
		},
	}),
]

const model2 = new ChatOpenAI({
	temperature: 0,
	modelName: 'gpt-4',
	verbose: true,
	configuration: {
		apiKey: process.env.OPENAI_API_KEY!,
	},
})

const promptTemplate =
	PromptTemplate.fromTemplate(`IMPORTANT: your task is create event in calendar about subject in user input.
And your task is to extract the meta data from user INPUT text and response ONLY with valid final_output tool.
User can mention private event, like meeting, hospital visit or public event like car show, concert, etc.
If the looks like a public event and user ask to remaind about certain public event (or user mention venue), you should find out the place or event (in search engine, using English), time, date, name, etc.
Do not look for search engine if event is private! IMPORTANT!
If user mention someone and it looks like a contact, you should find out the contact (using find_contacts, using user language) and save use as attendee ONLY IF found in output! IMPORTANT!
If it not required, just extract data and return in specified format (name, description on user language)

Do not use search engine if event is private. Do not add example email to attendee if not found in contacts. IMPORTANT!


Response ONLY in calendar format via final_output tool, respect user language.
Current time (user timezone): {current_datetime} ({timezone})
Location: {location}
Language: {lang}
User Input: {question}`)

const runWay2 = async ({
	chatId,
	userSettings,
	messageText,
	userLang,
}: runFormat): Promise<string | any> => {
	const memory = new BufferMemory({
		chatHistory: new RedisChatMessageHistory({
			sessionId: chatId,
			sessionTTL: 300, // 5 minutes, omit this parameter to make sessions never expire
			url: process.env.KV_URL, // Default value, override with your own instance's URL
		}),
	})

	const executor = await initializeAgentExecutorWithOptions(
		getTools(
			userSettings.googleAccessToken!,
			userSettings.googleRefreshToken!,
			userSettings,
		),
		model2,
		{
			agentType: 'structured-chat-zero-shot-react-description',
			verbose: true,
			memory,
		},
	)

	const requestText = await promptTemplate.format({
		location: `${userSettings.cityName}, ${userSettings.countyName}`,
		timezone: userSettings.timeZone,
		lang: userLang || 'en-US',
		question: messageText,
		current_datetime: currentDT(userSettings.timeZone!),
	})

	try {
		const result = await executor.call({
			input: requestText,
		})

		return result.output
	} catch (error) {
		throw error
	}
}

export default runWay2
