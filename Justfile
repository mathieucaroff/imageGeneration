set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]
default:
    @just --list
dev:
    cd server && bun run --env-file=../.env --watch src/server.ts &
    cd web && bunx vite
server:
    cd server && bun run --env-file=../.env --watch src/server.ts
web:
    cd web && bunx vite
build:
    cd web && bunx tsc -b && bunx vite build
tsc:
    bunx tsc -b
tscserver:
    cd server && bunx tsc -b
tscweb:
    cd web && bunx tsc -b
start:
    cd server && bun run --env-file=../.env src/server.ts
lint:
    cd web && bunx oxlint
preview:
    cd web && bunx vite preview
status:
    bun run script/status.ts
provision:
    bun run script/provision-rtx4090.ts
blacklist machine_id:
    bun run script/blacklist.ts {{machine_id}}
ssh *args:
    bun run script/ssh.ts {{args}}
generate *args:
    bun run script/generate.ts {{args}}
idle-stop *args:
    bun run script/idle-stop.ts {{args}}
stop-all:
    bun run script/stop-all.ts
delete-all:
    bun run script/delete-all.ts