# Specification

## Usage pattern

I'll be using the environment for 5 to 20 minutes every one to two hours when I'm up.

My timezone is that of Paris.

## Plateform choice

The Vast.AI plateform will be used to source the computation power required to produce the images

## Web user interface

The web user interface will connect to the server to send generation configs, to
be generated

### Generation configs

The user interface will give the user control over the config:

- prompt (mandatory)
- negative_prompt, default value: "score_4, score_5, score_6, worst quality, low quality, blurry"
- width, default value: 1024
- height, default value: 1024
- seed, default value: Math.floor(Math.random() * 2 ** 32)
- instanceId (optional; when omitted, the server selects the lowest ready instance)

The following generation parameters are not changeable in the frontend, but are
part of every submitted and stored config:

- steps, fixed value: 25
- cfg, fixed value: 7
- sampler, fixed value: "euler_ancestral" (K_EULER_A in ComfyUI's naming)
- scheduler, fixed value: "karras"
- denoise, fixed value: 1
- model/checkpoint, fixed value: the configured Pony Diffusion V6 XL checkpoint

This version supports text-to-image only. Img2img, batch generation, multiple
output images, model selection, LoRA selection, and job cancellation are out of
scope.

The server validates the prompt and all numeric values before creating a job.
Invalid requests are rejected. `instanceId` is mandatory and a job cannot be
created unless the selected instance is ready.

### Authentication

The website is for one user. The login page accepts a password, which the
server compares with the `PASSWORD` environment variable. The server creates
an authenticated session after a successful login. All website API endpoints,
including image/job metadata and instance controls, require that session.

Generated image and thumbnail URLs are public because the files are public on
the S3-compatible Cloudflare R2 storage. The password is never stored in the
browser or returned by the API.

### Re-send

The UI will allow a config to be re-sent with an automatically changed seed.
The re-send creates another job in the normal queue; it does not jump ahead of
earlier jobs. Its resulting image belongs to the same visual image block as
the original send. Images in that block share a pastelle background color that
is obtained with a deterministic random resulting from hashing config.

Copy-pasting or otherwise manually recreating a past config is a new send, not
a re-send. It starts a new image block, which can subsequently grow through
the re-send action.

### Zoom

There will be a precise zoom slider allowing to set the size of the square tiles
containing the images. It will go from a side 30px to 900px. The zoom value is
global for the page/session and applies to all image blocks. Image tiles keep a
stable square size while loading, displaying errors, or changing zoom.

### Diffs

Each new send will be compared with the previous send, excluding re-sends from
that comparison. The first send has no diff. A new block created by manually
copying a past config is compared with the immediately preceding manual/new
send, not with the source config that was copied.

If width, height, seed, or another stored generation setting changes between
compared sends, the changed value appears green.

Prompts are tokenized as comma-separated Stable Diffusion tags, with whitespace
trimmed while preserving the tag text. This suits the Pony prompt style and
keeps multi-word tags together. Added tags appear in green. Tags removed from
the previous prompt appear at the end in red with a minus sign. If a can is
moved to a different position, it will not be considered deleted or created but
just as an unchanged tag. Prompt and negative_prompt are diffed independently.

Attention syntax is parsed within each tag. Parentheses increase attention and
`(tag:weight)` uses its explicit weight; nested parentheses and explicit
weights are normalized to an effective weight for comparison. A changed
effective weight is shown as a green change. Malformed attention syntax falls
back to ordinary tag comparison.

## Server

### Instance status, creation, stopping and deletion

The server will expose api endpoints to:

- status: allow the frontend to know how many instances are present and what their state are.
- start: spin up an existing, stopped instance
- provisioning: spin up a new instance
- stopping: stop an existing instance, or delete it if its rates exceed the threshold
- deletion: delete an existing instance
- stop-all: stop all eligible instances
- delete-all: delete all existing instances

The start action is offered only for stopped, provisioned instances. Stop-all
and delete-all require a confirmation modal before the action is sent; delete-all
does not require an additional authentication step or audit log.

The instance status includes enough information for the UI to distinguish
provisioning, starting, ready/running, stopped, stopping, deleting, and failed
states. A ready instance means that the server can reach its ComfyUI endpoint
and it is able to accept a generation job.

Instance activity is recorded when an instance becomes ready, when a new job is
queued on it, when a job finishes successfully, and when a job fails. This
activity drives the existing idle-stop policy and is not updated by ordinary UI
polling or by viewing an image.

### Image creation job

The server will expose api endpoints to:

- Trigger a generation job. The request returns a stable job ID and the
  accepted config. The request is rejected if no selected/eligible instance is
  ready.
- List known jobs:
  - exact config used for each job
  - status of the job, one of:
    - `queued`+position in the queue (number of queued jobs before this job)
    - `running`+time elapsed since generation/upload processing started
    - `completed`+URL of the image and thumbnail
    - `failed`+message/reason for failure
  - timestamps and the selected instance ID where applicable

Jobs are processed first-emitted, first-generated. Re-sends use this same
queue. There is no cancellation endpoint in this version.

The UI receives job state changes using Server-Sent Events. It also refreshes
from the list endpoint after login and can recover from a disconnected event
stream by polling the list endpoint.

### Config and image storage

Immediately after the NVIDIA instance finishes generating an image, the server
downloads it from ComfyUI, converts it to a high-compression WebP image, and
uploads it to Cloudflare R2. The server also creates and uploads a 350x350px
thumbnail, preserving the original aspect ratio inside the square thumbnail.
The thumbnail inherits the original filename with `.thumb` before the
extension, for example:

`2026-08-16T00-31-05B--pony_00001_.thumb.webp`

The accepted config is stored as text in R2 beside the image, using the same
base filename and a `.config` extension. It includes prompt, negative_prompt,
width, height, seed, instanceId, steps, cfg, sampler, scheduler, denoise, and
model/checkpoint, including values that are fixed in the frontend. It records
the submitted values as well as the resolved instance ID and resolved seed when
those were selected by the server.

The image, thumbnail, and config are uploaded before the job is marked
`completed`. This version expects exactly one output image per job; an unexpected
number of outputs marks the job `failed`. A conversion or upload failure also
marks the job `failed`, even if ComfyUI successfully generated the source image.
The server is responsible for retrying transient R2 operations within the job
timeout.

Embedding the generation config in the WebP metadata is desirable and should
be implemented if supported directly by the chosen conversion library without
adding significant complexity. The R2 `.config` file remains the authoritative
metadata even when embedded metadata is present.

No automatic image retention or deletion policy is required. The user may
manually delete images, thumbnails, and config files from storage.

The server uses generic S3-compatible environment variable names so the storage
provider can be changed without changing the application:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PUBLIC_URL`

Cloudflare R2 is the current provider, but these names are not specific to R2.

### Responsive image view

The image area uses a responsive wrapping grid sized by the global zoom value.
On narrow screens it wraps to the viewport width without horizontal page
scrolling; on larger screens it uses the available content width. Loading and
failed jobs occupy the same tile dimensions as completed images, and failed
jobs expose their error and a retry action that creates a new normal-priority
job.
