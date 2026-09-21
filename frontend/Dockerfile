# Use a minimal Node.js image for serving the application
FROM node:lts-slim

# Set the working directory inside the container
WORKDIR /app

# Install a lightweight static file server globally
RUN npm install -g serve

# Copy the build output from the builder stage
COPY dist/ /app/

# Expose port 80
EXPOSE 80

# Start the application using the static file server
CMD ["serve", "-s", "/app", "-l", "80"]
