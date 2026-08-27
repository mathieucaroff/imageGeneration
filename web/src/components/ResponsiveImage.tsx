export function ResponsiveImage({
  thumbnailUrl,
  imageUrl,
  width,
  alt,
  className,
  sizes,
}: {
  thumbnailUrl?: string
  imageUrl?: string
  width: number
  alt: string
  className?: string
  sizes: string
}) {
  return (
    <img
      className={className}
      src={thumbnailUrl ?? imageUrl}
      srcSet={[thumbnailUrl && `${thumbnailUrl} 350w`, imageUrl && `${imageUrl} ${width}w`]
        .filter(Boolean)
        .join(", ")}
      sizes={sizes}
      alt={alt}
    />
  )
}
