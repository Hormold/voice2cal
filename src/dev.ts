/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable unicorn/prefer-top-level-await */
import process from 'node:process'
import bot from './bot.js'
import server from './index.js'

const port = process.env.PORT ?? 3000
console.log(`NODE_ENV: ${process.env.NODE_ENV}`)

bot
	.start({
		drop_pending_updates: true,
	})
	.catch((error) => {
		console.error('Bot error:', error)
	})
server.listen(port, () => {
	console.log('Google App listening on port ' + port)
})
