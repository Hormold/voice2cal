import bot from './bot.js';
import server from './utils/server.js';
const port = process.env.PORT || 3000;
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
bot.catch((err) => {
	console.error('Bot error:', err);
});
bot.start();
server.listen(port, () => {
	console.log('Google App listening on port '+port);
});