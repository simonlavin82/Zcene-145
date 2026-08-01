# Use the official lightweight Node image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build step removed to ensure bundle hashes match Firebase Hosting exact deploy
# Expose the dynamic port Cloud Run expects
EXPOSE 8080

# Configure environment fallback variable and launch via node production handler
ENV PORT=8080
# Launch via node production handler (which now includes the API proxy)
CMD ["node", "server.js"]