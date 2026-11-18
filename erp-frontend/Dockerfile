FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=http://localhost:3000
RUN VITE_API_URL=$VITE_API_URL pnpm exec vite build
EXPOSE 8001
CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "8001", "--strictPort"]
