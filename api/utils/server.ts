import express from 'express';
import { getAccessToken, getGoogleId } from './google.js';
import User from './user-manager.js';
import bot from '../bot.js';

// Simple http server to accept callback from google oauth redirect
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
	  res.send('Hello World!');
});

app.get('/google/callback', async (req, res) => {
	try {
	const { code, state } = req.query;
	let userId = 0;
	try {
		userId = JSON.parse(state as string).userId;
	} catch(e) {
		console.error(e);
		throw new Error("Invalid state");
	}

	const user = new User({ id: userId });
	const accessToken = await getAccessToken(code as string);
	if(!accessToken.access_token) throw new Error("Invalid access token");
	// Get user id using API

	const userInfo = await getGoogleId(accessToken.access_token);
	if(!userInfo.id) throw new Error("Invalid user id");

	const settings = await user.get();

	if(settings.googleUserInfo && userInfo.id !== settings.googleUserInfo?.id) throw new Error("Reset google account in telegram bot using command /reset");


	await user.set({
		googleUserInfo: userInfo,
		googleAccessToken: accessToken.access_token! as string,
		googleRefreshToken: accessToken.refresh_token!,
		googleExpiresAt: accessToken.expiry_date,
	});

	res.send('Done, you can close this tab now');

	bot.api.sendMessage(userId, `You are logged in as ${userInfo.name} (${userInfo.email})`);

	} catch(e: any) {
		res.send(`Error: ${e.message}`);
	}
});

export default app;