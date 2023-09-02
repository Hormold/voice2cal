import User from "./user-manager.js";
import { getAllCalendars } from "./google.js";

export const currentDT = (timeZone: string = 'Europe/Moscow'): Date => {
  return new Date(new Date().toLocaleString('en', {timeZone}))
}

const modes = [
	[1, `Fast, just extract data only from the text (GPT-3.5)`],
	[2, `Slow, but more accurate with Bing search and other tools (GPT-4)`],
]

export const getModeMenu = async (ctx: any) => {
  const user = new User(ctx.from!);
  const userSettings = await user.get();

  const buttonsForCallback = modes.map((mode: any) => {
    let selected = false;
    if(userSettings.modeId === mode[0]) {
      selected = true;
    }

    return [
      {
        text: `${selected ? "✅" : ""} ${mode[1]}`,
        callback_data: `mode:${mode[0]}`,
      },
    ]
  });

  return buttonsForCallback;
};

export const getCalendarMenu = async (ctx: any) => {
  const user = new User(ctx.from!);
  const userSettings = await user.get();
  if(!userSettings.googleAccessToken) {
    return [];
  }
  const calendars = await getAllCalendars(userSettings.googleAccessToken!);
  if(!calendars) {
    return [];
  }

  const buttonsForCallback = calendars.map((calendar: any) => {
    let selected = false;
    if((!userSettings.calendarId || userSettings.calendarId === "primary") && calendar.primary) {
      selected = true;
    }
    if(userSettings.calendarId === calendar.id) {
      selected = true;
    }

    return [
      {
        text: `${selected ? "✅" : ""} ${calendar.summary}`,
        callback_data: `calendar:${calendar.id}`,
      },
    ]
  });

  return buttonsForCallback;
};