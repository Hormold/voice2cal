import { Calculator } from "langchain/tools/calculator";
import { BingSerpAPI } from "langchain/tools";
import { DynamicTool, DynamicStructuredTool } from "langchain/tools";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { initializeAgentExecutorWithOptions	} from "langchain/agents";
import { BufferMemory } from "langchain/memory";
import { RedisChatMessageHistory } from "langchain/stores/message/ioredis";
import { runFormat, zodSchema, contactsSchema } from "../types.js";
import { currentDT } from "../utils/functions.js";
import { getContacts, getCalendarEvents } from "../utils/google.js";


const getTools = (accessToken:string, refreshToken: string) => ([
  new Calculator(),
  new BingSerpAPI(process.env.BING_KEY!),
  new DynamicStructuredTool({
    name: "generate_calendar_event",
    description: "generate google calendar event",
    schema: zodSchema,
    func: async (params) => {
      //console.log(`Add event to google calendar: ${summary}`);
      return JSON.stringify(params);
    }
  }),
  new DynamicTool({
	name: "get_future_events",
	description: "get future events from google calendar",
	func: async () => {
		const events = await getCalendarEvents(accessToken, refreshToken);
		return events?.filter((event) => event !== "").join("\n") || "No upcoming events found.";
	}
  }),
  new DynamicStructuredTool({
	name: "get_contacts",
	description: "get contacts from google contacts",
	schema: contactsSchema,
	func: async ({name}) => {
		const [contacts, newAccessToken] = await getContacts(accessToken, refreshToken);
		// name - array of names, we need to search for each name in contacts
		const result = contacts.filter((contact) => {
			// Check Name and Email if some partial match, non case sensitive
			return name.some((n) => {
				return contact.names?.some((contactName) => {
					return contactName.displayName?.toLowerCase().includes(n.toLowerCase());
				}) || contact.emailAddresses?.some((email) => {
					return email.value?.toLowerCase().includes(n.toLowerCase());
				});
			});
		});
		return result.map((contact) => {
			return (contact.names?.map((name) => name.displayName).join(", ") || "No name") + ": " + (contact.emailAddresses?.map((email) => email.value).join(", ") || "No email");
		}).join("\n");
	}
  }),
]);

const model2 = new ChatOpenAI({
  temperature: 0,
  modelName: 'gpt-4',
  verbose: true,
  configuration: {
    apiKey: process.env.OPENAI_API_KEY!,
  }
});

const promptTemplate = PromptTemplate.fromTemplate(`
Your task is to extract the meta data for the user command and save event that will be recorded in the calendar.
User can ask to remind private event, like meeting, hospital visit etc. Or public event like car show, concert, etc.
If the looks like a public event (or user mention venue), you should find out the place or event (in search engine, using English), time, date, name, etc.
If user mention someone and it looks like a contact, you should find out the contact (in google contacts, using user language) and save it as attendee only if found.
If it not required, just extract data and return in specified format (name, description on user language)
Output can be array of structured results to save into calendar, if needed.

Response in google calendar format via structured tool strictly in valid json, in user language.
Current time (user timezone): {current_datetime}
User Location: {location}
User time zone: {timezone}
User language: {lang}
User input: {question}`);

const runWay2 = async ({
	chatId,
	userSettings,
	messageText,
	userLang,
}: runFormat) => {
	const memory = new BufferMemory({
		chatHistory: new RedisChatMessageHistory({
			sessionId: chatId,
			sessionTTL: 300, // 5 minutes, omit this parameter to make sessions never expire
			url: process.env.KV_URL, // Default value, override with your own instance's URL
		}),
	});

	const executor = await initializeAgentExecutorWithOptions(
		getTools(userSettings.googleAccessToken!, userSettings.googleRefreshToken!),
		model2,
		{
			agentType: 'structured-chat-zero-shot-react-description',
			verbose: true,
			memory
		}
	);

	const requestText = await promptTemplate.format({
		location: `${userSettings.cityName}, ${userSettings.countyName}`,
		timezone: userSettings.timeZone,
		lang: userLang || 'en-US',
		question: messageText,
		current_datetime: currentDT(userSettings.timeZone!),
	});

	try {
		const result = await executor.call({
			input: requestText
		});

		return result.output;

	} catch(e) {
		throw e;
	}
}

export default runWay2;