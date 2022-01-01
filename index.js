import dotenv from "dotenv";
import Log from "loggerr"
import Koa from 'Koa'
import jwt from "koa-jwt"
import { extname, resolve } from 'path'
import { createWriteStream, createReadStream, stat } from "fs"
import { promisify } from 'util'

dotenv.config()

const app = new Koa()

const logfile = createWriteStream('./logs/stdout.log', {
	flags: 'a',
	encoding: 'utf8'
})

const log = new Log.Loggerr({
	streams: Log.levels.map(() => logfile)
})

app.use(({ request, response }, next) => {
	if (
		!request.url.startsWith('/api/video') ||
		!request.query.video ||
		!request.query.video.match(/^[a-z0-9-_]+\.(mp4|mov)$/i)
	) {
		response.redirect(process.env.HOME_URL)
		return
	}
	return next()
})

app.use(jwt({
	secret: process.env.JWT_SECRET,
	algorithms: ['HS256', 'HS512'],
	getToken: ({ request }) => request.query.token
}))

app.use(async ({ request, response }, next) => {
	const video = resolve('videos', request.query.video)

	const range = request.header.range
	if (!range) {
		response.type = extname(video)
		response.body = createReadStream(video)

		return next()
	}

	const parts = range.replace('bytes=', '').split('-')
	const videoStat = await promisify(stat)(video)
	const start = parseInt(parts[0], 10)
	const end = parts[1] ? parseInt(parts[1], 10) : videoStat.size - 1
	response.set('Content-Range', `bytes ${start}-${end}/${videoStat.size}`)
	response.set('Accept-Ranges', `bytes`)
	response.set('Content-Length', end - start + 1)
	response.status = 206
	response.body = createReadStream(video, { start, end })

	return next()
})

app.on('error', (error, ctx) => {
	log.error('server error', error, ctx)
})

app.listen(process.env.APP_PORT)