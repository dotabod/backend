declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TWITCH_ACCESS_TOKEN: string
      TWITCH_REFRESH_TOKEN: string
      TWITCH_CLIENT_ID: string
      TWITCH_CLIENT_SECRET: string
      TWITCH_USERNAME: string
      DB_PASS: string
      DB_URL: string
      DB_SECRET: string
      DB_PUB: string
      DB_JWTSECRET: string
      STEAM_WEB_API: string
      MAIN_PORT: string
      GITHUB_AUTH_TOKEN: string
      NODE_ENV: 'development' | 'production'
    }
  }
}
export {}
