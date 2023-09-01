import bot from './bot.js';
import { webhookCallback } from "grammy";

export default webhookCallback(bot, 'http')