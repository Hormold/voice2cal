import process from 'node:process'
import Redis from 'ioredis'

const redisClient = new Redis(process.env.KV_URL!)
export default redisClient
