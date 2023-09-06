/* eslint-disable n/file-extension-in-import */
/* eslint-disable @typescript-eslint/naming-convention */
import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'
import { ChatOpenAI } from 'langchain/chat_models/openai'
import {
	ChatPromptTemplate,
	SystemMessagePromptTemplate,
	HumanMessagePromptTemplate,
} from 'langchain/prompts'
import { JsonOutputFunctionsParser } from 'langchain/output_parsers'

const zodSchema = z.object({
	isEvent: z.boolean(),
	lang: z.string(),
})

const llm = new ChatOpenAI({
	modelName: 'gpt-3.5-turbo-0613',
	temperature: 0,
})

const infoPrompt = new ChatPromptTemplate({
	promptMessages: [
		SystemMessagePromptTemplate.fromTemplate(
			`Your task is check if the user input is looks like event to save it in the calendar or it just a regular message, spam, missclick or something else.`,
		),
		HumanMessagePromptTemplate.fromTemplate(`User input: {inputText}`),
	],
	inputVariables: ['inputText'],
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

export const simpleCheckIsEvent = async (
	messageText: string,
): Promise<boolean> => {
	const chain = infoPrompt.pipe(functionCallingModel).pipe(outputParser)
	const response = (await chain.invoke({
		inputText: messageText,
	})) as { isEvent: boolean; lang: string }

	return response.isEvent
}
