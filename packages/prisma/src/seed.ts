import { faker } from "@faker-js/faker"
import { PrismaClient as PrismaPsql } from "@dotabod/prisma/dist/psql/index.js"

const prisma = new PrismaPsql()

const usedProviderAccountIds = new Set()

function generateUniqueProviderAccountId(): string {
  let id
  do {
    id = faker.number.int({ min: 50_000, max: 900_000 })
  } while (usedProviderAccountIds.has(id))
  usedProviderAccountIds.add(id)
  return id.toString()
}

async function main() {
  for (let i = 0; i < 100; i++) {
    // Seed User data
    const username = faker.internet.userName()
    const user = await prisma.user.create({
      data: {
        stream_online: faker.datatype.boolean({ probability: 0.75 }),
        beta_tester: faker.datatype.boolean({ probability: 0.1 }),
        stream_start_date: faker.date.recent(),
        locale: faker.helpers.arrayElement(["en", "ru-RU"]),
        email: faker.internet.email(),
        mmr: faker.number.int({ min: 0, max: 10_000 }),
        followers: faker.number.int({ min: 0, max: 800_000 }),
        name: username.toLowerCase(),
        displayName: username,
      },
    })

    // Seed Account data
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "twitch",
        token_type: "bearer",
        scope:
          "channel:manage:polls channel:manage:predictions channel:read:polls channel:read:predictions openid user:read:email",
        providerAccountId: generateUniqueProviderAccountId(),
        refresh_token: faker.string.alphanumeric(30),
        access_token: faker.string.alphanumeric(30),
        expires_at: faker.date.future().getTime(),
        expires_in: faker.number.int({ min: 1000, max: 10000 }),
        requires_refresh: faker.datatype.boolean({ probability: 0.1 }),
      },
    })

    // Seed Setting data
    await prisma.setting.create({
      data: {
        key: "theme",
        value: { selected: faker.helpers.arrayElement(["dark", "light"]) },
        userId: user.id,
      },
    })

    const steam32Id = Number(generateUniqueProviderAccountId())

    // Seed SteamAccount data
    await prisma.steamAccount.create({
      data: {
        steam32Id: steam32Id,
        userId: user.id,
        name: faker.internet.userName(),
        mmr: faker.number.int({ min: 0, max: 10_000 }),
        leaderboard_rank: faker.number.int({ min: 1, max: 5000 }),
      },
    })

    for (let i = 0; i < faker.number.int(50); i++) {
      // Seed Bet data
      await prisma.bet.create({
        data: {
          matchId: `${faker.number.int({ min: 700_000, max: 1_000_000 })}`,
          predictionId: faker.string.uuid(),
          userId: user.id,
          won: faker.datatype.boolean({ probability: 0.5 }),
          myTeam: faker.helpers.arrayElement(["dire", "radiant"]),
          lobby_type: faker.helpers.arrayElement([0, 7]),
          steam32Id: steam32Id,
          is_party: faker.datatype.boolean({ probability: 0.1 }),
          hero_slot: faker.number.int({ min: 0, max: 9 }),
          is_doubledown: faker.datatype.boolean({ probability: 0.1 }),
          radiant_score: faker.number.int({ min: 0, max: 50 }),
          dire_score: faker.number.int({ min: 0, max: 50 }),
          kda: {
            kills: faker.number.int({ min: 0, max: 50 }),
            deaths: faker.number.int({ min: 0, max: 50 }),
            assists: faker.number.int({ min: 0, max: 50 }),
          },
          hero_name: faker.helpers.arrayElement([
            "npc_dota_hero_antimage",
            "npc_dota_hero_axe",
            "npc_dota_hero_bane",
          ]),
        },
      })
    }
  }

  console.log("Seeding finished.")
}
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
