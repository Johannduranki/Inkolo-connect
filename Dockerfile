# Use Node.js base image
FROM node:24-bookworm-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json /usr/src/package.json
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy backend code
COPY backend ./
COPY frontend/public /usr/src/frontend/public

# Verify the MariaDB driver and shared policy modules without a database connection.
RUN node --input-type=module -e "import mysql from 'mysql2/promise'; import { resolveCommunityConfiguration } from '../frontend/public/tenant-service-policy.js'; import { memberCapabilities } from '../frontend/public/member-service-catalogue.js'; if (typeof mysql.createPool !== 'function' || typeof resolveCommunityConfiguration !== 'function' || !memberCapabilities) process.exit(1);"

# Expose the port
EXPOSE 3001

# Start the server
CMD ["node", "src/server.js"]
