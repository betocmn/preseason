import { timingSafeEqual } from 'node:crypto'

function getBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authorizationHeader.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

function timingSafeTokenEqual(receivedToken: string, expectedToken: string) {
  const receivedBuffer = Buffer.from(receivedToken)
  const expectedBuffer = Buffer.from(expectedToken)

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer)
}

export function isCronRequestAuthorized(request: Request, expectedToken: string | undefined) {
  if (!expectedToken) {
    return false
  }

  const receivedToken = getBearerToken(request.headers.get('authorization'))
  if (!receivedToken) {
    return false
  }

  return timingSafeTokenEqual(receivedToken, expectedToken)
}
