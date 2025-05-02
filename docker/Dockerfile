# Use the official Node.js image as base
FROM node:22

# Install necessary build tools and libraries
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    libzmq3-dev \
    cmake

# Set working directory
WORKDIR /app
