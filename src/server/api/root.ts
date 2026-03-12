import { benchmarkAdminRouter } from '~/server/api/routers/benchmark-admin'
import { benchmarkMatchRouter } from '~/server/api/routers/benchmark-match'
import { benchmarkRankingRouter } from '~/server/api/routers/benchmark-ranking'
import { categoryRouter } from '~/server/api/routers/category'
import { commentRouter } from '~/server/api/routers/comment'
import { criticRouter } from '~/server/api/routers/critic'
import { llmRouter } from '~/server/api/routers/llm'
import { promptRouter } from '~/server/api/routers/prompt'
import { toolRouter } from '~/server/api/routers/tool'
import { userRouter } from '~/server/api/routers/user'
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

export const appRouter = createTRPCRouter({
  benchmarkAdmin: benchmarkAdminRouter,
  category: categoryRouter,
  tool: toolRouter,
  llm: llmRouter,
  prompt: promptRouter,
  benchmarkRanking: benchmarkRankingRouter,
  benchmarkMatch: benchmarkMatchRouter,
  critic: criticRouter,
  comment: commentRouter,
  user: userRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
