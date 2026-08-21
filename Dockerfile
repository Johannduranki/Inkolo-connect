# Use Node.js base image
FROM node:18

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy backend code
COPY backend ./

# Expose the port
EXPOSE 3001

# Start the server
CMD ["node", "src/server.js"]
