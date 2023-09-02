import process from 'node:process'
import { Configuration, OpenAIApi } from 'openai'

const openai = new OpenAIApi(
	new Configuration({
		apiKey: process.env.OPENAI_API_KEY,
	}),
)

export default function getOpenAiClient() {
	return openai
}
