# Use an official Node.js runtime as a base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Give TypeScript more heap during build
ENV NODE_OPTIONS=--max-old-space-size=4096

# Compile TypeScript to JavaScript
RUN npm run build

# Expose port (default to 3001 unless overridden)
EXPOSE 3001

# Set environment variables at runtime if needed
ENV NODE_ENV=production

# Run the compiled app
CMD ["node", "dist/scalekit.js"]
