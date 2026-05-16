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

# Build the production application
RUN npm run build

# Expose the dynamic port Cloud Run expects
EXPOSE 8080

# Configure environment fallback variable and launch via node production handler
ENV PORT=8080
# Inject the runtime GEMINI_API_KEY into the built index.html before starting the server
CMD ["sh", "-c", "sed -i \"s|<head>|<head><script>window.GEMINI_API_KEY='$GEMINI_API_KEY'</script>|g\" dist/index.html && npm run preview"]