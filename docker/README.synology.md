# Synology Docker OAuth Setup

This bundle runs ima2-gen on Synology NAS without an API key. It uses Codex OAuth
stored in a persistent `/data/codex/auth.json` file.

## DS918+

DS918+ uses an Intel Celeron J3455 CPU, so the Docker platform is `linux/amd64`.

## Build On The NAS

Copy this repository or the Docker bundle to the NAS, then run from the directory
that contains `Dockerfile`:

```sh
docker build --platform linux/amd64 -t ima2-gen:oauth .
```

## Run

Create the persistent data folder:

```sh
mkdir -p /volume1/docker/ima2-gen/data
```

Start with Compose:

```sh
docker compose -f docker-compose.synology.yml up -d
```

Open:

```text
http://NAS_IP:3333
```

## First OAuth Login

Run the Codex device login inside the container:

```sh
docker exec -it ima2-gen npx @openai/codex login --device-auth
```

Open the displayed OpenAI device-auth URL in Chrome and enter the code. The token
will be stored under:

```text
/volume1/docker/ima2-gen/data/codex/auth.json
```

Restart the container so the GPT OAuth proxy starts with the new auth file:

```sh
docker restart ima2-gen
```

## Why Restart After First Login?

ima2-gen starts the GPT OAuth proxy only when a Codex auth file exists. On the
first boot there is no auth file yet, so login creates it and a restart lets the
proxy pick it up. Later restarts keep working because the auth file is persisted
in the `/data` volume.

