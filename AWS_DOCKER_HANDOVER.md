# Duranki AWS Docker Handover

This package is for a developer who will publish the full Duranki web app on AWS.

The app runs as one Docker container:

- Angular frontend is built during the Docker build.
- Node/Express backend runs on port `3000`.
- The backend serves the frontend files from `frontend/dist`.
- MySQL should run outside the container, preferably on AWS RDS.

## Files To Send To The Developer

Send the full project folder, especially these files:

- `Dockerfile.aws`
- `.env.aws.example`
- `docker-compose.aws.example.yml`
- `backend/`
- `frontend/`
- `package.json`

The developer should not use `Dockerfile.demo` for production. That file is only for local demo mode.

## Required AWS Services

Use these AWS services for a normal production deployment:

- **AWS ECR** to store the Docker image.
- **AWS ECS Fargate**, **AWS App Runner**, or **Elastic Beanstalk Docker** to run the container.
- **AWS RDS MySQL** for the database.
- **AWS Secrets Manager** or platform environment variables for secrets.
- **Application Load Balancer** or App Runner domain mapping for HTTPS.
- **Route 53** or your domain registrar DNS to point the domain to AWS.

## Production Environment Variables

Create production values based on `.env.aws.example`.

Required variables:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `ID_PEPPER`
- `JWT_SECRET`
- `FRONTEND_ORIGIN`
- `FRONTEND_ORIGINS`
- `ALLOW_DEMO_AUTH=false`
- `FORCE_DEMO_MODE=false`

Use strong secrets for `ID_PEPPER` and `JWT_SECRET`. Do not reuse the local demo values.

## Local Build Test

From the project folder:

```powershell
cd C:\Users\johan\Documents\Codex\2026-06-25\ca\inkolo-connect
docker build -f Dockerfile.aws -t duranki-web:aws .
```

To test locally with environment variables:

```powershell
docker compose -f docker-compose.aws.example.yml up --build
```

Then open:

```text
http://127.0.0.1:3000/login
```

For this local production-style test, `.env.aws.example` must contain a reachable MySQL database.

## AWS Build And Push Example

The developer can build and push to Amazon ECR like this:

```bash
aws ecr create-repository --repository-name duranki-web
aws ecr get-login-password --region af-south-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com
docker build -f Dockerfile.aws -t duranki-web:latest .
docker tag duranki-web:latest ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com/duranki-web:latest
docker push ACCOUNT_ID.dkr.ecr.af-south-1.amazonaws.com/duranki-web:latest
```

Replace `ACCOUNT_ID` with the AWS account ID.

## Container Settings

Use these container settings in AWS:

- Container port: `3000`
- Health check path: `/api/health`
- CPU: start with `0.5 vCPU`
- Memory: start with `1 GB`
- Desired count: `1` for demo, `2` for production high availability

## Database Setup

Create an AWS RDS MySQL database.

Recommended starting settings:

- Engine: MySQL 8
- Database name: `duranki_production`
- Port: `3306`
- Public access: disabled where possible
- Security group: allow inbound MySQL only from the app service security group

When the container starts, it runs:

```bash
npm --prefix backend run migrate
```

This creates and updates the database tables automatically.

## Domain And HTTPS

Point the domain to the AWS service:

- With App Runner: use App Runner custom domain mapping.
- With ECS: point the domain to the Application Load Balancer.
- With Elastic Beanstalk: point the domain to the Beanstalk load balancer.

Use HTTPS with an AWS Certificate Manager certificate.

Set:

```text
FRONTEND_ORIGIN=https://www.your-domain.co.za
FRONTEND_ORIGINS=https://www.your-domain.co.za,https://your-domain.co.za
```

## Important Production Notes

- Do not enable `ALLOW_DEMO_AUTH` in production.
- Do not enable `FORCE_DEMO_MODE` in production.
- Store secrets in AWS, not inside the Docker image.
- Uploads are stored in `/app/uploads`. For production, the developer should move uploads to S3 or mount persistent storage.
- The Docker image exposes only port `3000`; the frontend is served by the backend.
