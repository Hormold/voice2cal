/* eslint-disable n/file-extension-in-import */
/* eslint-disable @typescript-eslint/naming-convention */
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import {
	ChatPromptTemplate,
	SystemMessagePromptTemplate,
	HumanMessagePromptTemplate,
} from 'langchain/prompts'
import { JsonOutputFunctionsParser } from 'langchain/output_parsers'
import { type runFormat, zodSchema } from '../types.js'
import { currentDT } from '../utils/functions.js'

const prompt = new ChatPromptTemplate({
	promptMessages: [
		SystemMessagePromptTemplate.fromTemplate(
			`Your task is to extract the meta data for the user command and save event that will be recorded in the calendar.
User can ask to remind private event, like meeting, hospital visit etc. Or public event like car show, concert, etc.
Just extract data and return in specified format (respect user language)
Response in google calendar format via structured tool strictly in valid json, in user language.`,
		),
		HumanMessagePromptTemplate.fromTemplate(`Input: {inputText}
Current time: {currentDT}
Language: {lang}
Timezone: {timezone}
Location: {cityName}, {countyName}`),
	],
	inputVariables: [
		'inputText',
		'lang',
		'timezone',
		'cityName',
		'countyName',
		'currentDT',
	],
})

const additionalInfoPrompt = new ChatPromptTemplate({
	promptMessages: [
		SystemMessagePromptTemplate.fromTemplate(
			`Your task is to extract the meta data for the previous neural network data processing and save event that will be recorded in the calendar. Just extract data and return in specified format (respect user language).`,
		),
		HumanMessagePromptTemplate.fromTemplate(`User input: {inputText}
The result of the work of the previous neural network: {additionalInfo}
Current time: {currentDT}
Language: {lang}
Timezone: {timezone}
Location: {cityName}, {countyName}`),
	],
	inputVariables: [
		'inputText',
		'lang',
		'timezone',
		'cityName',
		'countyName',
		'currentDT',
		'additionalInfo',
	],
})

const runWay1 = async (
	{ messageText, userLang, userSettings }: runFormat,
	modelName = 'gpt-4',
	additionalInfo = '',
) => {
	const llm = new ChatOpenAI({
		modelName,
		temperature: 0,
	})

	const functionCallingModel = llm.bind({
		functions: [
			{
				name: 'output_formatter',
				description: 'Should always be used to properly format output',
				parameters: zodToJsonSchema(zodSchema),
			},
		],
		function_call: { name: 'output_formatter' },
	})

	const outputParser = new JsonOutputFunctionsParser()
	if (additionalInfo) {
		const chain = additionalInfoPrompt
			.pipe(functionCallingModel)
			.pipe(outputParser)
		const response = await chain.invoke({
			inputText: messageText,
			lang: userLang,
			timezone: userSettings.timeZone,
			cityName: userSettings.cityName,
			countyName: userSettings.countyName,
			currentDT: currentDT(userSettings.timeZone!),
			additionalInfo,
		})

		return response
	}

	const chain = prompt.pipe(functionCallingModel).pipe(outputParser)
	const response = await chain.invoke({
		inputText: messageText,
		lang: userLang,
		timezone: userSettings.timeZone,
		cityName: userSettings.cityName,
		countyName: userSettings.countyName,
		currentDT: currentDT(userSettings.timeZone!),
	})

	return response
}

export default runWay1
