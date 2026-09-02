import { useEffect, useState } from "react"

export function ResponsiveImage({
  thumbnailUrls = [],
  imageUrls = [],
  width,
  alt,
  className,
  sizes,
}: {
  thumbnailUrls?: string[]
  imageUrls?: string[]
  width: number
  alt: string
  className?: string
  sizes: string
}) {
  const [urlIndex, setUrlIndex] = useState(0)
  const thumbnailUrl = thumbnailUrls[urlIndex] ?? imageUrls[urlIndex]
  const imageUrl = imageUrls[urlIndex] ?? thumbnailUrls[urlIndex]
  const lastUrlIndex = Math.max(thumbnailUrls.length, imageUrls.length) - 1

  useEffect(() => setUrlIndex(0), [thumbnailUrls, imageUrls])

  return (
    <img
      className={className}
      decoding="async"
      loading="lazy"
      src={thumbnailUrl}
      srcSet={[thumbnailUrl && `${thumbnailUrl} 350w`, imageUrl && `${imageUrl} ${width}w`]
        .filter(Boolean)
        .join(", ")}
      sizes={sizes}
      alt={alt}
      onError={() => setUrlIndex((index) => (index < lastUrlIndex ? index + 1 : index))}
    />
  )
}
