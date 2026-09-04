import { useState, type CSSProperties, type FormEvent, type PointerEvent } from "react"
import { api } from "./api"
import { AppReadOnly } from "./AppReadOnly"
import { IconButton } from "./components/IconButton"
import { Fleet } from "./Fleet"
import { Gallery } from "./Gallery"
import { GenerationPanel } from "./GenerationPanel"
import { Login } from "./Login"
import { StudioHeader } from "./StudioHeader"
import { clamp, randomSeed } from "./utils"
import { useGalleryZoom } from "./hooks/useGalleryZoom"
import { useGenerationConfig } from "./hooks/useGenerationConfig"
import { useStudio } from "./hooks/useStudio"

export function App() {
  const generation = useGenerationConfig()
  const { continuous, setContinuous, instanceId, setInstanceId } = generation
  const studio = useStudio({ continuous, setContinuous, instanceId, setInstanceId })
  const { zoom, setZoom, zoomIsAdjusted, adjustZoom, galleryRef } = useGalleryZoom()
  const [generationPanelRetracted, setGenerationPanelRetracted] = useState(false)
  const [generationPanelWidth, setGenerationPanelWidth] = useState(380)
  const [previewToOpen, setPreviewToOpen] = useState<GalleryPreview>()
  function generate(event: FormEvent) {
    event.preventDefault()
    if (instanceId === "") {
      studio.setError("Choose a ready instance first.")
      return
    }
    const jobSeed = generation.randomizedSeed ? randomSeed() : generation.seed
    if (jobSeed === "") {
      studio.setError("Enter a seed or enable randomized mode.")
      return
    }
    void studio.submit({
      prompt: generation.prompt,
      negative_prompt: generation.negative,
      width: generation.width,
      height: generation.height,
      seed: jobSeed,
      instanceId,
    })
  }

  function resizeGenerationPanel(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const viewportWidth = window.innerWidth
    const interpolation = clamp((viewportWidth - 800) / 600, 0, 1)
    const maximumWidth = viewportWidth * (0.75 - interpolation * 0.25)
    setGenerationPanelWidth(clamp(event.clientX, 310, maximumWidth))
  }

  if (studio.authenticated === null)
    return (
      <div className="grid min-h-screen place-content-center bg-[#151714] font-['DM_Mono'] text-xs text-[#cfdc6a]">
        Loading studio...
      </div>
    )
  if (!studio.authenticated)
    return (
      <Login
        onLogin={(session) => {
          studio.setAuthenticated(session.authenticated)
          studio.setUsername(session.username)
          studio.setReadOnly(session.readOnly)
          void studio.refresh()
        }}
      />
    )

  if (studio.readOnly)
    return (
      <AppReadOnly
        username={studio.username}
        onSignOut={() =>
          void api("/auth/logout", { method: "POST" }).then(() => studio.setAuthenticated(false))
        }
      />
    )

  const readyCount = studio.instances.filter((instance) => instance.ready).length
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_78%_0%,#263127_0,transparent_31rem),#151714] font-['DM_Sans'] text-[#e9e5dc]">
      <StudioHeader
        zoom={zoom}
        zoomIsAdjusted={zoomIsAdjusted}
        readyCount={readyCount}
        onZoom={setZoom}
        onAdjustZoom={adjustZoom}
        onSignOut={() => {
          setContinuous(false)
          void api("/auth/logout", { method: "POST" }).then(() => studio.setAuthenticated(false))
        }}
      />
      <div
        className={`grid min-h-[calc(100vh-68px)] ${generationPanelRetracted ? "md:grid-cols-[40px_1fr]" : "md:grid-cols-[var(--generation-panel-width)_8px_minmax(0,1fr)]"}`}
        style={{ "--generation-panel-width": `${generationPanelWidth}px` } as CSSProperties}
      >
        <GenerationPanel
          prompt={generation.prompt}
          negative={generation.negative}
          width={generation.width}
          height={generation.height}
          seed={generation.seed}
          randomizedSeed={generation.randomizedSeed}
          lastPreview={studio.lastPreview}
          onOpenPreview={setPreviewToOpen}
          continuous={continuous}
          generationDisabled={
            !studio.instances.some((instance) => instance.id === instanceId && instance.ready)
          }
          retracted={generationPanelRetracted}
          busy={studio.busy}
          error={studio.error}
          onPrompt={generation.setPrompt}
          onNegative={generation.setNegative}
          onWidth={generation.setWidth}
          onHeight={generation.setHeight}
          onSeed={generation.setSeed}
          onRandomizedSeed={(enabled) => {
            generation.setRandomizedSeed(enabled)
            generation.setSeed(enabled ? "" : randomSeed())
          }}
          onContinuous={setContinuous}
          onRetract={() => setGenerationPanelRetracted(true)}
          onSubmit={generate}
        />
        {!generationPanelRetracted && (
          <div
            aria-label="Resize generation panel"
            className="hidden cursor-col-resize touch-none border-r border-[#30332e] bg-[#191c18] outline-none hover:bg-[#30332e] focus-visible:bg-[#30332e] md:block"
            role="separator"
            tabIndex={0}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={resizeGenerationPanel}
          />
        )}
        {generationPanelRetracted && (
          <aside className="hidden border-r border-[#30332e] bg-[#191c18] md:sticky md:top-[68px] md:flex md:h-[calc(100vh-68px)] md:justify-center md:pt-4">
            <IconButton
              className="text-lg"
              title="Expand generation panel"
              onClick={() => setGenerationPanelRetracted(false)}
            >
              ›
            </IconButton>
          </aside>
        )}
        <div className="min-w-0">
          <div className="px-3 md:px-8">
            <Fleet
              instances={studio.instances}
              now={studio.now}
              instanceId={instanceId}
              onInstance={setInstanceId}
              onAction={studio.instanceAction}
            />
          </div>
          <Gallery
            jobs={studio.jobs}
            jobsLoaded={studio.firstJobsLoaded}
            now={studio.now}
            zoom={zoom}
            onRefresh={studio.refresh}
            onFail={studio.failJob}
            onSendConfig={(config) => void studio.submit({ ...config, seed: randomSeed() })}
            onHoverPreview={studio.setLastPreview}
            previewToOpen={previewToOpen}
            onPreviewOpened={() => setPreviewToOpen(undefined)}
            galleryRef={galleryRef}
          />
        </div>
      </div>
    </div>
  )
}
