#BOT_TOKEN = $1
YOUR_DOMAIN=https://us-west2-hormold.cloudfunctions.net/voice2cal/bot

curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=$YOUR_DOMAIN&secret_token=$SECRET_TOKEN"