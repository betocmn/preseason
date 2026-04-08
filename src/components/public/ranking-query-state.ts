type QueryState<T> = {
  data: T | undefined
  status: 'pending' | 'error' | 'success'
}

type QueryResolution<T> = { state: 'ready'; data: T } | { state: 'loading' } | { state: 'error' }

export function resolveFilteredQuery<T>({
  enabled,
  initialData,
  query,
}: {
  enabled: boolean
  initialData?: T
  query: QueryState<T>
}): QueryResolution<T> {
  if (!enabled) {
    if (initialData === undefined) {
      return { state: 'loading' }
    }

    return { state: 'ready', data: initialData }
  }

  if (query.data !== undefined) {
    return { state: 'ready', data: query.data }
  }

  if (query.status === 'error') {
    return { state: 'error' }
  }

  return { state: 'loading' }
}
