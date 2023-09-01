import bot from './bot';
import { webhookCallback } from "grammy";

export default webhookCallback(bot, 'http')