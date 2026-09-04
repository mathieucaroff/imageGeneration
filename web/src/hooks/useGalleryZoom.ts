import { useEffect, useRef, useState } from "react"
import { clamp } from "../utils"

export function useGalleryZoom() {
  const [zoom, setZoom] = useState(260)
  const galleryRef = useRef<HTMLDivElement>(null)
  const zoomIsAdjusted = galleryRef.current
    ? zoom === computeZoom(galleryRef.current.clientWidth, zoom, 0)
    : false

  function layoutClampZoom(value: number) {
    const maximum = Math.min(900, galleryRef.current?.clientWidth ?? 900)
    return clamp(value, 30, maximum)
  }

  function adjustZoom(direction: -1 | 0 | 1) {
    setZoom((currentZoom) => {
      const value = galleryRef.current
        ? computeZoom(galleryRef.current.clientWidth, currentZoom, direction)
        : currentZoom + direction * 10
      return layoutClampZoom(value)
    })
  }

  useEffect(() => {
    const handleResize = () => {
      if (zoomIsAdjusted) adjustZoom(0)
      else setZoom((current) => layoutClampZoom(current))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [zoomIsAdjusted])

  return {
    zoom,
    setZoom: (value: number) => setZoom(layoutClampZoom(value)),
    zoomIsAdjusted,
    adjustZoom,
    galleryRef,
  }
}

function computeZoom(width: number, currentZoom: number, direction: number) {
  const floorCount = Math.floor(width / currentZoom)
  return Math.floor(width / (floorCount - direction) - 0.01)
}
