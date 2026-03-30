'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import NextImage from 'next/image'
import * as React from 'react'

import { cn } from '~/lib/utils'

type AvatarImageLoadingStatus = 'idle' | 'loading' | 'loaded' | 'error'

type AvatarImageStatusContextValue = {
  imageLoadingStatus: AvatarImageLoadingStatus
  setImageLoadingStatus: React.Dispatch<React.SetStateAction<AvatarImageLoadingStatus>>
}

const AvatarImageStatusContext = React.createContext<AvatarImageStatusContextValue | null>(null)

export function shouldOptimizeAvatarSrc(src: string | undefined) {
  return typeof src === 'string' && src.startsWith('/')
}

function useAvatarImageStatusContext(componentName: string) {
  const context = React.useContext(AvatarImageStatusContext)

  if (!context) {
    throw new Error(`${componentName} must be used within Avatar`)
  }

  return context
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => {
  const [imageLoadingStatus, setImageLoadingStatus] =
    React.useState<AvatarImageLoadingStatus>('idle')

  return (
    <AvatarImageStatusContext.Provider
      value={{
        imageLoadingStatus,
        setImageLoadingStatus,
      }}
    >
      <AvatarPrimitive.Root
        ref={ref}
        className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
        {...props}
      />
    </AvatarImageStatusContext.Provider>
  )
})
Avatar.displayName = AvatarPrimitive.Root.displayName

type AvatarImageProps = Omit<
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>,
  'alt' | 'height' | 'src' | 'width'
> & {
  alt?: string
  size?: number
  src?: string
}

const AvatarImage = React.forwardRef<React.ElementRef<typeof NextImage>, AvatarImageProps>(
  ({ className, size = 40, src, alt, onLoad, onError, onLoadingStatusChange, ...props }, ref) => {
    const { imageLoadingStatus, setImageLoadingStatus } = useAvatarImageStatusContext('AvatarImage')
    const imageSrc = typeof src === 'string' ? src : undefined

    const updateLoadingStatus = React.useCallback(
      (status: AvatarImageLoadingStatus) => {
        setImageLoadingStatus(status)
        onLoadingStatusChange?.(status)
      },
      [onLoadingStatusChange, setImageLoadingStatus],
    )

    React.useEffect(() => {
      updateLoadingStatus(imageSrc ? 'loading' : 'error')

      return () => {
        setImageLoadingStatus('idle')
      }
    }, [imageSrc, setImageLoadingStatus, updateLoadingStatus])

    if (!imageSrc) {
      return null
    }

    return (
      <NextImage
        ref={ref}
        src={imageSrc}
        className={cn(
          'absolute inset-0 aspect-square h-full w-full',
          imageLoadingStatus === 'loaded' ? 'opacity-100' : 'opacity-0',
          className,
        )}
        alt={alt ?? ''}
        width={size}
        height={size}
        onLoad={(event) => {
          onLoad?.(event)
          updateLoadingStatus('loaded')
        }}
        onError={(event) => {
          onError?.(event)
          updateLoadingStatus('error')
        }}
        {...props}
        // Only local assets go through Next's optimizer; user-supplied remote avatars stay client-fetched.
        unoptimized={!shouldOptimizeAvatarSrc(imageSrc)}
      />
    )
  },
)
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, delayMs, ...props }, ref) => {
  const { imageLoadingStatus } = useAvatarImageStatusContext('AvatarFallback')
  const [canRender, setCanRender] = React.useState(delayMs === undefined)

  React.useEffect(() => {
    if (delayMs === undefined) return

    setCanRender(false)
    const timerId = window.setTimeout(() => setCanRender(true), delayMs)
    return () => window.clearTimeout(timerId)
  }, [delayMs])

  if (!canRender || imageLoadingStatus === 'loaded') {
    return null
  }

  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-muted',
        className,
      )}
      {...props}
    />
  )
})
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
