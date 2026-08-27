import { useState } from "react"
import { IconButton } from "../components/IconButton"

export function CopyImageButton({ imageUrl }: { imageUrl?: string }) {
  const [isCopying, setIsCopying] = useState(false)

  async function copyImage() {
    if (!imageUrl) return
    setIsCopying(true)
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error("Could not fetch image")
      const image = await createImageBitmap(await response.blob())
      try {
        const canvas = new OffscreenCanvas(image.width, image.height)
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Could not create image canvas")
        context.drawImage(image, 0, 0)
        const png = await canvas.convertToBlob({ type: "image/png" })
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
      } finally {
        image.close()
      }
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <IconButton
      aria-label="Copy full-size image"
      disabled={!imageUrl || isCopying}
      title="Copy full-size image"
      onClick={() => void copyImage()}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        ⧉
      </span>
    </IconButton>
  )
}
