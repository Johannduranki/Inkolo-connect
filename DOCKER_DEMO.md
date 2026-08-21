# Duranki Demo Docker Image

This Docker setup packages the working demo into one container.

It runs:

- The Duranki backend API inside the container on port `3000`.
- The Duranki frontend demo inside the container on port `4200`.
- Demo mode authentication, so you do not need a live database for the local demo image.

## 1. Install Docker Desktop

Install Docker Desktop for Windows from:

https://www.docker.com/products/docker-desktop/

After installing it, open Docker Desktop and wait until it says Docker is running.

## 2. Open the project folder

Open PowerShell and run:

```powershell
cd C:\Users\johan\Documents\Codex\2026-06-25\ca\inkolo-connect
```

## 3. Build the Docker image

Run:

```powershell
docker build -f Dockerfile.demo -t duranki-demo:latest .
```

This creates a Docker image called `duranki-demo`.

## 4. Start the demo

Run:

```powershell
docker run --rm -p 4200:4200 --name duranki-demo duranki-demo:latest
```

Then open:

```text
http://127.0.0.1:4200/login
```

## 5. Stop the demo

In the PowerShell window where Docker is running, press:

```text
Ctrl + C
```

## Alternative: Start with Docker Compose

You can also run:

```powershell
docker compose -f docker-compose.demo.yml up --build
```

To stop it:

```powershell
docker compose -f docker-compose.demo.yml down
```

## Important Note

This is a demo Docker image. It is made to show the full frontend and backend locally without needing MySQL.

For a real AWS production deployment, you should use a real database such as AWS RDS MySQL, production secrets, HTTPS, and a production domain.
