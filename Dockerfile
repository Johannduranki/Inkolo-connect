# Use Node.js base image
FROM node:18

# Set working directory to backend folder
WORKDIR /usr/src/app

# Copy only backend-specific files
COPY /package*.json ./

# Install backend dependencies
RUN npm install



# Copy the entire backend code
COPY /backend ./

# # Copy the Angular dist folder (assumes it’s built already)
# COPY dist/frontend ../dist/frontend

# Expose the port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
