import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ChatOpenAI } from "langchain/chat_models/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "langchain/prompts";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import { runFormat } from "../types.js";
import { currentDT } from "../utils/functions.js";


const zodSchema = z.object({
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
})
.describe("An object that describes a google calendar event")

const prompt = new ChatPromptTemplate({
  promptMessages: [
    SystemMessagePromptTemplate.fromTemplate(
      `Your task is to extract the meta data for the user command and save event that will be recorded in the calendar.
User can ask to remind private event, like meeting, hospital visit etc. Or public event like car show, concert, etc.
Just extract data and return in specified format (respect user language)
Response in google calendar format via structured tool strictly in valid json, in user language..`
    ),
    HumanMessagePromptTemplate.fromTemplate(`Input: {inputText}
Current time: {currentDT}
Language: {lang}
Timezone: {timezone}
Location: {cityName}, {countyName}`),
  ],
  inputVariables: ["inputText", "lang", "timezone", "cityName", "countyName", "currentDT"], 
});

const additionalInfoPrompt = new ChatPromptTemplate({
	promptMessages: [
    SystemMessagePromptTemplate.fromTemplate(
      `Your task is to extract the meta data for the prev neural network data processing and save event that will be recorded in the calendar. Just extract data and return in specified format (respect user language).`
    ),
    HumanMessagePromptTemplate.fromTemplate(`User input: {inputText}
Neural processing: {additionalInfo}
Current time: {currentDT}
Language: {lang}
Timezone: {timezone}
Location: {cityName}, {countyName}`),
  ],
  inputVariables: ["inputText", "lang", "timezone", "cityName", "countyName", "currentDT", "additionalInfo"], 
});


const runWay1 = async (
	{
		messageText,
		userLang,
		userSettings,
	}: runFormat,
	modelName: string = 'gpt-4',
	additionalInfo: string = ''
) => {

	const llm = new ChatOpenAI({
		modelName,
		temperature: 0
	});

	const functionCallingModel = llm.bind({
		functions: [
			{
				name: "output_formatter",
				description: "Should always be used to properly format output",
				parameters: zodToJsonSchema(zodSchema),
			},
		],
		function_call: { name: "output_formatter" },
	});


	const outputParser = new JsonOutputFunctionsParser();
	if(additionalInfo) {
		const chain = additionalInfoPrompt.pipe(functionCallingModel).pipe(outputParser);
		const response = await chain.invoke({
			inputText: messageText,
			lang: userLang,
			timezone: userSettings.timeZone,
			cityName: userSettings.cityName,
			countyName: userSettings.countyName,
			currentDT: currentDT(userSettings.timeZone),
			additionalInfo,
		});

		return response;
	}

	const chain = prompt.pipe(functionCallingModel).pipe(outputParser);
	const response = await chain.invoke({
		inputText: messageText,
		lang: userLang,
		timezone: userSettings.timeZone,
		cityName: userSettings.cityName,
		countyName: userSettings.countyName,
		currentDT: currentDT(userSettings.timeZone),
	});

	return response;
};

export default runWay1;