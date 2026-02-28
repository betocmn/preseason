import { categoryRouter } from '~/server/api/routers/category'
import { commentRouter } from '~/server/api/routers/comment'
import { criticRouter } from '~/server/api/routers/critic'
import { llmRouter } from '~/server/api/routers/llm'
import { matchRouter } from '~/server/api/routers/match'
import { promptRouter } from '~/server/api/routers/prompt'
import { rankingRouter } from '~/server/api/routers/ranking'
import { recommendationRouter } from '~/server/api/routers/recommendation'
import { runRouter } from '~/server/api/routers/run'
import { toolRouter } from '~/server/api/routers/tool'
import { userRouter } from '~/server/api/routers/user'
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

export const appRouter = createTRPCRouter({
  category: categoryRouter,
  tool: toolRouter,
  llm: llmRouter,
  prompt: promptRouter,
  run: runRouter,
  recommendation: recommendationRouter,
  match: matchRouter,
  ranking: rankingRouter,
  critic: criticRouter,
  comment: commentRouter,
  user: userRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
