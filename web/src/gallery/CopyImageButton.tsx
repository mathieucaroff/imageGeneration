import { useState } from "react"
import { IconButton } from "../components/IconButton"

export function CopyImageButton({ imageUrls = [] }: { imageUrls?: string[] }) {
  const [isCopying, setIsCopying] = useState(false)

  async function copyImage() {
    if (!imageUrls.length) return
    setIsCopying(true)
    try {
      for (const imageUrl of imageUrls) {
        try {
          const response = await fetch(imageUrl)
          if (!response.ok) continue
          const image = await createImageBitmap(await response.blob())
          try {
            const canvas = new OffscreenCanvas(image.width, image.height)
            const context = canvas.getContext("2d")
            if (!context) throw new Error("Could not create image canvas")
            context.drawImage(image, 0, 0)
            const png = await canvas.convertToBlob({ type: "image/png" })
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
            return
          } finally {
            image.close()
          }
        } catch {
          // Try the next configured public image URL.
        }
      }
      throw new Error("Could not fetch image")
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <IconButton
      aria-label="Copy full-size image"
      disabled={!imageUrls.length || isCopying}
      title="Copy full-size image"
      onClick={() => void copyImage()}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        ⧉
      </span>
    </IconButton>
  )
}
