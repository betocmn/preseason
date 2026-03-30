'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import NextImage from 'next/image'
import * as React from 'react'

import { cn } from '~/lib/utils'

export function shouldOptimizeAvatarSrc(src: string | undefined) {
  return typeof src === 'string' && src.startsWith('/')
}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & { size?: number }
>(({ className, size = 40, src, alt, ...props }, ref) => {
  const imageSrc = typeof src === 'string' ? src : undefined

  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={imageSrc}
      className={cn('aspect-square h-full w-full', className)}
      asChild
      {...props}
    >
      <NextImage
        src={imageSrc ?? ''}
        alt={alt ?? ''}
        width={size}
        height={size}
        // Only local assets go through Next's optimizer; user-supplied remote avatars stay client-fetched.
        unoptimized={!shouldOptimizeAvatarSrc(imageSrc)}
      />
    </AvatarPrimitive.Image>
  )
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
