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
- instanceId (defaults to the lowest ready instance id or 1 if there is none)

The following generation parameters will be fixed, with the following values:

- steps = 25
- cfg = 7
- sampler = "euler_ancestral", // K_EULER_A in ComfyUI's naming
- scheduler = "karras"

### Re-send

It will allow to re-send a config with an automatically changed seed. When this
happens, the generated images are stacked horizontally, until they reach the
right end of the page, they are then allowed to flow down, under the prompt.

### Zoom

There will be a precise zoom slider allowing to set the size of the square tiles
containing the images. It will go from a side 30px to 900px

### Diffs

Each that appear after the first will be compared to the previsous one.

If width, height or seed are modified between two gens, they will appear green.

All words that have been added to the prompt or the negative prompt will appear
in green. All words that are no longer part of one of these text blocks will
appear at the end, in red, with a minus sign in front. Finally, the attention
modifiers `(x)`, `((x))`, `(x:1.4)`, `(x:0.7)`, if they change increasing or
decreasing, they will appear in green too.

## Server

### Instance status, creation, stopping and deletion

The server will expose api endpoints to:

- status: allow the frontend to know how many instances are present and what their state are.
- start: spin up an existing, stopped instance
- provisionning: spin up a new instance
- stopping: stop an existing instance, or delete it if its rates exceed the threshold
- deletion: delete an existing instance
- delete-all: delete all existing instances

### Image creation job

The server will expose api endpoints to:

- Trigger a generation job
- List known jobs:
  - config used for each jobs
  - status of the job, one of:
    - `queued`+position in the queue (number of queued jobs before this job)
    - `running`+time elapsed since it started to be generated+uploaded to R2
    - `completed`+URL of the image
    - `failed`+message/reason for failure
  - URL of the image on Cloudflare R2 if the generation has finished and the
    image has been uploaded
