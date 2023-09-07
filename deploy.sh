gcloud --quiet beta functions deploy voice2cal \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-west2 \
  --timeout=120s \
  --source=. \
  --entry-point=handleTelegramWebhook \
  --trigger-http \
  --allow-unauthenticated \
  --env-vars-file prod.env.yaml \
  --min-instances 0 \
  --max-instances 3 \
  --project hormold \
  --source . 
#&
# gcloud --quiet beta functions deploy openai-requests \
#  --gen2 \
#  --entry-point handleOpenAIRequest \
#  --trigger-topic openai-requests \
#  --project hormold \
#  --timeout=120s \
#  --runtime nodejs20 \
#  --region us-west2 \
#  --min-instances 0 \
#  --max-instances 3 \
#  --env-vars-file prod.env.yaml \
#  --source . &
#wait