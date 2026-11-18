# Backend de PymeCore. La misma imagen corre como local (MODO=edge) o como nube (MODO=cloud).
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@10.34.4 --activate && apk add --no-cache postgresql-client
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate && pnpm build
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/demo-entrypoint.sh"]
